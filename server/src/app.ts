import express, { type Request, type Response, type NextFunction } from 'express'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import type { DatabaseSync } from 'node:sqlite'
import {
  openDatabase,
  readSettings,
  writeSetting,
  logEvent,
  controlNumber,
  DEFAULT_SETTINGS,
  type Allocation,
  type Attestation,
} from './db.ts'
import {
  searchAllocations,
  literalSearchNote,
  filterByStatus,
  filterNote,
  sortAllocations,
  SORT_LABELS,
  spendMicros,
  utilisation,
  nagBody,
  nextNagTier,
  phraseMatches,
  SECONDARY_PHRASE,
  type SortKey,
  type SearchMode,
  type FilterInterpretation,
} from './rage.ts'
import { arbiterReply, resolveMode, type Turn } from './arbiter.ts'
import { seed } from './seed.ts'

const NAG_KEY = 'q3-attestation'

// ---------------------------------------------------------------------------
// Validation schemas — every mutating endpoint validates at the boundary.
// ---------------------------------------------------------------------------

const AllocationInput = z.object({
  name: z.string().trim().min(3, 'Allocation name must be at least 3 characters.').max(80),
  team: z.string().trim().min(2).max(60),
  workload: z.string().trim().min(2).max(60),
  model: z.string().trim().min(2).max(60),
  tokens_granted: z.number().int().nonnegative().max(1_000_000_000),
  unit_cost_micros: z.number().int().nonnegative().max(1_000_000),
  owner: z.string().trim().email('Owner must be a valid email address.'),
  risk_tier: z.enum(['low', 'moderate', 'elevated', 'ceremonial']),
})

const QuotaVariation = z.object({
  tokens_granted: z.number().int().nonnegative().max(1_000_000_000),
  justification: z
    .string()
    .trim()
    .min(20, 'Quota Variation Requests require a justification of at least 20 characters (Form 27-B).'),
})

const LuminanceRequest = z.object({
  theme: z.enum(['light', 'dark']),
  justification: z
    .string()
    .trim()
    .min(40, 'A Luminance Change Request requires a business justification of at least 40 characters (GS-19 §4.2).'),
  acknowledged: z.literal(true, {
    errorMap: () => ({ message: 'You must acknowledge the Luminance Change Advisory.' }),
  }),
})

const SettingsPatch = z.record(z.string(), z.string()).refine(
  (o) => Object.keys(o).every((k) => k in DEFAULT_SETTINGS),
  { message: 'Unknown setting key.' },
)

const ChatInput = z.object({
  session_id: z.string().trim().min(6).max(64),
  message: z.string().trim().min(1, 'Message cannot be empty.').max(2000),
  context: z
    .object({
      page: z.string().max(40).default('console'),
      tab: z.string().max(40).optional(),
      lastAction: z.string().max(200).optional(),
    })
    .default({ page: 'console' }),
})

const CertifyInput = z.object({ phrase: z.string().max(200) })

// ---------------------------------------------------------------------------
// Settings interlocks — contradictory, documented, overridable. (Mechanic D)
// ---------------------------------------------------------------------------

type Interlock = { when: [string, string]; force: [string, string]; note: string }

export const INTERLOCKS: Interlock[] = [
  {
    when: ['density', 'compact'],
    force: ['verbose_audit_banner', 'true'],
    note: 'Compact Density increases the risk of a user overlooking an audit disclosure, so the Verbose Audit Banner has been enabled (GS-19 §7.1).',
  },
  {
    when: ['reduce_motion', 'true'],
    force: ['decorative_transitions', 'true'],
    note: 'Accessibility accommodations must be visibly indicated, so Decorative Transitions (Compliance) has been enabled alongside Reduce Motion.',
  },
  {
    when: ['notifications_muted', 'true'],
    force: ['verbose_audit_banner', 'true'],
    note: 'Suppressing notices requires a compensating control, so the Verbose Audit Banner has been enabled.',
  },
]

export function applyInterlocks(
  patch: Record<string, string>,
  current: Record<string, string>,
): { effective: Record<string, string>; notes: string[] } {
  const merged = { ...current, ...patch }
  const notes: string[] = []
  if (merged.interlocks_overridden === 'true') return { effective: patch, notes: [] }
  const effective = { ...patch }
  for (const lock of INTERLOCKS) {
    const [k, v] = lock.when
    if (merged[k] === v && merged[lock.force[0]] !== lock.force[1]) {
      effective[lock.force[0]] = lock.force[1]
      notes.push(lock.note)
    }
  }
  return { effective, notes }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const allAllocations = (db: DatabaseSync) =>
  db.prepare('SELECT * FROM allocations').all() as unknown as Allocation[]

function decorate(a: Allocation) {
  return {
    ...a,
    spend_usd: spendMicros(a) / 1_000_000,
    utilisation: Number(utilisation(a).toFixed(4)),
  }
}

function ensureNag(db: DatabaseSync) {
  const row = db.prepare('SELECT * FROM notifications WHERE key = ?').get(NAG_KEY) as
    | { id: number; tier: number; dismissed_count: number; muted: number }
    | undefined
  if (row) return row
  db.prepare(
    'INSERT INTO notifications (key, tier, body, dismissed_count, muted, created_at) VALUES (?, 0, ?, 0, 0, ?)',
  ).run(NAG_KEY, nagBody(0, 0), new Date().toISOString())
  return db.prepare('SELECT * FROM notifications WHERE key = ?').get(NAG_KEY) as unknown as {
    id: number
    tier: number
    dismissed_count: number
    muted: number
  }
}

function fail(res: Response, status: number, code: string, message: string, extra: object = {}) {
  return res.status(status).json({ error: { code, message, ...extra } })
}

function zodFail(res: Response, err: z.ZodError) {
  return res.status(422).json({
    error: {
      code: 'VALIDATION_FAILED',
      message: err.issues[0]?.message ?? 'The submission was rejected.',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    },
  })
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function createApp(db: DatabaseSync = openDatabase()) {
  const app = express()
  app.use(express.json({ limit: '128kb' }))

  app.use((req, _res, next) => {
    if (req.method !== 'GET') console.log(`[api] ${req.method} ${req.path}`)
    next()
  })

  // -- health -------------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'quotient-v2', time: new Date().toISOString() })
  })

  app.get('/api/arbiter/health', (_req, res) => {
    const mode = resolveMode()
    res.json({
      mode,
      live: mode === 'live',
      disclosure:
        mode === 'live'
          ? 'ARBITER is backed by a live Anthropic model.'
          : 'ARBITER is running the local deterministic response engine. It is not a language model.',
      model: mode === 'live' ? (process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5') : null,
    })
  })

  // -- bootstrap ----------------------------------------------------------
  app.get('/api/bootstrap', (_req, res) => {
    const settings = readSettings(db)
    const rows = allAllocations(db)
    const nag = ensureNag(db)
    const pending = db
      .prepare("SELECT COUNT(*) AS n FROM attestations WHERE state != 'certified'")
      .get() as { n: number }
    res.json({
      settings,
      sortLabels: SORT_LABELS,
      interlocks: INTERLOCKS,
      summary: {
        allocations: rows.length,
        tokensGranted: rows.reduce((n, r) => n + r.tokens_granted, 0),
        tokensUsed: rows.reduce((n, r) => n + r.tokens_used, 0),
        spendUsd: rows.reduce((n, r) => n + spendMicros(r), 0) / 1_000_000,
        pendingAttestations: pending.n,
      },
      notification: nag.muted
        ? null
        : { key: NAG_KEY, tier: nag.tier, body: nagBody(nag.tier, nag.dismissed_count), dismissed: nag.dismissed_count },
    })
  })

  // -- allocations --------------------------------------------------------
  app.get('/api/allocations', (req, res) => {
    const settings = readSettings(db)
    const q = String(req.query.q ?? '')
    const status = String(req.query.status ?? 'all')
    const sort = (String(req.query.sort ?? settings.sort) as SortKey) in SORT_LABELS
      ? (String(req.query.sort ?? settings.sort) as SortKey)
      : 'uuid_alpha'
    const mode: SearchMode =
      (req.query.search_mode ?? (settings.literal_search === 'true' ? 'literal' : 'human')) === 'literal'
        ? 'literal'
        : 'human'
    const interp: FilterInterpretation =
      (req.query.interpretation ?? settings.filter_interpretation) === 'plain' ? 'plain' : 'policy'

    const base = allAllocations(db)
    const filtered = filterByStatus(base, status, interp)
    const searched = searchAllocations(filtered, q, mode)
    const sorted = sortAllocations(searched, sort)

    res.json({
      rows: sorted.map(decorate),
      total: base.length,
      meta: {
        sort,
        sortLabel: SORT_LABELS[sort],
        searchMode: mode,
        interpretation: interp,
        searchNote: mode === 'literal' ? literalSearchNote(q, searched.length) : null,
        filterNote: filterNote(status, interp),
      },
    })
  })

  app.post('/api/allocations', (req, res) => {
    const parsed = AllocationInput.safeParse(req.body)
    if (!parsed.success) return zodFail(res, parsed.error)
    const now = new Date().toISOString()
    const id = `alc_${Math.random().toString(36).slice(2, 10)}`
    db.prepare(
      `INSERT INTO allocations (id,name,team,workload,model,status,tokens_granted,tokens_used,unit_cost_micros,owner,risk_tier,created_at,updated_at)
       VALUES (?,?,?,?,?,'active',?,0,?,?,?,?,?)`,
    ).run(
      id,
      parsed.data.name,
      parsed.data.team,
      parsed.data.workload,
      parsed.data.model,
      parsed.data.tokens_granted,
      parsed.data.unit_cost_micros,
      parsed.data.owner,
      parsed.data.risk_tier,
      now,
      now,
    )
    logEvent(db, 'allocation.created', `Allocation "${parsed.data.name}" provisioned`, { id })
    const row = db.prepare('SELECT * FROM allocations WHERE id = ?').get(id) as unknown as Allocation
    res.status(201).json({ allocation: decorate(row) })
  })

  // Quota Variation Request → issues a formal receipt. (Mechanic: bureaucracy)
  app.patch('/api/allocations/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM allocations WHERE id = ?').get(req.params.id) as
      | unknown as Allocation | undefined
    if (!row) return fail(res, 404, 'NOT_FOUND', 'No such allocation.')
    const parsed = QuotaVariation.safeParse(req.body)
    if (!parsed.success) return zodFail(res, parsed.error)

    const now = new Date().toISOString()
    db.prepare('UPDATE allocations SET tokens_granted = ?, updated_at = ? WHERE id = ?').run(
      parsed.data.tokens_granted,
      now,
      row.id,
    )
    const n = (db.prepare('SELECT COUNT(*) AS n FROM receipts').get() as { n: number }).n + 1
    const cn = controlNumber('QVR', n)
    const body = {
      instrument: 'Quota Variation Request',
      allocation: row.name,
      allocation_id: row.id,
      previous_quota: row.tokens_granted,
      revised_quota: parsed.data.tokens_granted,
      delta: parsed.data.tokens_granted - row.tokens_granted,
      justification: parsed.data.justification,
      submitted_by: 'demo.operator@quotient.cloud',
      reviewed_by: 'ARBITER (automated), acting under delegated authority',
      effective_from: now,
      retention_schedule: 'RS-7 — retain 7 years from end of fiscal year, then review, then retain',
      statement:
        'This instrument confirms that a quota was changed. It confers no rights, implies no endorsement, and has been issued because a change occurred.',
    }
    db.prepare('INSERT INTO receipts (control_number, subject, body, created_at) VALUES (?,?,?,?)').run(
      cn,
      `Quota Variation — ${row.name}`,
      JSON.stringify(body),
      now,
    )
    logEvent(db, 'allocation.quota_varied', `Quota varied for "${row.name}"`, { id: row.id, cn })
    const updated = db.prepare('SELECT * FROM allocations WHERE id = ?').get(row.id) as unknown as Allocation
    res.json({ allocation: decorate(updated), receipt: { control_number: cn, subject: body.instrument, body } })
  })

  app.delete('/api/allocations/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM allocations WHERE id = ?').get(req.params.id) as
      | unknown as Allocation | undefined
    if (!row) return fail(res, 404, 'NOT_FOUND', 'No such allocation.')
    db.prepare('DELETE FROM allocations WHERE id = ?').run(row.id)
    logEvent(db, 'allocation.deprovisioned', `Allocation "${row.name}" deprovisioned`, { id: row.id })
    res.json({ ok: true, deprovisioned: row.id })
  })

  // -- settings -----------------------------------------------------------
  app.get('/api/settings', (_req, res) => res.json({ settings: readSettings(db), interlocks: INTERLOCKS }))

  app.patch('/api/settings', (req, res) => {
    const parsed = SettingsPatch.safeParse(req.body)
    if (!parsed.success) return zodFail(res, parsed.error)

    // Theme is a controlled configuration item; it may not be set here.
    if ('theme' in parsed.data) {
      return fail(
        res,
        403,
        'LUMINANCE_CONTROLLED',
        'Theme is a controlled configuration item and must be changed via a Luminance Change Request (GS-19 §4.2).',
        { remedy: 'POST /api/luminance-request' },
      )
    }

    const current = readSettings(db)
    const { effective, notes } = applyInterlocks(parsed.data, current)
    for (const [k, v] of Object.entries(effective)) writeSetting(db, k, v)
    if (parsed.data.interlocks_overridden === 'true')
      logEvent(db, 'governance.posture_weakened', 'All settings interlocks overridden by operator')
    logEvent(db, 'settings.updated', `Settings updated: ${Object.keys(effective).join(', ')}`, effective)
    res.json({ settings: readSettings(db), interlockNotes: notes })
  })

  // Mechanic B: the theme toggle opens an authorisation flow that genuinely works.
  app.post('/api/luminance-request', (req, res) => {
    const parsed = LuminanceRequest.safeParse(req.body)
    if (!parsed.success) return zodFail(res, parsed.error)
    writeSetting(db, 'theme', parsed.data.theme)
    writeSetting(db, 'theme_authorised', 'true')
    const n = (db.prepare('SELECT COUNT(*) AS n FROM receipts').get() as { n: number }).n + 1
    const cn = controlNumber('LCR', n)
    const body = {
      instrument: 'Luminance Change Authorisation',
      requested_theme: parsed.data.theme,
      justification: parsed.data.justification,
      steward: 'ARBITER, Luminance Steward (delegated)',
      outcome: 'APPROVED',
      note: 'Approval was never in doubt. The review period exists for audit symmetry.',
    }
    db.prepare('INSERT INTO receipts (control_number, subject, body, created_at) VALUES (?,?,?,?)').run(
      cn,
      `Luminance Change — ${parsed.data.theme}`,
      JSON.stringify(body),
      new Date().toISOString(),
    )
    logEvent(db, 'theme.authorised', `Luminance changed to ${parsed.data.theme}`, { cn })
    res.json({ approved: true, theme: parsed.data.theme, receipt: { control_number: cn, body } })
  })

  // -- attestations (Mechanic E: 99% then a new requirement) ---------------
  app.get('/api/attestations', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM attestations ORDER BY created_at DESC')
      .all() as unknown as Attestation[]
    res.json({ rows, secondaryPhrase: SECONDARY_PHRASE })
  })

  app.post('/api/attestations', (req, res) => {
    const id = String(req.body?.allocation_id ?? '')
    const alloc = db.prepare('SELECT * FROM allocations WHERE id = ?').get(id) as
      | unknown as Allocation | undefined
    if (!alloc) return fail(res, 404, 'NOT_FOUND', 'Select an allocation to attest.')
    const n = (db.prepare('SELECT COUNT(*) AS n FROM attestations').get() as { n: number }).n + 1
    const att: Attestation = {
      id: `att_${Math.random().toString(36).slice(2, 10)}`,
      allocation_id: alloc.id,
      period: 'FY26 Q3',
      state: 'pending_secondary',
      control_number: controlNumber('ATT', n),
      attestor: 'demo.operator@quotient.cloud',
      secondary_phrase: null,
      created_at: new Date().toISOString(),
      certified_at: null,
    }
    db.prepare(
      `INSERT INTO attestations (id,allocation_id,period,state,control_number,attestor,secondary_phrase,created_at,certified_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(att.id, att.allocation_id, att.period, att.state, att.control_number, att.attestor, null, att.created_at, null)
    logEvent(db, 'attestation.opened', `Attestation opened for "${alloc.name}"`, { id: att.id })
    res.status(201).json({
      attestation: att,
      progress: 99,
      blocker: {
        title: 'Secondary Attestor confirmation required',
        detail:
          'Generation is 99% complete. Before the remaining 1% may be released, a Secondary Attestor must confirm in writing that they are not a robot.',
        instruction: `Type the phrase "${SECONDARY_PHRASE}" exactly.`,
      },
    })
  })

  app.post('/api/attestations/:id/certify', (req, res) => {
    const att = db.prepare('SELECT * FROM attestations WHERE id = ?').get(req.params.id) as
      | unknown as Attestation | undefined
    if (!att) return fail(res, 404, 'NOT_FOUND', 'No such attestation.')
    const parsed = CertifyInput.safeParse(req.body)
    if (!parsed.success) return zodFail(res, parsed.error)
    if (!phraseMatches(parsed.data.phrase)) {
      return fail(
        res,
        422,
        'PHRASE_MISMATCH',
        `The Secondary Attestor confirmation did not match. The required phrase is "${SECONDARY_PHRASE}".`,
      )
    }
    const now = new Date().toISOString()
    db.prepare("UPDATE attestations SET state='certified', secondary_phrase=?, certified_at=? WHERE id=?").run(
      parsed.data.phrase.trim(),
      now,
      att.id,
    )
    logEvent(db, 'attestation.certified', `Attestation ${att.control_number} certified`, { id: att.id })
    const row = db.prepare('SELECT * FROM attestations WHERE id = ?').get(att.id) as unknown as Attestation
    res.json({ attestation: row, progress: 100 })
  })

  // -- notifications (Mechanic F: nagging, with a real mute) ---------------
  app.post('/api/notifications/:key/dismiss', (req, res) => {
    const row = ensureNag(db)
    if (req.params.key !== NAG_KEY) return fail(res, 404, 'NOT_FOUND', 'No such notice.')
    const tier = nextNagTier(row.tier)
    const count = row.dismissed_count + 1
    db.prepare('UPDATE notifications SET tier=?, dismissed_count=?, body=?, last_shown_at=? WHERE key=?').run(
      tier,
      count,
      nagBody(tier, count),
      new Date().toISOString(),
      NAG_KEY,
    )
    logEvent(db, 'notification.dismissed', `Notice "${NAG_KEY}" dismissed (${count} total)`, { tier })
    res.json({ key: NAG_KEY, tier, dismissed: count, nextBody: nagBody(tier, count), returnsInMs: 9000 })
  })

  app.post('/api/notifications/:key/mute', (req, res) => {
    if (req.params.key !== NAG_KEY) return fail(res, 404, 'NOT_FOUND', 'No such notice.')
    ensureNag(db)
    db.prepare('UPDATE notifications SET muted = 1 WHERE key = ?').run(NAG_KEY)
    writeSetting(db, 'notifications_muted', 'true')
    const { notes } = applyInterlocks({ notifications_muted: 'true' }, readSettings(db))
    for (const [k, v] of Object.entries(applyInterlocks({ notifications_muted: 'true' }, readSettings(db)).effective))
      writeSetting(db, k, v)
    logEvent(db, 'notification.cessation_filed', 'Notification Cessation Request filed and granted')
    res.json({ muted: true, interlockNotes: notes })
  })

  // -- audit + receipts ---------------------------------------------------
  app.get('/api/events', (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 40) || 40, 200)
    res.json({
      rows: db.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT ?').all(limit),
    })
  })

  app.get('/api/receipts', (_req, res) => {
    const rows = (
      db.prepare('SELECT * FROM receipts ORDER BY id DESC LIMIT 50').all() as unknown as {
        id: number
        control_number: string
        subject: string
        body: string
        created_at: string
      }[]
    ).map((r) => ({ ...r, body: JSON.parse(r.body) }))
    res.json({ rows })
  })

  // -- ARBITER chat -------------------------------------------------------
  app.get('/api/chat/:sessionId', (req, res) => {
    res.json({
      rows: db
        .prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id')
        .all(req.params.sessionId),
      mode: resolveMode(),
    })
  })

  app.post('/api/chat', async (req, res) => {
    const parsed = ChatInput.safeParse(req.body)
    if (!parsed.success) return zodFail(res, parsed.error)
    const { session_id, message, context } = parsed.data
    const now = new Date().toISOString()

    db.prepare(
      'INSERT INTO chat_messages (session_id, role, content, page_context, created_at) VALUES (?,?,?,?,?)',
    ).run(session_id, 'user', message, JSON.stringify(context), now)

    const history = (
      db
        .prepare('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id LIMIT 40')
        .all(session_id) as unknown as Turn[]
    ).map((t) => ({ role: t.role, content: t.content }))

    const nag = ensureNag(db)
    const pending = db
      .prepare("SELECT COUNT(*) AS n FROM attestations WHERE state != 'certified'")
      .get() as { n: number }
    const settings = readSettings(db)

    const { text, mode, degraded } = await arbiterReply(history, {
      page: context.page,
      tab: context.tab,
      lastAction: context.lastAction,
      allocationCount: allAllocations(db).length,
      pendingAttestations: pending.n,
      nagTier: nag.tier,
      theme: settings.theme,
    })

    db.prepare(
      'INSERT INTO chat_messages (session_id, role, content, page_context, created_at) VALUES (?,?,?,?,?)',
    ).run(session_id, 'arbiter', text, JSON.stringify(context), new Date().toISOString())

    res.json({ reply: text, mode, degraded })
  })

  // -- demo controls ------------------------------------------------------
  app.post('/api/demo/reset', (_req, res) => {
    seed(db)
    res.json({ ok: true, reseeded: true })
  })

  // -- static (production) ------------------------------------------------
  const webDist = new URL('../../web/dist', import.meta.url).pathname
  if (existsSync(webDist)) {
    app.use(express.static(webDist))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(`${webDist}/index.html`))
  }

  app.use('/api', (_req, res) => fail(res, 404, 'NOT_FOUND', 'No such endpoint.'))

  // Central error handler — never leak a stack to the client.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] unhandled:', err)
    if (res.headersSent) return
    res.status(500).json({ error: { code: 'INTERNAL', message: 'An internal error occurred.' } })
  })

  return app
}

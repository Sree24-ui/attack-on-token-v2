import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import type { Server } from 'node:http'
import { createApp } from '../src/app.ts'
import { openDatabase, type Allocation } from '../src/db.ts'
import { seed } from '../src/seed.ts'
import {
  searchAllocations, filterByStatus, sortAllocations, nagBody, nextNagTier,
  phraseMatches, literalSearchNote, NAG_TIERS,
} from '../src/rage.ts'
import { applyInterlocks } from '../src/app.ts'
import { deterministicReply } from '../src/arbiter.ts'

// ---------------------------------------------------------------------------
// Unit tests — the pure rage mechanics
// ---------------------------------------------------------------------------

const row = (over: Partial<Allocation> = {}): Allocation => ({
  id: 'alc_zzz', name: 'Customer Support Copilot', team: 'CX', workload: 'Conversational',
  model: 'opus-class', status: 'active', tokens_granted: 100, tokens_used: 50,
  unit_cost_micros: 2, owner: 'a@b.c', risk_tier: 'low',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', ...over,
})

describe('rage engine — search pedantry (LIP-7)', () => {
  const rows = [row(), row({ id: 'alc_aaa', name: 'Code Review Assistant', team: 'Engineering' })]

  test('literal mode is case-sensitive and finds nothing for a lowercase query', () => {
    assert.equal(searchAllocations(rows, 'copilot', 'literal').length, 0)
  })

  test('literal mode matches the exact character sequence', () => {
    assert.equal(searchAllocations(rows, 'Copilot', 'literal').length, 1)
  })

  test('human mode is case-insensitive and token-wise', () => {
    assert.equal(searchAllocations(rows, 'copilot', 'human').length, 1)
    assert.equal(searchAllocations(rows, 'review engineering', 'human').length, 1)
  })

  test('empty query returns everything in both modes', () => {
    assert.equal(searchAllocations(rows, '   ', 'literal').length, 2)
    assert.equal(searchAllocations(rows, '', 'human').length, 2)
  })

  test('the empty-state note explains the exact pedantry applied', () => {
    const note = literalSearchNote('High Cost', 0)
    assert.match(note!, /LIP-7/)
    assert.match(note!, /capitalisation was preserved/)
    assert.match(note!, /whitespace was treated as significant/)
  })

  test('no note is produced when results were found', () => {
    assert.equal(literalSearchNote('Copilot', 1), null)
  })
})

describe('rage engine — filter absurdity', () => {
  const rows = [row(), row({ id: 'b', status: 'archived' }), row({ id: 'c', status: 'pending_review' })]

  test('policy interpretation of "active" returns every record', () => {
    assert.equal(filterByStatus(rows, 'active', 'policy').length, 3)
  })

  test('plain interpretation of "active" returns only active records', () => {
    assert.equal(filterByStatus(rows, 'active', 'plain').length, 1)
  })

  test('policy interpretation pre-emptively includes pending_review', () => {
    assert.equal(filterByStatus(rows, 'archived', 'policy').length, 2)
    assert.equal(filterByStatus(rows, 'archived', 'plain').length, 1)
  })
})

describe('rage engine — sorting', () => {
  const rows = [
    row({ id: 'alc_z', name: 'Aardvark', tokens_used: 10, unit_cost_micros: 1 }),
    row({ id: 'alc_a', name: 'Zebra', tokens_used: 90, unit_cost_micros: 9 }),
  ]

  test('the default ordering is alphabetical by invisible UUID', () => {
    assert.deepEqual(sortAllocations(rows, 'uuid_alpha').map((r) => r.id), ['alc_a', 'alc_z'])
  })

  test('useful orderings exist and work', () => {
    assert.equal(sortAllocations(rows, 'name')[0]!.name, 'Aardvark')
    assert.equal(sortAllocations(rows, 'spend')[0]!.name, 'Zebra')
    assert.equal(sortAllocations(rows, 'utilisation')[0]!.name, 'Zebra')
  })

  test('sorting never mutates the input', () => {
    const input = [...rows]
    sortAllocations(input, 'name')
    assert.deepEqual(input.map((r) => r.id), ['alc_z', 'alc_a'])
  })
})

describe('rage engine — nagging', () => {
  test('tiers escalate then stop at the terminal tier', () => {
    assert.equal(nextNagTier(0), 1)
    assert.equal(nextNagTier(NAG_TIERS.length - 1), NAG_TIERS.length - 1)
  })

  test('the dismissal count is interpolated into the body', () => {
    assert.match(nagBody(3, 7), /dismissed 7 times/)
  })

  test('the terminal tier always names the working escape hatch', () => {
    assert.match(nagBody(NAG_TIERS.length - 1, 9), /Notification Cessation Request/)
  })
})

describe('rage engine — secondary attestor phrase', () => {
  test('accepts the phrase in any casing, with or without punctuation', () => {
    assert.ok(phraseMatches('I am not a robot'))
    assert.ok(phraseMatches('  i AM not A robot. '))
  })
  test('rejects anything else', () => {
    assert.ok(!phraseMatches('yes'))
    assert.ok(!phraseMatches('I am a robot'))
  })
})

describe('settings interlocks', () => {
  const base = { density: 'comfortable', verbose_audit_banner: 'false', reduce_motion: 'false', decorative_transitions: 'false', interlocks_overridden: 'false' }

  test('compact density forces the verbose audit banner on', () => {
    const { effective, notes } = applyInterlocks({ density: 'compact' }, base)
    assert.equal(effective.verbose_audit_banner, 'true')
    assert.equal(notes.length, 1)
  })

  test('reduce motion forces decorative transitions on', () => {
    const { effective } = applyInterlocks({ reduce_motion: 'true' }, base)
    assert.equal(effective.decorative_transitions, 'true')
  })

  test('the override disables every interlock', () => {
    const { effective, notes } = applyInterlocks({ density: 'compact' }, { ...base, interlocks_overridden: 'true' })
    assert.equal(effective.verbose_audit_banner, undefined)
    assert.equal(notes.length, 0)
  })
})

describe('ARBITER deterministic engine', () => {
  const ctx = { page: 'console', tab: 'allocations', allocationCount: 14 }

  test('routes a sign-in complaint to the access intent', () => {
    const r = deterministicReply([{ role: 'user', content: 'the sign in button keeps moving' }], ctx)
    assert.match(r, /Adaptive Affordance Programme|guest|stationary/i)
  })

  test('routes a theme question to the luminance intent', () => {
    const r = deterministicReply([{ role: 'user', content: 'how do I get light mode' }], ctx)
    assert.match(r, /Luminance/i)
  })

  test('does not repeat itself when asked the same thing twice', () => {
    const h: { role: 'user' | 'arbiter'; content: string }[] = [{ role: 'user', content: 'why did my search fail' }]
    const first = deterministicReply(h, ctx)
    h.push({ role: 'arbiter', content: first }, { role: 'user', content: 'why did my search fail' })
    assert.notEqual(deterministicReply(h, ctx), first)
  })

  test('discloses that it is not a language model when asked', () => {
    const r = deterministicReply([{ role: 'user', content: 'are you an AI?' }], ctx)
    assert.match(r, /not a language model|deterministic/i)
  })

  test('an unmatched message still produces a reply with a ticket', () => {
    const r = deterministicReply([{ role: 'user', content: 'xyzzy plugh' }], ctx)
    assert.match(r, /TKT-\d+/)
  })
})

// ---------------------------------------------------------------------------
// Integration tests — the real HTTP API against a real SQLite file
// ---------------------------------------------------------------------------

describe('API', () => {
  const dbFile = join(tmpdir(), `quotient-test-${randomUUID()}.db`)
  let server: Server
  let base: string
  let db: ReturnType<typeof openDatabase>

  const get = async (p: string) => {
    const r = await fetch(base + p)
    return { status: r.status, body: await r.json() as any }
  }
  const send = async (m: string, p: string, body?: unknown) => {
    const r = await fetch(base + p, {
      method: m, headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: r.status, body: await r.json() as any }
  }

  before(async () => {
    db = openDatabase(dbFile)
    seed(db)
    server = createApp(db).listen(0)
    await new Promise((r) => server.once('listening', r))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })

  after(() => {
    server.close()
    db.close()
    for (const s of ['', '-wal', '-shm']) rmSync(dbFile + s, { force: true })
  })

  test('health reports the service', async () => {
    const { status, body } = await get('/api/health')
    assert.equal(status, 200)
    assert.equal(body.service, 'quotient-v2')
  })

  test('bootstrap returns settings, a summary and the active notice', async () => {
    const { body } = await get('/api/bootstrap')
    assert.equal(body.summary.allocations, 14)
    assert.ok(body.summary.spendUsd > 0)
    assert.equal(body.settings.sort, 'uuid_alpha')
    assert.equal(body.notification.tier, 0)
  })

  test('literal search returns nothing and explains why', async () => {
    const { body } = await get('/api/allocations?q=copilot')
    assert.equal(body.rows.length, 0)
    assert.match(body.meta.searchNote, /LIP-7/)
  })

  test('human search finds the record the user meant', async () => {
    const { body } = await get('/api/allocations?q=copilot&search_mode=human')
    assert.equal(body.rows.length, 1)
    assert.equal(body.rows[0].name, 'Customer Support Copilot')
  })

  test('the active filter returns everything under the policy interpretation', async () => {
    const policy = await get('/api/allocations?status=active')
    const plain = await get('/api/allocations?status=active&interpretation=plain')
    assert.equal(policy.body.rows.length, 14)
    assert.equal(plain.body.rows.length, 11)
    assert.match(policy.body.meta.filterNote, /Clause 14\(b\)/)
  })

  test('rows carry computed spend and utilisation', async () => {
    const { body } = await get('/api/allocations?sort=spend')
    assert.ok(body.rows[0].spend_usd >= body.rows[1].spend_usd)
    assert.ok(body.rows[0].utilisation <= 1)
  })

  test('creating an allocation validates its input', async () => {
    const bad = await send('POST', '/api/allocations', { name: 'x', team: 'T', workload: 'W', model: 'M', tokens_granted: 1, unit_cost_micros: 1, owner: 'not-an-email', risk_tier: 'low' })
    assert.equal(bad.status, 422)
    assert.equal(bad.body.error.code, 'VALIDATION_FAILED')

    const ok = await send('POST', '/api/allocations', { name: 'Test Allocation', team: 'QA', workload: 'Testing', model: 'haiku-class', tokens_granted: 1000, unit_cost_micros: 1, owner: 'qa@quotient.cloud', risk_tier: 'low' })
    assert.equal(ok.status, 201)
    assert.equal(ok.body.allocation.status, 'active')
  })

  test('theme cannot be set through the settings endpoint', async () => {
    const { status, body } = await send('PATCH', '/api/settings', { theme: 'light' })
    assert.equal(status, 403)
    assert.equal(body.error.code, 'LUMINANCE_CONTROLLED')
  })

  test('a luminance request rejects a short justification', async () => {
    const { status } = await send('POST', '/api/luminance-request', { theme: 'light', justification: 'because', acknowledged: true })
    assert.equal(status, 422)
  })

  test('a valid luminance request applies the theme and issues a receipt', async () => {
    const { status, body } = await send('POST', '/api/luminance-request', {
      theme: 'light',
      justification: 'Ambient illumination in our workspace exceeds the tolerances assumed by the dark theme.',
      acknowledged: true,
    })
    assert.equal(status, 200)
    assert.equal(body.approved, true)
    assert.match(body.receipt.control_number, /^LCR-\d{4}-\d{5}-REV\.A$/)
    const boot = await get('/api/bootstrap')
    assert.equal(boot.body.settings.theme, 'light')
  })

  test('settings interlocks are enforced server-side', async () => {
    const { body } = await send('PATCH', '/api/settings', { density: 'compact' })
    assert.equal(body.settings.verbose_audit_banner, 'true')
    assert.ok(body.interlockNotes.length > 0)
  })

  test('an unknown setting key is rejected', async () => {
    const { status } = await send('PATCH', '/api/settings', { nonsense: 'true' })
    assert.equal(status, 422)
  })

  test('attestation stops at 99% and will not certify without the phrase', async () => {
    const opened = await send('POST', '/api/attestations', { allocation_id: 'alc_0f3a91c2' })
    assert.equal(opened.status, 201)
    assert.equal(opened.body.progress, 99)
    assert.equal(opened.body.attestation.state, 'pending_secondary')

    const wrong = await send('POST', `/api/attestations/${opened.body.attestation.id}/certify`, { phrase: 'yes' })
    assert.equal(wrong.status, 422)
    assert.equal(wrong.body.error.code, 'PHRASE_MISMATCH')

    const right = await send('POST', `/api/attestations/${opened.body.attestation.id}/certify`, { phrase: 'I am not a robot' })
    assert.equal(right.status, 200)
    assert.equal(right.body.progress, 100)
    assert.equal(right.body.attestation.state, 'certified')
    assert.ok(right.body.attestation.certified_at)
  })

  test('attesting an unknown allocation 404s', async () => {
    const { status } = await send('POST', '/api/attestations', { allocation_id: 'nope' })
    assert.equal(status, 404)
  })

  test('dismissing the notice escalates it, and muting it works', async () => {
    const one = await send('POST', '/api/notifications/q3-attestation/dismiss')
    const two = await send('POST', '/api/notifications/q3-attestation/dismiss')
    assert.equal(one.body.tier, 1)
    assert.equal(two.body.tier, 2)
    assert.notEqual(one.body.nextBody, two.body.nextBody)

    await send('POST', '/api/notifications/q3-attestation/mute')
    const boot = await get('/api/bootstrap')
    assert.equal(boot.body.notification, null)
  })

  test('a quota variation requires a justification and issues a receipt', async () => {
    const bad = await send('PATCH', '/api/allocations/alc_5d1c7e48', { tokens_granted: 100, justification: 'no' })
    assert.equal(bad.status, 422)

    const ok = await send('PATCH', '/api/allocations/alc_5d1c7e48', {
      tokens_granted: 9_000_000,
      justification: 'Incident volume has doubled this quarter and drafts are being truncated.',
    })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.allocation.tokens_granted, 9_000_000)
    assert.match(ok.body.receipt.control_number, /^QVR-/)

    const receipts = await get('/api/receipts')
    assert.ok(receipts.body.rows.some((r: any) => r.control_number === ok.body.receipt.control_number))
  })

  test('deprovisioning removes the row and 404s the second time', async () => {
    const first = await send('DELETE', '/api/allocations/alc_b7e3012a')
    assert.equal(first.status, 200)
    const second = await send('DELETE', '/api/allocations/alc_b7e3012a')
    assert.equal(second.status, 404)
  })

  test('the audit trail records what happened', async () => {
    const { body } = await get('/api/events?limit=100')
    const kinds = body.rows.map((r: any) => r.kind)
    for (const k of ['allocation.created', 'theme.authorised', 'attestation.certified', 'allocation.deprovisioned']) {
      assert.ok(kinds.includes(k), `expected audit kind ${k}`)
    }
  })

  test('chat persists both turns and reports its execution mode', async () => {
    const { status, body } = await send('POST', '/api/chat', {
      session_id: 'testsession01',
      message: 'why does the theme toggle open a form',
      context: { page: 'console', tab: 'settings' },
    })
    assert.equal(status, 200)
    assert.equal(body.mode, 'deterministic')
    assert.match(body.reply, /Luminance/i)

    const history = await get('/api/chat/testsession01')
    assert.equal(history.body.rows.length, 2)
    assert.equal(history.body.rows[0].role, 'user')
    assert.equal(history.body.rows[1].role, 'arbiter')
  })

  test('chat rejects an empty message', async () => {
    const { status } = await send('POST', '/api/chat', { session_id: 'testsession01', message: '   ' })
    assert.equal(status, 422)
  })

  test('arbiter health honestly discloses the execution mode', async () => {
    const { body } = await get('/api/arbiter/health')
    assert.equal(body.mode, 'deterministic')
    assert.match(body.disclosure, /not a language model/)
  })

  test('an unknown API route 404s as JSON', async () => {
    const { status, body } = await get('/api/nope')
    assert.equal(status, 404)
    assert.equal(body.error.code, 'NOT_FOUND')
  })

  test('state is durable — a second connection to the same file sees it', async () => {
    const before = await get('/api/bootstrap')

    // Open an independent connection to the same file and serve it separately.
    // If the writes above only lived in memory, this would not see them.
    const second = openDatabase(dbFile)
    const reopened = createApp(second).listen(0)
    await new Promise((r) => reopened.once('listening', r))
    const port = (reopened.address() as { port: number }).port
    const after = (await (await fetch(`http://127.0.0.1:${port}/api/bootstrap`)).json()) as any

    assert.equal(after.settings.theme, 'light', 'theme change persisted to disk')
    assert.equal(after.summary.allocations, before.body.summary.allocations)
    assert.equal(after.notification, null, 'the notification mute persisted to disk')

    reopened.close()
    second.close()
  })

  test('demo reset restores the seeded tenant', async () => {
    await send('POST', '/api/demo/reset')
    const { body } = await get('/api/bootstrap')
    assert.equal(body.summary.allocations, 14)
    assert.equal(body.settings.theme, 'dark')
    assert.equal(body.notification.tier, 0)
  })
})

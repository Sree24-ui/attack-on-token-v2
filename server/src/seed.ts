import type { DatabaseSync } from 'node:sqlite'
import { openDatabase, logEvent, controlNumber } from './db.ts'

/**
 * Deterministic demo data. Running `npm run seed` always produces exactly this
 * tenant, so a judge can explore a populated product immediately and so the
 * e2e suite has stable fixtures.
 *
 * Note the deliberate mixed-case names: they make the Literal Interpretation
 * Policy (LIP-7) demonstrable — searching "copilot" finds nothing, because the
 * record says "Copilot".
 */

const ROWS: [string, string, string, string, string, string, number, number, number, string, string][] = [
  // id, name, team, workload, model, status, granted, used, unit_cost_micros, owner, risk_tier
  ['alc_0f3a91c2', 'Customer Support Copilot', 'Customer Experience', 'Conversational', 'opus-class', 'active', 48_000_000, 44_910_220, 9, 'r.navarro@quotient.cloud', 'elevated'],
  ['alc_1b7d44e0', 'Contract Clause Extraction', 'Legal Operations', 'Extraction', 'sonnet-class', 'active', 12_000_000, 3_104_880, 4, 'p.okonkwo@quotient.cloud', 'moderate'],
  ['alc_2c81ff35', 'Revenue Forecast Narratives', 'Finance', 'Summarisation', 'sonnet-class', 'active', 9_500_000, 9_488_010, 4, 'm.lindqvist@quotient.cloud', 'elevated'],
  ['alc_3e02aa17', 'Internal Knowledge Search', 'Platform', 'Retrieval', 'haiku-class', 'active', 80_000_000, 21_770_400, 1, 'd.whitfield@quotient.cloud', 'low'],
  ['alc_4a5590bb', 'Candidate Screening Notes', 'People Operations', 'Classification', 'haiku-class', 'suspended', 6_000_000, 5_902_310, 1, 's.abimbola@quotient.cloud', 'elevated'],
  ['alc_5d1c7e48', 'Incident Postmortem Drafts', 'Site Reliability', 'Summarisation', 'sonnet-class', 'active', 4_000_000, 1_288_900, 4, 'k.tanaka@quotient.cloud', 'low'],
  ['alc_6f44b903', 'Marketing Variant Generation', 'Growth', 'Generation', 'sonnet-class', 'active', 30_000_000, 29_104_770, 4, 'j.ferreira@quotient.cloud', 'moderate'],
  ['alc_7b90de21', 'Procurement Policy Q&A', 'Procurement', 'Conversational', 'haiku-class', 'pending_review', 2_500_000, 410_050, 1, 'a.hollis@quotient.cloud', 'ceremonial'],
  ['alc_8c13a7f6', 'Code Review Assistant', 'Engineering', 'Generation', 'opus-class', 'active', 60_000_000, 38_220_915, 9, 'n.petrov@quotient.cloud', 'moderate'],
  ['alc_9a66c014', 'Accessibility Audit Helper', 'Design Systems', 'Classification', 'sonnet-class', 'active', 3_200_000, 980_440, 4, 'e.mbeki@quotient.cloud', 'low'],
  ['alc_a2f8b55d', 'Board Pack Condenser', 'Executive Office', 'Summarisation', 'opus-class', 'active', 1_800_000, 1_799_980, 9, 'c.delacroix@quotient.cloud', 'ceremonial'],
  ['alc_b7e3012a', 'Supplier Risk Triage', 'Risk & Compliance', 'Classification', 'sonnet-class', 'archived', 7_400_000, 7_400_000, 4, 'l.osei@quotient.cloud', 'elevated'],
  ['alc_c40d8e79', 'Localisation Review Queue', 'Localisation', 'Translation', 'haiku-class', 'active', 22_000_000, 6_332_110, 1, 'y.sorensen@quotient.cloud', 'low'],
  ['alc_d9b21f6c', 'Sales Call Debriefs', 'Revenue Operations', 'Summarisation', 'sonnet-class', 'active', 15_000_000, 14_120_600, 4, 'g.ramirez@quotient.cloud', 'moderate'],
]

const BASE = Date.parse('2026-07-01T09:00:00.000Z')

export function seed(db: DatabaseSync): void {
  db.exec('DELETE FROM attestations; DELETE FROM allocations; DELETE FROM audit_events; DELETE FROM notifications; DELETE FROM receipts; DELETE FROM chat_messages; DELETE FROM settings;')

  const insert = db.prepare(
    `INSERT INTO allocations (id,name,team,workload,model,status,tokens_granted,tokens_used,unit_cost_micros,owner,risk_tier,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  ROWS.forEach((r, i) => {
    const created = new Date(BASE + i * 86_400_000).toISOString()
    const updated = new Date(BASE + i * 86_400_000 + 3_600_000 * (i % 7)).toISOString()
    insert.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], created, updated)
  })

  // One attestation already certified, so the panel is not empty on arrival.
  db.prepare(
    `INSERT INTO attestations (id,allocation_id,period,state,control_number,attestor,secondary_phrase,created_at,certified_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    'att_seed0001',
    'alc_3e02aa17',
    'FY26 Q2',
    'certified',
    controlNumber('ATT', 1),
    'former.operator@quotient.cloud',
    'I am not a robot',
    new Date(BASE).toISOString(),
    new Date(BASE + 7_200_000).toISOString(),
  )

  db.prepare(
    `INSERT INTO receipts (control_number, subject, body, created_at) VALUES (?,?,?,?)`,
  ).run(
    controlNumber('QVR', 1),
    'Quota Variation — Internal Knowledge Search',
    JSON.stringify({
      instrument: 'Quota Variation Request',
      allocation: 'Internal Knowledge Search',
      previous_quota: 60_000_000,
      revised_quota: 80_000_000,
      justification: 'Seeded historical record retained for demonstration of the receipt register.',
      reviewed_by: 'ARBITER (automated), acting under delegated authority',
      retention_schedule: 'RS-7 — retain 7 years from end of fiscal year, then review, then retain',
    }),
    new Date(BASE + 10_800_000).toISOString(),
  )

  const notes: [string, string][] = [
    ['tenant.provisioned', 'Demonstration tenant provisioned with 14 allocations'],
    ['policy.published', 'Literal Interpretation Policy (LIP-7) published and made mandatory'],
    ['policy.published', 'Governance Standard GS-19 §4.2 extended to cover interface luminance'],
    ['attestation.certified', 'Attestation ATT-2026-00001-REV.A certified for FY26 Q2'],
  ]
  notes.forEach(([kind, summary]) => logEvent(db, kind, summary, {}, 'system@quotient.cloud'))

  console.log(`[seed] ${ROWS.length} allocations, 1 attestation, 1 receipt, ${notes.length} audit events`)
}

// Allow `npm -w server run seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDatabase()
  seed(db)
  db.close()
}

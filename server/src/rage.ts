import type { Allocation } from './db.ts'

/**
 * The Rage Engine (server half).
 *
 * Every mechanic in here is *technically correct*. That is the joke. Each
 * function is pure and unit-tested, and each has a non-absurd counterpart so
 * the user always has a recovery path.
 *
 * Taxonomy references follow Gray et al. (CHI 2018): Nagging, Obstruction,
 * Sneaking, Interface Interference, Forced Action.
 */

// ---------------------------------------------------------------------------
// C. Search pedantry  —  category: Obstruction
// ---------------------------------------------------------------------------

export type SearchMode = 'literal' | 'human'

const HAYSTACK = (a: Allocation) =>
  [a.name, a.team, a.workload, a.model, a.owner, a.status, a.risk_tier].join(' ')

/**
 * Literal mode honours the Literal Interpretation Policy (LIP-7): the query is
 * treated as one case-sensitive, whitespace-significant substring. Searching
 * "high cost" finds only records literally containing "high cost".
 *
 * Human mode does what a person meant: case-insensitive, token-wise AND.
 */
export function searchAllocations(rows: Allocation[], query: string, mode: SearchMode): Allocation[] {
  const q = query.trim()
  if (!q) return rows
  if (mode === 'literal') return rows.filter((r) => HAYSTACK(r).includes(query))
  const tokens = q.toLowerCase().split(/\s+/)
  return rows.filter((r) => {
    const hay = HAYSTACK(r).toLowerCase()
    return tokens.every((t) => hay.includes(t))
  })
}

/** Explains, in insufferable detail, why literal mode found nothing. */
export function literalSearchNote(query: string, found: number): string | null {
  if (found > 0 || !query.trim()) return null
  const notes: string[] = []
  if (/[A-Z]/.test(query)) notes.push('capitalisation was preserved, as submitted')
  if (/\s/.test(query)) notes.push('interior whitespace was treated as significant')
  if (query !== query.trim()) notes.push('surrounding whitespace was trimmed as a courtesy')
  const detail = notes.length ? ` Specifically: ${notes.join('; ')}.` : ''
  return `0 records contain the exact character sequence "${query}". Your query was interpreted literally in accordance with the Literal Interpretation Policy (LIP-7).${detail}`
}

// ---------------------------------------------------------------------------
// C. Filter absurdity  —  category: Sneaking (bait and switch)
// ---------------------------------------------------------------------------

export type FilterInterpretation = 'policy' | 'plain'

/**
 * Under the policy interpretation, "status: active" means "has held the status
 * `active` at any point within the retention window". Since every allocation is
 * provisioned in the `active` state before transitioning elsewhere, this is
 * both completely defensible and completely useless.
 */
export function filterByStatus(
  rows: Allocation[],
  status: string,
  interpretation: FilterInterpretation,
): Allocation[] {
  if (status === 'all') return rows
  if (interpretation === 'plain') return rows.filter((r) => r.status === status)
  if (status === 'active') return rows // everything was active once. Checkmate.
  return rows.filter((r) => r.status === status || r.status === 'pending_review')
}

export function filterNote(status: string, interpretation: FilterInterpretation): string | null {
  if (interpretation === 'plain' || status === 'all') return null
  if (status === 'active')
    return 'Showing all allocations that have held status "active" at any point within the 7-year retention window, as required by Clause 14(b). This is every allocation.'
  return `Showing allocations with status "${status}", plus those in "pending_review", which may yet become "${status}" and are therefore included pre-emptively.`
}

// ---------------------------------------------------------------------------
// C. Sort defaults  —  category: Interface Interference (false hierarchy)
// ---------------------------------------------------------------------------

export type SortKey = 'uuid_alpha' | 'name' | 'spend' | 'utilisation' | 'updated'

export const SORT_LABELS: Record<SortKey, string> = {
  uuid_alpha: 'Relevance (alphabetical by internal UUID)',
  name: 'Allocation name (A→Z)',
  spend: 'Projected spend (high→low)',
  utilisation: 'Quota utilisation (high→low)',
  updated: 'Recently updated',
}

export const spendMicros = (a: Allocation) => a.tokens_used * a.unit_cost_micros
export const utilisation = (a: Allocation) =>
  a.tokens_granted === 0 ? 0 : a.tokens_used / a.tokens_granted

export function sortAllocations(rows: Allocation[], key: SortKey): Allocation[] {
  const out = [...rows]
  switch (key) {
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name))
    case 'spend':
      return out.sort((a, b) => spendMicros(b) - spendMicros(a))
    case 'utilisation':
      return out.sort((a, b) => utilisation(b) - utilisation(a))
    case 'updated':
      return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    case 'uuid_alpha':
    default:
      // The single least useful ordering that is still deterministic.
      return out.sort((a, b) => a.id.localeCompare(b.id))
  }
}

// ---------------------------------------------------------------------------
// F. Notification persistence  —  category: Nagging
// ---------------------------------------------------------------------------

/**
 * Each dismissal escalates the register of the message. Tier 5 is terminal: it
 * stops escalating, and by then the mute control has been explicitly offered.
 */
export const NAG_TIERS: string[] = [
  'Reminder: your Q3 Token Utilisation Attestation is awaiting your signature.',
  'Second reminder: the Q3 Token Utilisation Attestation remains unsigned. No action has been recorded.',
  'ESCALATION 1 of 3 — Per Governance Standard GS-19 §4.2, an unsigned attestation older than 0 days is reportable to your line manager.',
  'ESCALATION 2 of 3 — This notice has now been dismissed {n} times. Each dismissal has been recorded in the audit trail, which you may review at your leisure, and which your auditor will review at theirs.',
  'ESCALATION 3 of 3 — A Notification Cessation Request may be filed from Settings → Notifications. Filing one is itself a reportable governance event. We mention this only for completeness.',
]

export function nagBody(tier: number, dismissedCount: number): string {
  const idx = Math.min(Math.max(tier, 0), NAG_TIERS.length - 1)
  return (NAG_TIERS[idx] ?? NAG_TIERS[0]!).replace('{n}', String(dismissedCount))
}

export const nextNagTier = (tier: number) => Math.min(tier + 1, NAG_TIERS.length - 1)

// ---------------------------------------------------------------------------
// E. Progress absurdity  —  category: Forced Action
// ---------------------------------------------------------------------------

/** The exact phrase a Secondary Attestor must type. Compared case-insensitively. */
export const SECONDARY_PHRASE = 'I am not a robot'

export const phraseMatches = (input: string) =>
  input.trim().toLowerCase().replace(/[.!]+$/, '') === SECONDARY_PHRASE.toLowerCase()

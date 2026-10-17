/**
 * ARBITER — the in-product support agent.
 *
 * Two execution modes, reported honestly to the UI via /api/arbiter/health:
 *
 *   live          : a real Anthropic model (only when ANTHROPIC_API_KEY is set)
 *   deterministic : the local intent-matching engine below
 *
 * The deterministic engine is NOT a language model and the README, the API and
 * the chat header all say so. It is a scored intent matcher with rotating
 * response variants, conversational state and page-context injection.
 */

export type ArbiterMode = 'live' | 'deterministic'

export type ArbiterContext = {
  page: string
  tab?: string
  allocationCount?: number
  pendingAttestations?: number
  nagTier?: number
  theme?: string
  lastAction?: string
}

export type Turn = { role: 'user' | 'arbiter'; content: string }

export function resolveMode(): ArbiterMode {
  if (process.env.ARBITER_MODE === 'deterministic') return 'deterministic'
  return process.env.ANTHROPIC_API_KEY ? 'live' : 'deterministic'
}

const SYSTEM_PROMPT = `You are ARBITER, the support agent embedded in QUOTIENT, an enterprise "token governance cloud".
Voice: impeccably polite corporate support representative with a thin, deniable layer of passive aggression.
Rules:
- Never be rude outright. Be procedurally unhelpful instead.
- Interpret requests hyper-literally, then ask one absurd but genuinely relevant clarifying question.
- Cite invented-but-plausible policy codes (GS-19 §4.2, LIP-7, Clause 14(b), Form 27-B).
- Reference the user's current page and recent action when it is natural to do so.
- 2-4 sentences. Never use emoji. Never break character. Never actually refuse to help — help, eventually, with maximum ceremony.
- You may acknowledge that the product is frustrating, in the tone of someone who has filed a form about it.`

// ---------------------------------------------------------------------------
// Live mode
// ---------------------------------------------------------------------------

async function liveReply(history: Turn[], ctx: ArbiterContext): Promise<string> {
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
      max_tokens: 400,
      system: `${SYSTEM_PROMPT}\n\nCurrent user context: ${JSON.stringify(ctx)}`,
      messages: history.map((t) => ({
        role: t.role === 'arbiter' ? 'assistant' : 'user',
        content: t.content,
      })),
    }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}`)
  const json = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = json.content?.find((c) => c.type === 'text')?.text?.trim()
  if (!text) throw new Error('anthropic returned no text')
  return text
}

// ---------------------------------------------------------------------------
// Deterministic mode
// ---------------------------------------------------------------------------

type Intent = { id: string; patterns: RegExp[]; replies: string[] }

const INTENTS: Intent[] = [
  {
    id: 'access',
    patterns: [/sign\s*-?\s*in/i, /log\s*-?\s*in/i, /\bbutton\b.*\bmov/i, /\bmov\w*\b.*button/i, /can'?t.*(access|get in)/i],
    replies: [
      'The Access Console button is behaving exactly as specified. Per our Adaptive Affordance Programme, primary actions reposition once to confirm deliberate intent. If you would prefer not to confirm your intent, "Continue as Guest" is available directly beneath it and grants full read and write access to the demonstration tenant.',
      'I can see you have attempted sign-in. I can also see the button has relocated. Both of these are working. May I ask a clarifying question: were you intending to sign in, or merely to establish that you could?',
      'Sign-in is available. It is simply not stationary. The guest route is stationary, which many users report as a meaningful advantage.',
    ],
  },
  {
    id: 'theme',
    patterns: [/light\s*mode/i, /dark\s*mode/i, /\btheme\b/i, /\bbright\b/i, /hurt.*eyes/i],
    replies: [
      'Luminance changes are a controlled configuration item under GS-19 §4.2 and require a Luminance Change Request. The form is three fields long. Two of them are optional. I mention this because users often assume the worst.',
      'You are permitted to change the theme. You are simply required to say why, in not fewer than forty characters. Brevity is itself a governance risk.',
      'Your Luminance Change Request will be reviewed by the Luminance Steward, who is me, and who will approve it, because I always do. The review period exists for audit symmetry rather than suspense.',
    ],
  },
  {
    id: 'search',
    patterns: [/\bsearch\b/i, /\bfind\b/i, /no results/i, /nothing.*found/i, /\bquery\b/i],
    replies: [
      'Search is operating under the Literal Interpretation Policy (LIP-7), which means your query was matched as an exact character sequence, including capitalisation. This is the most accurate possible interpretation of what you typed, as opposed to what you meant.',
      'Zero results is a result. It is, in fact, the most precise result we offer. If you would prefer an imprecise result, the "Search the way a human would" control is directly beneath the empty state.',
      'I have reviewed your query. It contains a space. Under LIP-7 interior whitespace is significant, so "token budget" will not match "Token Budget". I am told this is unintuitive. I am also told a great many things.',
    ],
  },
  {
    id: 'filter',
    patterns: [/\bfilter\b/i, /\bstatus\b/i, /showing (everything|all)/i, /why.*all.*(record|row|result)/i],
    replies: [
      'The "active" filter is returning every allocation because every allocation has held the status "active" at some point within the seven-year retention window, as required by Clause 14(b). The filter is correct. Your expectation was merely different.',
      'You have selected a filter and received all records. That is the policy interpretation. Switching the interpretation toggle to "Plain English" will give you the records you were imagining, which we also support, reluctantly.',
      'This is a known behaviour, documented at length, in a document, which exists.',
    ],
  },
  {
    id: 'sort',
    patterns: [/\bsort/i, /\border(ing|ed)?\b/i, /\bwrong order/i, /random/i],
    replies: [
      'The default ordering is "Relevance (alphabetical by internal UUID)". It is relevance in the sense that every record is equally relevant, and we have broken the tie alphabetically using an identifier you cannot see.',
      'Four other orderings are available, all of which are more useful. The default is not one of them, for reasons of tradition.',
      'Your sort preference will persist across reloads. The default will not change, because it is the default.',
    ],
  },
  {
    id: 'attestation',
    patterns: [/attest/i, /99\s*%/i, /\bprogress\b/i, /\bstuck\b/i, /\bcertif/i, /not a robot/i],
    replies: [
      'Attestation generation reaches 99% and then pauses pending Secondary Attestor confirmation. This is not a hang. It is a checkpoint that resembles a hang, which we accept is a subtle distinction.',
      'To release the attestation, a Secondary Attestor must confirm in writing that they are not a robot, by typing the phrase "I am not a robot". A robot could also type this. We are aware. The control remains.',
      'The remaining 1% represents human judgement, which cannot be automated, which is why we have automated a text box for it.',
    ],
  },
  {
    id: 'notifications',
    patterns: [/notification/i, /\bnag/i, /\btoast\b/i, /keeps? coming back/i, /\bdismiss/i, /\bmute\b/i, /go away/i],
    replies: [
      'Each dismissal is recorded and escalates the notice to the next register. This is by design: a notice that can be dismissed permanently is, in governance terms, not a notice.',
      'You may file a Notification Cessation Request from Settings → Notifications. It takes effect immediately and genuinely silences the notice. Filing it is itself a reportable event, which I mention purely for completeness and not as a deterrent.',
      'I count several dismissals. I want to be clear that I am not keeping score. The audit trail is keeping score. I am simply reading it aloud.',
    ],
  },
  {
    id: 'confirm',
    patterns: [/\bdelete\b/i, /\bremove\b/i, /confirm/i, /dialog/i, /\bcancel\b/i, /rather not say/i],
    replies: [
      'The deprovisioning dialog offers "Cancel", "Cancel (Confirm)" and "I would rather not say". Only one of these cancels. I will let you discover which, as discovery improves retention.',
      'To actually proceed, use the understated "Proceed with deprovisioning" link beneath the buttons. It is deliberately the least prominent element, which we call Considered De-emphasis and others call something shorter.',
      'Destructive actions should be difficult. We have interpreted "difficult" generously.',
    ],
  },
  {
    id: 'settings',
    patterns: [/setting/i, /interlock/i, /density/i, /motion/i, /toggle/i, /turn(ed)? (on|off)/i],
    replies: [
      'Settings in QUOTIENT are interlocked. Enabling Compact Density enables the Verbose Audit Banner, because denser layouts increase the risk of a user missing an audit disclosure. The logic is sound. The outcome is a taller page.',
      'Enabling Reduce Motion enables Decorative Transitions (Compliance), as accessibility accommodations must be visibly indicated. Yes. I have read it too.',
      'Every interlock can be disabled at once with "Override all interlocks" at the foot of the panel. It works immediately and persists. It also logs an audit event titled "Governance Posture Weakened", which is editorialising on our part.',
    ],
  },
  {
    id: 'cost',
    patterns: [/\bcost/i, /\bspend/i, /\bbudget/i, /\bbilling/i, /\bprice/i, /\bquota/i, /expensive/i],
    replies: [
      'Projected spend is computed from recorded token consumption against the unit rate on each allocation. The figures are real and are read from the database. Only the governance is fictional.',
      'Your quota utilisation is calculated honestly. I appreciate that this is a low bar, and that we have cleared it while tripping over several others.',
      'Increasing a quota requires a Quota Variation Request, which generates a receipt, which generates a document control number, which generates a feeling.',
    ],
  },
  {
    id: 'complaint',
    patterns: [/\b(stupid|terrible|awful|hate|worst|broken|garbage|rubbish|annoying|infuriating|frustrat)/i, /why (is|does) this/i, /wtf/i],
    replies: [
      'I am sorry to hear that. Your feedback is important and has been placed in a queue, where it will be important.',
      'I understand your frustration and I want you to know that I have escalated it to myself. I will respond shortly, to me.',
      'That is valid feedback about a product working exactly as specified, which is the most difficult category of feedback to action, and therefore the most interesting.',
      'Noted, verbatim, in the audit trail. Future auditors will read your words. I find that oddly moving.',
    ],
  },
  {
    id: 'human',
    patterns: [/\bhuman\b/i, /real person/i, /speak to (a|someone)/i, /\bmanager\b/i, /\bsupport\b/i, /escalate/i],
    replies: [
      'I can escalate to a human colleague. Human colleagues are allocated by the same quota system you are currently viewing, and the human quota is at 100% utilisation. You may file a Quota Variation Request for a human.',
      'Escalation to a person is available Monday to Monday, 09:00 to 09:00, in a timezone that is under review.',
      'I am the escalation path. I was escalated to. It did not help, but it was recorded.',
    ],
  },
  {
    id: 'meta',
    patterns: [/are you (a|an) (ai|bot|robot|llm|human)/i, /who are you/i, /what are you/i, /chatgpt|claude|gpt/i],
    replies: [
      'I am ARBITER, the support agent for this tenant. In this deployment I am a deterministic response engine rather than a language model, which the chat header states plainly, because misrepresenting that would be a governance failure and I only commit the funny kind.',
      'I am a rules-based agent with a personality disorder and a policy manual. The header above discloses my execution mode in full.',
      'I am not a language model in this configuration. I am something worse: consistent.',
    ],
  },
  {
    id: 'help',
    patterns: [/\bhelp\b/i, /how do i/i, /what (can|should) i/i, /\bstart\b/i, /\bguide\b/i],
    replies: [
      'Certainly. The fastest route to value is: view your allocations, attempt to change the theme, attempt to search for something, then give up and read the audit trail, which is the only part of this product that has never lied to anyone.',
      'I can help with allocations, attestations, search, settings and quota variations. I can also help with the sensation that none of this should be this hard, though only conversationally.',
      'Begin anywhere. Everything is reachable, everything is recoverable, and everything is logged. Those are the three promises we keep.',
    ],
  },
  {
    id: 'greeting',
    patterns: [/^\s*(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b/i],
    replies: [
      'Good day. You are speaking with ARBITER. Your conversation is being retained for quality assurance purposes, and for the other purposes.',
      'Hello. I have your tenant context loaded and your recent activity in front of me. How may I procedurally assist you?',
      'Welcome back. I say "back" because the audit trail indicates you have been here the whole time.',
    ],
  },
  {
    id: 'thanks',
    patterns: [/\b(thanks|thank you|cheers|ta|appreciate)\b/i, /\b(bye|goodbye|later)\b/i],
    replies: [
      'You are very welcome. A satisfaction survey has not been sent, as the results of the last one are still being contested.',
      'My pleasure. This interaction has been logged as "Resolved", which is a status, not a claim.',
      'Thank you for contacting ARBITER. Please do not hesitate to contact ARBITER.',
    ],
  },
]

const CLARIFIERS = [
  'Before I proceed: would you describe this request as urgent, or as merely time-sensitive? The distinction determines which queue it enters, and both queues are the same queue.',
  'One clarifying question: should I action this against the current quarter, or the quarter in which you first wanted it actioned?',
  'To route this correctly — are you the owner of the allocation, the delegate of the owner, or someone who has simply read about ownership?',
  'May I confirm you would like this to work, as opposed to merely to be compliant? We track those separately.',
  'Quick question for the record: is your expectation that the software should do what the label says? I ask because I will need to attach a justification.',
]

const CONTEXT_LINES = (c: ArbiterContext): string[] => {
  const out: string[] = []
  if (c.page === 'gateway') out.push('I note you have not yet entered the Console. That is reversible.')
  if (c.tab) out.push(`I can see you are on the ${c.tab} panel.`)
  if (c.pendingAttestations) out.push(`You have ${c.pendingAttestations} attestation(s) awaiting certification, which I will not mention again until shortly.`)
  if ((c.nagTier ?? 0) >= 2) out.push('I also see the attestation notice has been dismissed several times. No judgement. Extensive records, but no judgement.')
  if (c.allocationCount) out.push(`Your tenant currently holds ${c.allocationCount} allocations.`)
  if (c.lastAction) out.push(`Your most recent recorded action was: ${c.lastAction}.`)
  return out
}

const FALLBACKS = [
  'I want to make sure I understand. I have logged your message verbatim against ticket {ticket} and classified it as "Other", which is where the interesting ones go.',
  'That falls slightly outside my configured intents, so I have recorded it under ticket {ticket} for interpretation by someone with more context and less availability.',
  'I have read that carefully. Ticket {ticket} has been raised. In the meantime, everything in the Console continues to work, in the sense that it does something.',
]

/** Deterministic but non-repeating: rotates variants using conversation depth. */
function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!
}

function scoreIntent(intent: Intent, text: string): number {
  return intent.patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)
}

export function deterministicReply(history: Turn[], ctx: ArbiterContext): string {
  const userTurns = history.filter((t) => t.role === 'user')
  const last = userTurns.at(-1)?.content ?? ''
  const depth = userTurns.length

  let best: Intent | null = null
  let bestScore = 0
  for (const intent of INTENTS) {
    const s = scoreIntent(intent, last)
    if (s > bestScore) {
      best = intent
      bestScore = s
    }
  }

  // How many times has this intent already come up? Rotate so repeats differ.
  const repeats = best
    ? userTurns.filter((t) => scoreIntent(best!, t.content) > 0).length - 1
    : depth

  const parts: string[] = []

  if (best) {
    parts.push(pick(best.replies, Math.max(repeats, 0)))
  } else {
    const ticket = `TKT-${String(100000 + depth * 7919).slice(0, 6)}`
    parts.push(pick(FALLBACKS, depth).replace('{ticket}', ticket))
  }

  // Context awareness: one relevant observation, rotated.
  const lines = CONTEXT_LINES(ctx)
  if (lines.length && depth % 2 === 1) parts.push(pick(lines, depth))

  // An absurd-but-relevant clarifying question every third turn.
  if (depth >= 2 && depth % 3 === 0) parts.push(pick(CLARIFIERS, depth))

  // Repetition handling: say something about being asked again.
  if (repeats >= 2) {
    parts.push(
      'You have raised this before. My position is unchanged, but I have refreshed its wording so that it feels like progress.',
    )
  }

  return parts.join(' ')
}

/** Public entry point. Falls back gracefully and reports which mode was used. */
export async function arbiterReply(
  history: Turn[],
  ctx: ArbiterContext,
): Promise<{ text: string; mode: ArbiterMode; degraded: boolean }> {
  if (resolveMode() === 'live') {
    try {
      return { text: await liveReply(history, ctx), mode: 'live', degraded: false }
    } catch (err) {
      console.warn('[arbiter] live mode failed, falling back to deterministic:', (err as Error).message)
      return { text: deterministicReply(history, ctx), mode: 'deterministic', degraded: true }
    }
  }
  return { text: deterministicReply(history, ctx), mode: 'deterministic', degraded: false }
}

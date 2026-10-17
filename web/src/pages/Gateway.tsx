import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, Check, Gauge, Moon, ScrollText, ShieldCheck, Sun, Layers, Lock,
} from 'lucide-react'
import { Badge, Button, Card, Field, Modal, Notice, Select } from '../components/ui'
import { LuminanceModal } from '../components/LuminanceModal'
import { useStore } from '../store'
import { Mark } from '../components/Mark'

/**
 * Mechanic A — Navigation betrayal (Interface Interference).
 *
 * The primary CTA relocates on click, twice, then surrenders and opens a
 * "Pre-Authentication Readiness Assessment". Completing the assessment (or
 * ignoring it entirely) reaches the Console: the guest route sits immediately
 * beneath the button from the very first paint and always works.
 *
 * Non-negotiable: this is never a dead end, and the dodge is bounded so the
 * button cannot leave the viewport on a phone.
 */

const DODGES: { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 132, y: -6 },
  { x: -96, y: 30 },
]

const QUESTIONS: { q: string; options: string[] }[] = [
  {
    q: 'Which best describes your intent in clicking "Access Console"?',
    options: [
      'I intended to access the console',
      'I was testing whether the button worked',
      'I would rather not characterise my intent at this time',
    ],
  },
  {
    q: 'Have you previously accessed a token governance platform?',
    options: ['Yes', 'No', 'Yes, but I would describe it as having happened to me'],
  },
  {
    q: 'Do you consent to your consent being recorded?',
    options: ['Yes', 'Yes, with reservations', 'I consent to recording this question only'],
  },
]

export default function Gateway() {
  const nav = useNavigate()
  const { settings, note } = useStore()
  const [dodge, setDodge] = useState(0)
  const [assessment, setAssessment] = useState(false)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [assessErr, setAssessErr] = useState<string | null>(null)
  const [lum, setLum] = useState(false)

  const dark = settings.theme !== 'light'

  const onPrimary = useCallback(() => {
    if (dodge < DODGES.length - 1) {
      setDodge((d) => d + 1)
      note(`attempted sign-in; the button relocated (attempt ${dodge + 1})`)
      return
    }
    note('triggered the Pre-Authentication Readiness Assessment')
    setAssessment(true)
  }, [dodge, note])

  const enter = (how: string) => {
    note(`entered the Console ${how}`)
    nav('/console')
  }

  const offset = DODGES[dodge] ?? DODGES[0]!

  return (
    <div className="min-h-dvh bg-surface-0">
      {/* ------------------------------------------------------- top nav -- */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface-0/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-2.5">
            <Mark />
            <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">QUOTIENT</span>
            <Badge tone="neutral" className="ml-1 hidden sm:inline-flex">
              Governance Cloud
            </Badge>
          </div>
          <nav className="hidden items-center gap-7 text-[13.5px] text-muted md:flex">
            {['Platform', 'Controls', 'Attestation', 'Pricing'].map((l) => (
              <a key={l} href="#capabilities" className="transition-colors hover:text-ink">
                {l}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {/* Mechanic B: this does not toggle the theme. It opens a form. */}
            <button
              onClick={() => {
                note('attempted to change the interface theme')
                setLum(true)
              }}
              aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
              title={`Switch to ${dark ? 'light' : 'dark'} mode`}
              className="rounded-lg border border-line bg-surface-1 p-2 text-muted transition-colors hover:text-ink"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <Button variant="ghost" size="sm" onClick={() => enter('via the header link')}>
              Docs
            </Button>
          </div>
        </div>
      </header>

      {/* ----------------------------------------------------------- hero -- */}
      <section className="relative overflow-hidden">
        <div className="grid-backdrop pointer-events-none absolute inset-0" />
        <div className="sheen pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 pt-16 pb-20 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge tone="accent" className="mb-5">
              <ShieldCheck size={12} /> SOC 2 Type II · ISO 27001 · GS-19 conformant
            </Badge>
            <h1 className="text-balance text-[38px] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[56px]">
              Every token your organisation spends,
              <span className="text-accent"> governed.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-[15.5px] leading-relaxed text-muted sm:text-[17px]">
              QUOTIENT gives finance, legal and platform teams a single ledger for LLM token allocation, quota
              variation and quarterly attestation — with an audit trail that never forgets.
            </p>

            {/* ---- the fugitive CTA (bounded, always recoverable) ---- */}
            <div className="relative mt-9 flex h-[108px] flex-col items-center justify-start">
              <motion.div
                animate={{ x: offset.x, y: offset.y }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="max-[480px]:!translate-x-0"
              >
                <Button variant="primary" size="lg" onClick={onPrimary} data-testid="access-console">
                  Access Console <ArrowRight size={16} />
                </Button>
              </motion.div>

              <div className="absolute top-[58px] flex flex-col items-center gap-2">
                {dodge > 0 && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-sm text-[12px] leading-relaxed text-dim"
                  >
                    {dodge === 1
                      ? 'Adaptive Affordance Programme: confirming deliberate intent (1 of 2).'
                      : 'Intent partially confirmed. One further confirmation is required.'}
                  </motion.p>
                )}
                {/* Always present, from the first paint. Never moves. */}
                <button
                  onClick={() => enter('as a guest')}
                  data-testid="guest-entry"
                  className="text-[13px] text-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-accent"
                >
                  Continue as guest — full read &amp; write on the demo tenant
                </button>
              </div>
            </div>
          </div>

          {/* ---- trust strip ---- */}
          <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-4">
            {[
              ['2.1B', 'tokens governed'],
              ['14', 'live allocations'],
              ['99.98%', 'ledger uptime'],
              ['7 yr', 'retention'],
            ].map(([v, l]) => (
              <div key={l} className="bg-surface-1 px-4 py-4 text-center">
                <div className="nums text-[20px] font-semibold tracking-[-0.02em] text-ink">{v}</div>
                <div className="mt-0.5 text-[11.5px] text-dim">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- capabilities -- */}
      <section id="capabilities" className="mx-auto max-w-6xl px-5 pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: <Gauge size={17} />,
              t: 'Allocation ledger',
              d: 'Per-team token budgets with live utilisation, unit rates and projected spend, reconciled continuously against the provider record.',
            },
            {
              icon: <ScrollText size={17} />,
              t: 'Attestation workflow',
              d: 'Quarterly certification with dual-attestor sign-off, document control numbering and a retention schedule you did not ask for.',
            },
            {
              icon: <Layers size={17} />,
              t: 'Immutable audit trail',
              d: 'Every configuration change, dismissal and variation recorded. The only component of this product that has never misled anyone.',
            },
          ].map((c) => (
            <Card key={c.t} className="p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-wash text-accent">
                {c.icon}
              </div>
              <h3 className="text-[14.5px] font-semibold text-ink">{c.t}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{c.d}</p>
            </Card>
          ))}
        </div>

        <Card className="mt-4 flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-[14.5px] font-semibold text-ink">Ready to be governed?</h3>
            <p className="mt-1 text-[13px] text-muted">
              The demonstration tenant is pre-populated and fully writable. Nothing here is billable.
            </p>
          </div>
          <Button variant="primary" onClick={() => enter('from the footer call to action')}>
            Open the Console <ArrowRight size={15} />
          </Button>
        </Card>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-7 text-[12px] text-dim sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 QUOTIENT Governance Cloud — a fictional product built for a prompt-engineering hackathon.</span>
          <span className="flex items-center gap-1.5">
            <Lock size={12} /> Attack on Token V2
          </span>
        </div>
      </footer>

      {/* -------------------------------------- readiness assessment ------- */}
      <Modal
        open={assessment}
        onClose={() => setAssessment(false)}
        eyebrow="Form PRA-3 · Pre-authentication"
        title="Pre-Authentication Readiness Assessment"
        width="max-w-xl"
      >
        <div className="space-y-4">
          <Notice tone="warn" title="This assessment is not a barrier">
            You may close this dialog at any time and continue as a guest with identical permissions. The assessment
            exists so that your access can be characterised, not restricted.
          </Notice>

          {QUESTIONS.map((item, i) => (
            <Field key={i} label={`Question ${i + 1} of ${QUESTIONS.length}`} required>
              <p className="mb-2 text-[13.5px] leading-relaxed text-ink">{item.q}</p>
              <Select
                value={answers[i] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                aria-label={item.q}
              >
                <option value="">Select a response…</option>
                {item.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Field>
          ))}

          {assessErr && (
            <p role="alert" className="text-[12.5px] font-medium text-danger">
              {assessErr}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => enter('by abandoning the readiness assessment')}>
              Skip and continue as guest
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (Object.keys(answers).length < QUESTIONS.length) {
                  setAssessErr('All three responses are required. Any three. We do not read them.')
                  return
                }
                enter('having completed the readiness assessment in full')
              }}
            >
              <Check size={15} /> Submit and enter
            </Button>
          </div>
        </div>
      </Modal>

      <LuminanceModal open={lum} onClose={() => setLum(false)} target={dark ? 'light' : 'dark'} />
    </div>
  )
}

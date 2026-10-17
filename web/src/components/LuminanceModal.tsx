import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, FileCheck2, ShieldCheck } from 'lucide-react'
import { Button, Field, Modal, Notice, Select, Textarea } from './ui'
import { useStore } from '../store'
import { RequestFailed } from '../api'

/**
 * Mechanic B — Forced Action.
 *
 * The theme toggle does not change the theme. It opens a Luminance Change
 * Request. The request is real: it validates server-side, persists the theme,
 * and issues a receipt with a document control number. The joke is the
 * ceremony, not a broken feature — the user always gets the theme they asked
 * for.
 */

const STEPS = [
  'Validating business justification against GS-19 §4.2…',
  'Routing to Luminance Steward (delegated: ARBITER)…',
  'Assessing photometric risk to adjacent workspaces…',
  'Recording decision in the immutable audit trail…',
]

export function LuminanceModal({
  open,
  onClose,
  target,
}: {
  open: boolean
  onClose: () => void
  target: 'light' | 'dark'
}) {
  const { requestLuminance } = useStore()
  const [theme, setTheme] = useState(target)
  const [justification, setJustification] = useState('')
  const [ack, setAck] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(-1)
  const [receipt, setReceipt] = useState<string | null>(null)

  // Reset on the closed->open transition ONLY. Resetting whenever `target`
  // changes would wipe the success receipt the instant approval flips the
  // theme (and therefore flips the target the parent passes down).
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setTheme(target)
      setJustification('')
      setAck(false)
      setError(null)
      setStep(-1)
      setReceipt(null)
    }
    wasOpen.current = open
  }, [open, target])

  // The "review period". It exists for audit symmetry. It always approves.
  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return
    const t = window.setTimeout(() => setStep((s) => s + 1), 520)
    return () => window.clearTimeout(t)
  }, [step])

  useEffect(() => {
    if (step !== STEPS.length) return
    let cancelled = false
    requestLuminance(theme, justification)
      .then((r) => !cancelled && setReceipt(r.control_number))
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof RequestFailed ? e.detail.message : 'The Steward is unavailable.')
        setStep(-1)
      })
    return () => {
      cancelled = true
    }
  }, [step, theme, justification, requestLuminance])

  const short = justification.trim().length < 40
  const submitting = step >= 0 && !receipt

  function submit() {
    setError(null)
    if (short) return setError('A business justification of at least 40 characters is required (GS-19 §4.2).')
    if (!ack) return setError('You must acknowledge the Luminance Change Advisory.')
    setStep(0)
  }

  return (
    <Modal open={open} onClose={onClose} eyebrow="Form LCR-1 · Controlled configuration item" title="Luminance Change Request" width="max-w-xl">
      {receipt ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-ok/35 bg-ok/8 px-4 py-3.5">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" />
            <div>
              <div className="text-[13.5px] font-semibold text-ink">Request approved</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                Your interface luminance is now <strong className="text-ink">{theme}</strong> and has been persisted
                against your tenant. Approval was never in doubt; the review period exists for audit symmetry.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] tracking-[0.1em] text-dim uppercase">
              <FileCheck2 size={13} /> Document control number
            </div>
            <div className="nums mt-1 font-mono text-[13px] text-ink">{receipt}</div>
            <p className="mt-2 text-[12px] leading-relaxed text-dim">
              Retention schedule RS-7 — retain 7 years from end of fiscal year, then review, then retain.
            </p>
          </div>
          <Button variant="primary" className="w-full" onClick={onClose}>
            Acknowledge and return to work
          </Button>
        </div>
      ) : submitting ? (
        <div className="space-y-2.5 py-2">
          {STEPS.map((s, i) => (
            <motion.div
              key={s}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: i <= step ? 1 : 0.3, x: 0 }}
              className="flex items-center gap-2.5 text-[13px]"
            >
              {i < step ? (
                <CheckCircle2 size={15} className="shrink-0 text-ok" />
              ) : (
                <div className="h-[15px] w-[15px] shrink-0 rounded-full border-2 border-accent border-t-transparent motion-safe:animate-spin" />
              )}
              <span className={i <= step ? 'text-ink' : 'text-dim'}>{s}</span>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Notice tone="accent" title="Why am I seeing this?">
            Interface luminance is a controlled configuration item under Governance Standard GS-19 §4.2. The theme you
            requested <em>will</em> be applied. We simply need it in writing.
          </Notice>

          <Field label="Requested luminance" required>
            <Select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}>
              <option value="light">Light — elevated glare exposure</option>
              <option value="dark">Dark — standard posture</option>
            </Select>
          </Field>

          <Field
            label="Business justification"
            required
            error={error && short ? error : null}
            hint={
              <span className={short ? 'text-warn' : 'text-ok'}>
                {justification.trim().length} / 40 characters minimum. Brevity is itself a governance risk.
              </span>
            }
          >
            <Textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="e.g. Ambient illumination in our workspace exceeds the tolerances assumed by the dark theme."
              aria-label="Business justification"
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="text-[12.5px] leading-relaxed text-muted">
              I acknowledge the <strong className="text-ink">Luminance Change Advisory</strong>: that changing the
              interface theme changes the interface theme, and that this will be visible to me and to anyone looking at
              my screen.
            </span>
          </label>

          {error && !short && (
            <p role="alert" className="text-[12.5px] font-medium text-danger">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="flex items-center gap-1.5 text-[11.5px] text-dim">
              <ShieldCheck size={13} /> Reviewed by ARBITER, Luminance Steward
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Not now
              </Button>
              <Button variant="primary" onClick={submit}>
                Submit request
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

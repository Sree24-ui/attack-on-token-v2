import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-contrast hover:brightness-110 active:brightness-95 shadow-[0_1px_0_rgba(255,255,255,.12)_inset]',
  secondary:
    'bg-surface-3 text-ink border border-line-strong hover:bg-surface-2 active:brightness-95',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95',
  quiet: 'text-dim hover:text-ink underline underline-offset-4 decoration-dotted',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean }) {
  const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]' }
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap',
        'transition-[background-color,color,filter,box-shadow,transform] duration-150',
        'disabled:opacity-45 disabled:pointer-events-none select-none',
        variant !== 'quiet' && sizes[size],
        VARIANTS[variant],
        className,
      )}
    >
      {busy && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-[14px] border border-line bg-surface-1 shadow-[var(--shadow-card)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHead({
  title,
  sub,
  right,
}: {
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

const TONES = {
  neutral: 'bg-surface-2 text-muted border-line',
  accent: 'bg-accent-wash text-accent border-transparent',
  ok: 'bg-ok/12 text-ok border-transparent',
  warn: 'bg-warn/15 text-warn border-transparent',
  danger: 'bg-danger/12 text-danger border-transparent',
} as const

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: keyof typeof TONES
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium tracking-wide text-muted uppercase">
        {label}
        {required && <span className="text-danger">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-[12px] leading-relaxed text-dim">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1.5 block text-[12px] leading-relaxed font-medium text-danger">
          {error}
        </span>
      )}
    </label>
  )
}

const CONTROL =
  'w-full rounded-lg border border-line-strong bg-surface-3 px-3 py-2 text-sm text-ink placeholder:text-dim transition-colors focus:border-accent'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, 'h-10', props.className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(CONTROL, 'min-h-[92px] resize-y leading-relaxed', props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(CONTROL, 'h-10 cursor-pointer pr-8', props.className)} />
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  locked,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: ReactNode
  locked?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-5 py-3.5">
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium text-ink">{label}</div>
        {description && <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{description}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={locked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm"
          style={{ left: checked ? 19 : 3 }}
        />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  width = 'max-w-lg',
  dismissable = true,
}: {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  children: ReactNode
  width?: string
  dismissable?: boolean
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 py-[8vh] backdrop-blur-sm"
          onClick={() => dismissable && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className={cx(
              'w-full rounded-[16px] border border-line bg-surface-1 shadow-[var(--shadow-pop)]',
              width,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                {eyebrow && (
                  <div className="mb-1 font-mono text-[10.5px] tracking-[0.14em] text-dim uppercase">
                    {eyebrow}
                  </div>
                )}
                <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
              </div>
              {/* Always escapable. No modal traps. */}
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="-mt-1 -mr-1 rounded-lg p-2 text-dim transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  foot,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  foot?: ReactNode
  tone?: 'neutral' | 'accent' | 'warn'
}) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-[11px] font-medium tracking-[0.08em] text-dim uppercase">{label}</div>
      <div
        className={cx(
          'nums mt-1.5 text-[25px] leading-none font-semibold tracking-[-0.025em]',
          tone === 'accent' && 'text-accent',
          tone === 'warn' && 'text-warn',
          tone === 'neutral' && 'text-ink',
        )}
      >
        {value}
      </div>
      {foot && <div className="mt-1.5 text-[12px] text-muted">{foot}</div>}
    </Card>
  )
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-dim">
        {icon}
      </div>
      <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Rows({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-px">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton h-[52px]" />
      ))}
    </div>
  )
}

export function Meter({ value, tone }: { value: number; tone?: 'ok' | 'warn' | 'danger' }) {
  const pct = Math.min(Math.max(value, 0), 1) * 100
  const colour = tone === 'danger' ? 'bg-danger' : tone === 'warn' ? 'bg-warn' : 'bg-accent'
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className={cx('h-full rounded-full', colour)}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

export function Notice({
  tone = 'accent',
  title,
  children,
  action,
}: {
  tone?: 'accent' | 'warn' | 'danger'
  title?: string
  children: ReactNode
  action?: ReactNode
}) {
  const ring = { accent: 'border-accent/35 bg-accent-wash', warn: 'border-warn/35 bg-warn/8', danger: 'border-danger/35 bg-danger/8' }[tone]
  return (
    <div className={cx('rounded-xl border px-4 py-3', ring)}>
      {title && <div className="mb-1 text-[12.5px] font-semibold text-ink">{title}</div>}
      <div className="text-[12.5px] leading-relaxed text-muted">{children}</div>
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  )
}

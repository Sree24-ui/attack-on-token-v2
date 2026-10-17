import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Headset, Send, X } from 'lucide-react'
import { api, post } from '../api'
import { useStore } from '../store'
import type { ChatRow } from '../types'
import { Badge, Button, cx } from './ui'

/**
 * Mechanic G — ARBITER, the support agent.
 *
 * Execution mode is fetched from the server and disclosed in the header. When
 * no ANTHROPIC_API_KEY is configured this is a deterministic response engine,
 * and it says so, because claiming otherwise would be the one dishonest thing
 * in an application otherwise built entirely out of honest dishonesty.
 */

const SUGGESTIONS = [
  'Why does the sign-in button keep moving?',
  'Why did my search return nothing?',
  'How do I stop these notifications?',
  'Can I speak to a human?',
]

type Health = { mode: 'live' | 'deterministic'; disclosure: string; model: string | null }

export function ArbiterDock({ tab }: { tab: string }) {
  const { sessionId, lastAction } = useStore()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ChatRow[]>([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void api<Health>('/arbiter/health').then(setHealth).catch(() => setHealth(null))
  }, [])

  useEffect(() => {
    if (!open) return
    void api<{ rows: ChatRow[] }>(`/chat/${sessionId}`)
      .then((r) => setRows(r.rows))
      .catch(() => setError('Could not load the conversation history.'))
  }, [open, sessionId])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [rows, thinking])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || thinking) return
      setDraft('')
      setError(null)
      setRows((r) => [
        ...r,
        { id: Date.now(), session_id: sessionId, role: 'user', content, created_at: new Date().toISOString() },
      ])
      setThinking(true)
      try {
        const r = await post<{ reply: string; mode: string; degraded: boolean }>('/chat', {
          session_id: sessionId,
          message: content,
          context: { page: 'console', tab, lastAction },
        })
        setRows((rs) => [
          ...rs,
          { id: Date.now() + 1, session_id: sessionId, role: 'arbiter', content: r.reply, created_at: new Date().toISOString() },
        ])
        if (r.degraded) setError('The live model was unreachable; ARBITER fell back to the local engine.')
      } catch (e) {
        setError((e as Error).message || 'ARBITER is unavailable. Your message was not recorded.')
      } finally {
        setThinking(false)
      }
    },
    [sessionId, tab, lastAction, thinking],
  )

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="pointer-events-auto flex h-[min(560px,calc(100dvh-7rem))] w-[min(392px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[16px] border border-line bg-surface-1 shadow-[var(--shadow-pop)]"
          >
            {/* header ------------------------------------------------- */}
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
                  </span>
                  <h3 className="text-[14px] font-semibold text-ink">ARBITER</h3>
                  <Badge tone={health?.mode === 'live' ? 'ok' : 'neutral'}>
                    {health ? (health.mode === 'live' ? `live · ${health.model}` : 'deterministic engine') : '…'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-dim">
                  {health?.mode === 'deterministic'
                    ? 'Rules-based support agent — not a language model.'
                    : 'Support agent · Tenant: demo · Retained for quality assurance.'}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close ARBITER"
                className="-mt-1 -mr-1 rounded-lg p-1.5 text-dim transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X size={15} />
              </button>
            </div>

            {/* transcript --------------------------------------------- */}
            <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {rows.length === 0 && !thinking && (
                <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
                  Good day. You are speaking with ARBITER. I have your tenant context loaded, including your recent
                  activity. How may I procedurally assist you?
                </div>
              )}

              {rows.map((m) => (
                <div key={m.id} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cx(
                      'max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed',
                      m.role === 'user'
                        ? 'rounded-br-md bg-accent text-accent-contrast'
                        : 'rounded-bl-md border border-line bg-surface-2 text-ink',
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {thinking && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-line bg-surface-2 px-4 py-3">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-dim"
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-danger/35 bg-danger/8 px-3 py-2.5 text-[12px] leading-relaxed text-danger">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* suggestions + composer --------------------------------- */}
            {rows.length === 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-2.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] text-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void send(draft)
              }}
              className="flex items-center gap-2 border-t border-line px-3 py-3"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Describe your issue in full…"
                aria-label="Message ARBITER"
                data-testid="arbiter-input"
                className="h-10 flex-1 rounded-lg border border-line-strong bg-surface-3 px-3 text-[13px] text-ink placeholder:text-dim focus:border-accent"
              />
              <Button type="submit" variant="primary" size="md" busy={thinking} aria-label="Send" className="!px-3">
                {!thinking && <Send size={15} />}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {!open && (
        <motion.button
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => setOpen(true)}
          data-testid="arbiter-open"
          className="pointer-events-auto flex h-12 items-center gap-2.5 self-end rounded-full bg-accent px-5 text-[13.5px] font-medium text-accent-contrast shadow-[var(--shadow-pop)] transition-[filter] hover:brightness-110"
        >
          <Headset size={16} /> Ask ARBITER
        </motion.button>
      )}
    </>
  )
}

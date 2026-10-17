import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, X } from 'lucide-react'
import { Button } from './ui'
import { useStore } from '../store'

/**
 * Mechanic F — Nagging (Gray et al. 2018).
 *
 * Dismissing escalates the register of the notice and schedules its return.
 * From tier 2 onward the genuine escape hatch is offered inline, and it works:
 * "File cessation request" mutes the notice permanently and persists that.
 */
export function NagToast() {
  const { nag, dismissNag, muteNag } = useStore()

  return (
    <AnimatePresence>
      {nag && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          role="status"
          className="pointer-events-auto w-[min(380px,calc(100vw-2rem))] rounded-[14px] border border-line bg-surface-1 p-4 shadow-[var(--shadow-pop)]"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warn/15 text-warn">
              <BellRing size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">
                  Governance notice · tier {nag.tier + 1} of 5
                </span>
                <button
                  onClick={() => void dismissNag()}
                  aria-label="Dismiss notice"
                  data-testid="nag-dismiss"
                  className="-mt-1 -mr-1 rounded-md p-1.5 text-dim transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink">{nag.body}</p>
              {nag.tier >= 2 && (
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void muteNag()} data-testid="nag-mute">
                    File cessation request
                  </Button>
                  <span className="text-[11px] text-dim">(this genuinely works)</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

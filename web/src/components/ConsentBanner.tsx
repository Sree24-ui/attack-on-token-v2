import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cookie } from 'lucide-react'
import { Button } from './ui'
import { useStore } from '../store'

/**
 * Mechanic H — Obstruction, bounded.
 *
 * Declining takes three screens instead of one. It does, however, genuinely
 * decline, persist, and never ask again. Accepting takes one click, which is
 * exactly the asymmetry the pattern is famous for.
 */
export function ConsentBanner() {
  const { settings, saveSettings, note } = useStore()
  const [stage, setStage] = useState(0)
  const open = settings.consent_state === 'unanswered'

  const settle = async (state: 'accepted' | 'declined') => {
    note(`${state} the cookie consent after ${stage + 1} screen(s)`)
    await saveSettings({ consent_state: state })
  }

  const SCREENS = [
    {
      body: 'QUOTIENT uses Essential, Non-Essential and Aspirational cookies. Aspirational cookies are not currently set but describe cookies we would like to set.',
      decline: 'Manage preferences',
    },
    {
      body: 'Declining Non-Essential cookies will not degrade your experience. Declining Aspirational cookies may degrade our experience. Please confirm you have considered this.',
      decline: 'I have considered it',
    },
    {
      body: 'Final confirmation. Your refusal will be stored in a cookie, which is Essential, and therefore exempt from your refusal.',
      decline: 'Decline everything',
    },
  ]

  const screen = SCREENS[Math.min(stage, SCREENS.length - 1)]!

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-1/95 backdrop-blur-xl"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <Cookie size={17} className="hidden shrink-0 text-accent sm:block" />
            <p className="flex-1 text-[12.5px] leading-relaxed text-muted">
              {screen.body}
              {stage > 0 && <span className="ml-1.5 text-dim">(step {stage + 1} of 3)</span>}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="ghost"
                data-testid="consent-decline"
                onClick={() => (stage >= SCREENS.length - 1 ? void settle('declined') : setStage((s) => s + 1))}
              >
                {screen.decline}
              </Button>
              <Button size="sm" variant="primary" onClick={() => void settle('accepted')}>
                Accept all
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

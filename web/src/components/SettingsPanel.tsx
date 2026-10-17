import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Moon, RotateCcw, Sun, Unlock } from 'lucide-react'
import { useStore } from '../store'
import { Button, Card, CardHead, Notice, Toggle } from './ui'
import { LuminanceModal } from './LuminanceModal'

/**
 * Mechanic D — Settings contradictions (Interface Interference).
 *
 * Interlocks are enforced server-side, explained in plain language the moment
 * they fire, and can all be switched off permanently with one control. The
 * contradiction is coherent, documented and escapable.
 */
export function SettingsPanel() {
  const { settings, saveSettings, note, resetDemo, muteNag } = useStore()
  const [notes, setNotes] = useState<string[]>([])
  const [lum, setLum] = useState(false)
  const [resetting, setResetting] = useState(false)

  const on = (k: string) => settings[k] === 'true'
  const overridden = on('interlocks_overridden')

  const set = async (k: string, v: string, label: string) => {
    const n = await saveSettings({ [k]: v })
    setNotes(n)
    note(`changed the setting "${label}"`)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHead
            title="Interface"
            sub="Presentation preferences. Several are interlocked for governance reasons."
            right={
              <span className="flex items-center gap-1.5 text-[11px] text-dim">
                <Link2 size={12} /> {overridden ? 'interlocks off' : '3 interlocks active'}
              </span>
            }
          />
          <div className="divide-y divide-line px-5">
            {/* Theme is a controlled configuration item — it routes to a form. */}
            <div className="flex items-center justify-between gap-4 py-3.5">
              <div>
                <div className="text-[13.5px] font-medium text-ink">Interface luminance</div>
                <div className="mt-0.5 text-[12.5px] text-muted">
                  Controlled configuration item (GS-19 §4.2). Changes require a Luminance Change Request.
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                data-testid="settings-theme"
                onClick={() => {
                  note('attempted to change the interface theme from Settings')
                  setLum(true)
                }}
              >
                {settings.theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                Request {settings.theme === 'light' ? 'dark' : 'light'}
              </Button>
            </div>

            <Toggle
              label="Compact density"
              description="Reduces row height across the Console."
              checked={settings.density === 'compact'}
              onChange={(v) => void set('density', v ? 'compact' : 'comfortable', 'Compact density')}
            />
            <Toggle
              label="Verbose Audit Banner"
              description="Displays the full governance disclosure at the top of every panel."
              checked={on('verbose_audit_banner')}
              onChange={(v) => void set('verbose_audit_banner', String(v), 'Verbose Audit Banner')}
            />
            <Toggle
              label="Reduce motion"
              description="Minimises non-essential animation."
              checked={on('reduce_motion')}
              onChange={(v) => void set('reduce_motion', String(v), 'Reduce motion')}
            />
            <Toggle
              label="Decorative Transitions (Compliance)"
              description="Visibly indicates that an accessibility accommodation is in effect."
              checked={on('decorative_transitions')}
              onChange={(v) => void set('decorative_transitions', String(v), 'Decorative Transitions')}
            />
          </div>
        </Card>

        <Card>
          <CardHead title="Search & filtering" sub="How the Console interprets what you type and select." />
          <div className="divide-y divide-line px-5">
            <Toggle
              label="Literal Interpretation Policy (LIP-7)"
              description="Match queries as exact, case-sensitive character sequences. Disabling this makes search behave the way you expect."
              checked={on('literal_search')}
              onChange={(v) => void set('literal_search', String(v), 'LIP-7 literal search')}
            />
            <Toggle
              label="Policy interpretation of filters"
              description='Interprets "status: active" as "has ever held status active". Disabling this interprets filters in plain English.'
              checked={settings.filter_interpretation === 'policy'}
              onChange={(v) => void set('filter_interpretation', v ? 'policy' : 'plain', 'Filter interpretation')}
            />
          </div>
        </Card>

        <Card>
          <CardHead title="Notifications" sub="Governance notices and their cessation." />
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <div className="text-[13.5px] font-medium text-ink">Notification Cessation Request</div>
              <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
                Permanently silences the Q3 attestation notice. Takes effect immediately and genuinely works. Filing
                one is itself a reportable governance event, which we mention for completeness.
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={on('notifications_muted')}
              data-testid="settings-mute"
              onClick={() => void muteNag().then(() => note('filed a Notification Cessation Request'))}
            >
              {on('notifications_muted') ? 'Already filed' : 'File request'}
            </Button>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <AnimatePresence>
          {notes.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Notice
                tone="warn"
                title="An interlock was applied"
                action={
                  <Button size="sm" variant="ghost" onClick={() => setNotes([])}>
                    Understood
                  </Button>
                }
              >
                <ul className="list-disc space-y-1.5 pl-4">
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </Notice>
            </motion.div>
          )}
        </AnimatePresence>

        <Card>
          <CardHead title="Governance posture" sub="The escape hatch, documented." />
          <div className="space-y-3 px-5 py-4">
            <p className="text-[12.5px] leading-relaxed text-muted">
              Interlocks exist so that one setting cannot quietly defeat another. They are also, candidly, the reason
              turning on Compact Density makes the page taller. You may disable all of them at once.
            </p>
            <Toggle
              label="Override all interlocks"
              description="Settings become independent. Logs an audit event titled “Governance Posture Weakened”, which is editorialising on our part."
              checked={overridden}
              onChange={(v) => void set('interlocks_overridden', String(v), 'Override all interlocks')}
            />
            {overridden && (
              <Notice tone="accent">
                <span className="flex items-center gap-1.5">
                  <Unlock size={12} /> Interlocks are off. Every toggle now does exactly one thing.
                </span>
              </Notice>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Demonstration controls" sub="For judges, and for anyone who has had enough." />
          <div className="space-y-3 px-5 py-4">
            <p className="text-[12.5px] leading-relaxed text-muted">
              Restores the seeded tenant, clears the audit trail, resets every setting and un-escalates the
              notification. Nothing here is billable and nothing leaves your machine.
            </p>
            <Button
              variant="secondary"
              busy={resetting}
              data-testid="settings-reset"
              onClick={async () => {
                setResetting(true)
                await resetDemo()
                setNotes([])
                setResetting(false)
              }}
            >
              <RotateCcw size={14} /> Reset demonstration state
            </Button>
          </div>
        </Card>
      </div>

      <LuminanceModal open={lum} onClose={() => setLum(false)} target={settings.theme === 'light' ? 'dark' : 'light'} />
    </div>
  )
}

import { motion } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, Gauge, History, Moon, ScrollText, SlidersHorizontal, Sun,
} from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../store'
import { fmtTokens, fmtUsd } from '../api'
import { Badge, Card, StatTile, cx } from '../components/ui'
import { Mark } from '../components/Mark'
import { AllocationsPanel } from '../components/AllocationsPanel'
import { AttestationsPanel } from '../components/AttestationsPanel'
import { AuditPanel } from '../components/AuditPanel'
import { SettingsPanel } from '../components/SettingsPanel'
import { LuminanceModal } from '../components/LuminanceModal'
import { ArbiterDock } from '../components/ArbiterDock'
import { NagToast } from '../components/NagToast'

const PANELS = [
  { id: 'allocations', label: 'Allocations', icon: Gauge },
  { id: 'attestations', label: 'Attestations', icon: ScrollText },
  { id: 'audit', label: 'Audit trail', icon: History },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
] as const

type PanelId = (typeof PANELS)[number]['id']

export default function Console() {
  const { boot, settings, loading, error, note } = useStore()
  const [params, setParams] = useSearchParams()
  const [lum, setLum] = useState(false)

  const raw = params.get('panel') as PanelId | null
  const panel: PanelId = PANELS.some((p) => p.id === raw) ? raw! : 'allocations'
  const dark = settings.theme !== 'light'
  const compact = settings.density === 'compact'
  const summary = boot?.summary

  const go = (id: PanelId) => {
    setParams({ panel: id }, { replace: true })
    note(`opened the ${id} panel`)
  }

  return (
    <div className="min-h-dvh bg-surface-0">
      {/* ------------------------------------------------------- top bar -- */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface-0/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5" aria-label="QUOTIENT home">
              <Mark />
              <span className="hidden text-[15px] font-semibold tracking-[-0.02em] text-ink sm:inline">QUOTIENT</span>
            </Link>
            <span className="hidden h-5 w-px bg-line sm:block" />
            <div className="hidden min-w-0 sm:block">
              <div className="truncate text-[13px] font-medium text-ink">Northwind Industries</div>
              <div className="truncate text-[11px] text-dim">Demonstration tenant · guest session</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="accent" className="hidden md:inline-flex">
              FY26 Q3
            </Badge>
            <button
              onClick={() => {
                note('attempted to change the interface theme')
                setLum(true)
              }}
              aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
              title={`Switch to ${dark ? 'light' : 'dark'} mode`}
              data-testid="console-theme"
              className="rounded-lg border border-line bg-surface-1 p-2 text-muted transition-colors hover:text-ink"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-wash text-[11.5px] font-semibold text-accent"
              title="demo.operator@quotient.cloud"
            >
              DO
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-5 sm:px-6">
        {/* ------------------------------------------------------ sidebar -- */}
        <nav aria-label="Console sections" className="hidden w-[216px] shrink-0 lg:block">
          <div className="sticky top-[84px] space-y-1">
            {PANELS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => go(id)}
                aria-current={panel === id ? 'page' : undefined}
                data-testid={`nav-${id}`}
                className={cx(
                  'relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors',
                  panel === id ? 'bg-accent-wash font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                {panel === id && (
                  <motion.span
                    layoutId="nav-rail"
                    className="absolute top-1.5 bottom-1.5 -left-px w-[2px] rounded-full bg-accent"
                  />
                )}
                <Icon size={15} /> {label}
              </button>
            ))}

            <div className="!mt-5 rounded-xl border border-line bg-surface-1 px-3.5 py-3">
              <div className="text-[11px] tracking-[0.08em] text-dim uppercase">Pending</div>
              <div className="nums mt-1 text-[20px] font-semibold text-warn">
                {summary?.pendingAttestations ?? '—'}
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted">attestations awaiting certification</div>
            </div>
          </div>
        </nav>

        {/* --------------------------------------------------------- main -- */}
        <main className="min-w-0 flex-1 space-y-4 pb-28">
          {/* mobile / tablet tabs */}
          <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 pb-px lg:hidden">
            {PANELS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => go(id)}
                data-testid={`tab-${id}`}
                className={cx(
                  'shrink-0 border-b-2 px-3 py-2.5 text-[13px] transition-colors',
                  panel === id ? 'border-accent font-medium text-accent' : 'border-transparent text-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {settings.verbose_audit_banner === 'true' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
              <Card className="flex items-start gap-3 border-warn/35 bg-warn/8 px-4 py-3">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
                <p className="text-[12px] leading-relaxed text-muted">
                  <strong className="text-ink">Verbose Audit Disclosure (GS-19 §7.1).</strong> All interactions within
                  this Console are recorded to an append-only audit trail, retained under schedule RS-7 for seven
                  years, then reviewed, then retained. This banner is displayed because a setting you enabled requires
                  a compensating control. It can be switched off in Settings, which will enable something else.
                </p>
              </Card>
            </motion.div>
          )}

          {error && (
            <Card className="border-danger/40 bg-danger/8 px-4 py-3 text-[12.5px] text-danger">
              The governance service is unreachable: {error}. Start the API with{' '}
              <code className="font-mono">npm run dev</code>.
            </Card>
          )}

          {/* stat tiles */}
          <div className={cx('grid grid-cols-2 gap-3 xl:grid-cols-4', compact && 'gap-2')}>
            <StatTile
              label="Allocations"
              value={loading ? '—' : (summary?.allocations ?? 0)}
              foot="across 14 teams"
            />
            <StatTile
              label="Tokens granted"
              value={loading ? '—' : fmtTokens(summary?.tokensGranted ?? 0)}
              foot={`${fmtTokens(summary?.tokensUsed ?? 0)} consumed`}
            />
            <StatTile
              label="Projected spend"
              value={loading ? '—' : fmtUsd(summary?.spendUsd ?? 0)}
              tone="accent"
              foot="current period, unaudited"
            />
            <StatTile
              label="Pending attestations"
              value={loading ? '—' : (summary?.pendingAttestations ?? 0)}
              tone={summary?.pendingAttestations ? 'warn' : 'neutral'}
              foot="require certification"
            />
          </div>

          <motion.div
            key={panel}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            {panel === 'allocations' && <AllocationsPanel />}
            {panel === 'attestations' && <AttestationsPanel />}
            {panel === 'audit' && <AuditPanel />}
            {panel === 'settings' && <SettingsPanel />}
          </motion.div>

          <footer className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11.5px] text-dim">
            <span>Attack on Token V2 · QUOTIENT Governance Cloud · demonstration build</span>
            <Link to="/" className="underline decoration-dotted underline-offset-4 hover:text-ink">
              Return to the gateway
            </Link>
          </footer>
        </main>
      </div>

      {/* ------------------------------------------------------- overlays -- */}
      <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
        <NagToast />
        <ArbiterDock tab={panel} />
      </div>

      <LuminanceModal open={lum} onClose={() => setLum(false)} target={dark ? 'light' : 'dark'} />
    </div>
  )
}

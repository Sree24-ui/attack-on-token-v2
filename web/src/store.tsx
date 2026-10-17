import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, patch, post } from './api'
import type { Bootstrap, Settings } from './types'

/**
 * Single source of truth for cross-cutting app state: server-persisted
 * settings, the theme, the nag notice, and the "last action" breadcrumb that
 * ARBITER uses to sound unnervingly well informed.
 */

type Nag = { key: string; tier: number; body: string; dismissed: number } | null

type Store = {
  boot: Bootstrap | null
  settings: Settings
  loading: boolean
  error: string | null
  nag: Nag
  lastAction: string | undefined
  sessionId: string

  reload: () => Promise<void>
  note: (action: string) => void
  saveSettings: (p: Partial<Settings>) => Promise<string[]>
  dismissNag: () => Promise<void>
  muteNag: () => Promise<void>
  requestLuminance: (theme: string, justification: string) => Promise<{ control_number: string }>
  resetDemo: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)

const SESSION_KEY = 'quotient.session'

function sessionId(): string {
  try {
    const held = localStorage.getItem(SESSION_KEY)
    if (held) return held
    const made = `sess_${Math.random().toString(36).slice(2, 12)}`
    localStorage.setItem(SESSION_KEY, made)
    return made
  } catch {
    return `sess_${Math.random().toString(36).slice(2, 12)}`
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nag, setNag] = useState<Nag>(null)
  const [lastAction, setLastAction] = useState<string | undefined>()
  const sid = useRef(sessionId()).current
  const nagTimer = useRef<number | undefined>(undefined)

  const settings = boot?.settings ?? {}

  const reload = useCallback(async () => {
    try {
      const b = await api<Bootstrap>('/bootstrap')
      setBoot(b)
      setNag(b.notification)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    return () => window.clearTimeout(nagTimer.current)
  }, [reload])

  // Theme is server-persisted; mirror it onto <html> whenever it changes.
  useEffect(() => {
    const theme = settings.theme ?? 'dark'
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [settings.theme])

  const note = useCallback((action: string) => setLastAction(action), [])

  const saveSettings = useCallback(
    async (p: Partial<Settings>) => {
      const r = await patch<{ settings: Settings; interlockNotes: string[] }>('/settings', p)
      setBoot((b) => (b ? { ...b, settings: r.settings } : b))
      return r.interlockNotes
    },
    [],
  )

  /** Mechanic F — Nagging. Dismissal escalates the notice, which then returns. */
  const dismissNag = useCallback(async () => {
    const r = await post<{ tier: number; dismissed: number; nextBody: string; returnsInMs: number }>(
      '/notifications/q3-attestation/dismiss',
    )
    setNag(null)
    note(`dismissed the attestation notice (${r.dismissed} time(s))`)
    window.clearTimeout(nagTimer.current)
    nagTimer.current = window.setTimeout(
      () => setNag({ key: 'q3-attestation', tier: r.tier, body: r.nextBody, dismissed: r.dismissed }),
      r.returnsInMs,
    )
  }, [note])

  /** The genuine, working recovery path. */
  const muteNag = useCallback(async () => {
    await post('/notifications/q3-attestation/mute')
    window.clearTimeout(nagTimer.current)
    setNag(null)
    note('filed a Notification Cessation Request')
    await reload()
  }, [note, reload])

  const requestLuminance = useCallback(
    async (theme: string, justification: string) => {
      const r = await post<{ theme: string; receipt: { control_number: string } }>('/luminance-request', {
        theme,
        justification,
        acknowledged: true,
      })
      setBoot((b) => (b ? { ...b, settings: { ...b.settings, theme: r.theme, theme_authorised: 'true' } } : b))
      note(`changed the interface theme to ${r.theme}`)
      return r.receipt
    },
    [note],
  )

  const resetDemo = useCallback(async () => {
    await post('/demo/reset')
    window.clearTimeout(nagTimer.current)
    setLastAction(undefined)
    await reload()
  }, [reload])

  const value = useMemo<Store>(
    () => ({
      boot,
      settings,
      loading,
      error,
      nag,
      lastAction,
      sessionId: sid,
      reload,
      note,
      saveSettings,
      dismissNag,
      muteNag,
      requestLuminance,
      resetDemo,
    }),
    [boot, settings, loading, error, nag, lastAction, sid, reload, note, saveSettings, dismissNag, muteNag, requestLuminance, resetDemo],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside <StoreProvider>')
  return v
}

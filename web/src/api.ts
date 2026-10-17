import type { ApiError } from './types'

export class RequestFailed extends Error {
  constructor(
    readonly status: number,
    readonly detail: ApiError,
  ) {
    super(detail.message)
  }
}

/** Thin typed fetch wrapper. Throws RequestFailed so callers can show real errors. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new RequestFailed(0, { code: 'NETWORK', message: 'The governance service is unreachable.' })
  }
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) {
    throw new RequestFailed(res.status, json.error ?? { code: 'UNKNOWN', message: 'Request failed.' })
  }
  return json as T
}

export const post = <T,>(p: string, body?: unknown) =>
  api<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) })
export const patch = <T,>(p: string, body: unknown) =>
  api<T>(p, { method: 'PATCH', body: JSON.stringify(body) })
export const del = <T,>(p: string) => api<T>(p, { method: 'DELETE' })

export const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n)

export const fmtUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

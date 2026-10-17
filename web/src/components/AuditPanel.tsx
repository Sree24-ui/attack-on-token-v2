import { useCallback, useEffect, useState } from 'react'
import { History, ReceiptText } from 'lucide-react'
import { api, fmtDate, fmtTime } from '../api'
import type { AuditEvent, Receipt } from '../types'
import { Badge, Card, CardHead, Empty, Rows } from './ui'

/** The honest part of the product. Everything that happened, in order. */
export function AuditPanel() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null)
  const [receipts, setReceipts] = useState<Receipt[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [e, r] = await Promise.all([
        api<{ rows: AuditEvent[] }>('/events?limit=60'),
        api<{ rows: Receipt[] }>('/receipts'),
      ])
      setEvents(e.rows)
      setReceipts(r.rows)
    } catch {
      setError('The audit trail is unreachable. This is the first time it has let anyone down.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <Card>
        <CardHead
          title="Immutable audit trail"
          sub="Append-only. Retained under schedule RS-7 for seven years, then reviewed, then retained."
        />
        {!events && !error && <Rows n={8} />}
        {error && <Empty icon={<History size={18} />} title="Unavailable" body={error} />}
        {events?.length === 0 && (
          <Empty icon={<History size={18} />} title="Nothing recorded yet" body="Interact with the Console and return." />
        )}
        {events && events.length > 0 && (
          <ol className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                <div className="nums w-[64px] shrink-0 pt-0.5 font-mono text-[11px] text-dim">{fmtTime(e.ts)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug text-ink">{e.summary}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{e.kind}</Badge>
                    <span className="text-[11px] text-dim">{e.actor}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="self-start">
        <CardHead title="Receipt register" sub="Instruments issued by this tenant." />
        {!receipts && !error && <Rows n={4} />}
        {receipts?.length === 0 && (
          <Empty
            icon={<ReceiptText size={18} />}
            title="No instruments issued"
            body="Vary a quota or change the theme, and an instrument will be issued to you whether or not you want one."
          />
        )}
        {receipts && receipts.length > 0 && (
          <ul className="divide-y divide-line">
            {receipts.map((r) => (
              <li key={r.id} className="px-5 py-3.5">
                <div className="nums font-mono text-[12px] text-ink">{r.control_number}</div>
                <div className="mt-0.5 text-[12.5px] text-muted">{r.subject}</div>
                <div className="mt-1 text-[11px] text-dim">{fmtDate(r.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

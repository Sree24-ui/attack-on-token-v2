import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowUpDown, FileCheck2, Info, Search, SearchX, Sparkles, Trash2, Wand2,
} from 'lucide-react'
import { api, del, fmtTokens, fmtUsd, patch, RequestFailed } from '../api'
import type { Allocation, AllocationQuery, Receipt } from '../types'
import { useStore } from '../store'
import {
  Badge, Button, Card, CardHead, Empty, Field, Input, Meter, Modal, Notice, Rows, Select, Textarea, cx,
} from './ui'

const STATUS_TONE = {
  active: 'ok',
  suspended: 'warn',
  archived: 'neutral',
  pending_review: 'accent',
} as const

const RISK_TONE = { low: 'neutral', moderate: 'accent', elevated: 'warn', ceremonial: 'danger' } as const

export function AllocationsPanel() {
  const { settings, saveSettings, note, reload } = useStore()
  const [data, setData] = useState<AllocationQuery | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [status, setStatus] = useState('all')
  const [doomed, setDoomed] = useState<Allocation | null>(null)
  const [varying, setVarying] = useState<Allocation | null>(null)
  const [receipt, setReceipt] = useState<Receipt['body'] | null>(null)
  const [receiptCn, setReceiptCn] = useState<string>('')

  const sort = settings.sort ?? 'uuid_alpha'
  const literal = settings.literal_search !== 'false'
  const interpretation = settings.filter_interpretation ?? 'policy'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        q: submitted,
        status,
        sort,
        search_mode: literal ? 'literal' : 'human',
        interpretation,
      })
      setData(await api<AllocationQuery>(`/allocations?${params}`))
      setError(null)
    } catch (e) {
      setError(e instanceof RequestFailed ? e.detail.message : 'Could not load allocations.')
    } finally {
      setLoading(false)
    }
  }, [submitted, status, sort, literal, interpretation])

  useEffect(() => {
    void load()
  }, [load])

  const meta = data?.meta

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- toolbar -- */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault()
              setSubmitted(q)
              note(`searched for "${q}" in ${literal ? 'literal' : 'human'} mode`)
            }}
          >
            <Field
              label="Search allocations"
              hint={
                literal ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Info size={11} /> Literal Interpretation Policy (LIP-7) is active: queries match as exact,
                    case-sensitive character sequences.
                  </span>
                ) : (
                  <span className="text-ok">Human interpretation active — case-insensitive, word-wise.</span>
                )
              }
            >
              <div className="relative">
                <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={literal ? 'e.g. Copilot  (capitalisation matters)' : 'e.g. copilot'}
                  className="pl-9"
                  data-testid="alloc-search"
                  aria-label="Search allocations"
                />
              </div>
            </Field>
          </form>

          <div className="grid grid-cols-2 gap-3 lg:w-[360px]">
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="alloc-status">
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="archived">Archived</option>
                <option value="pending_review">Pending review</option>
              </Select>
            </Field>
            <Field label="Order by">
              <Select
                value={sort}
                data-testid="alloc-sort"
                onChange={(e) => {
                  void saveSettings({ sort: e.target.value })
                  note(`changed the ordering to "${e.target.value}"`)
                }}
              >
                <option value="uuid_alpha">Relevance (alpha by UUID)</option>
                <option value="spend">Projected spend (high→low)</option>
                <option value="utilisation">Utilisation (high→low)</option>
                <option value="name">Name (A→Z)</option>
                <option value="updated">Recently updated</option>
              </Select>
            </Field>
          </div>
        </div>

        {sort === 'uuid_alpha' && (
          <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-dim">
            <ArrowUpDown size={12} className="mt-0.5 shrink-0" />
            Default ordering is <strong className="font-medium text-muted">Relevance</strong>, defined as alphabetical
            by an internal UUID you cannot see. Four more useful orderings are available above, and your choice
            persists.
          </p>
        )}
      </Card>

      {/* ------------------------------------------- policy explanations -- */}
      {meta?.filterNote && (
        <Notice
          tone="warn"
          title="Filter applied under the policy interpretation"
          action={
            <Button
              size="sm"
              variant="secondary"
              data-testid="interp-plain"
              onClick={() => {
                void saveSettings({ filter_interpretation: 'plain' })
                note('switched the filter to plain-English interpretation')
              }}
            >
              <Wand2 size={13} /> Interpret in plain English instead
            </Button>
          }
        >
          {meta.filterNote}
        </Notice>
      )}

      {interpretation === 'plain' && status !== 'all' && (
        <Notice tone="accent">
          Plain-English interpretation is active; filters mean what they appear to mean.{' '}
          <button
            className="underline decoration-dotted underline-offset-2"
            onClick={() => void saveSettings({ filter_interpretation: 'policy' })}
          >
            Restore the policy interpretation
          </button>
          .
        </Notice>
      )}

      {/* ---------------------------------------------------------- table -- */}
      <Card>
        <CardHead
          title="Token allocations"
          sub={
            data
              ? `${data.rows.length} of ${data.total} records · ordered by ${meta?.sortLabel?.toLowerCase()}`
              : 'Loading the allocation ledger…'
          }
          right={
            <Badge tone={literal ? 'warn' : 'ok'}>
              {literal ? 'LIP-7 literal search' : 'human search'}
            </Badge>
          }
        />

        {loading && <Rows n={6} />}

        {error && !loading && (
          <Empty
            icon={<SearchX size={18} />}
            title="The allocation ledger could not be reached"
            body={error}
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Retry
              </Button>
            }
          />
        )}

        {!loading && !error && data?.rows.length === 0 && (
          <Empty
            icon={<SearchX size={18} />}
            title={meta?.searchNote ? 'Zero results, precisely' : 'No allocations match'}
            body={
              meta?.searchNote ??
              'No records match the current filter. Try widening the status filter above.'
            }
            action={
              meta?.searchNote ? (
                <Button
                  variant="primary"
                  data-testid="search-human"
                  onClick={() => {
                    void saveSettings({ literal_search: 'false' })
                    note('switched search to human interpretation')
                  }}
                >
                  <Sparkles size={14} /> Search the way a human would
                </Button>
              ) : undefined
            }
          />
        )}

        {!loading && !error && (data?.rows.length ?? 0) > 0 && (
          <>
            {/* desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11px] tracking-[0.07em] text-dim uppercase">
                    <th className="px-5 py-2.5 font-medium">Allocation</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Risk</th>
                    <th className="px-3 py-2.5 text-right font-medium">Utilisation</th>
                    <th className="px-3 py-2.5 text-right font-medium">Spend</th>
                    <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.rows.map((a, i) => (
                    <motion.tr
                      key={a.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.015, 0.2) }}
                      className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/60"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium text-ink">{a.name}</div>
                        <div className="mt-0.5 text-[11.5px] text-dim">
                          {a.team} · {a.workload} · {a.model}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={STATUS_TONE[a.status]}>{a.status.replace('_', ' ')}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={RISK_TONE[a.risk_tier]}>{a.risk_tier}</Badge>
                      </td>
                      <td className="w-[160px] px-3 py-3">
                        <div className="nums mb-1.5 text-right text-[12px] text-muted">
                          {(a.utilisation * 100).toFixed(1)}% · {fmtTokens(a.tokens_used)}/{fmtTokens(a.tokens_granted)}
                        </div>
                        <Meter
                          value={a.utilisation}
                          tone={a.utilisation > 0.95 ? 'danger' : a.utilisation > 0.8 ? 'warn' : undefined}
                        />
                      </td>
                      <td className="nums px-3 py-3 text-right font-medium text-ink">{fmtUsd(a.spend_usd)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setVarying(a)}>
                            Vary quota
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Deprovision ${a.name}`}
                            onClick={() => setDoomed(a)}
                            className="!px-2 hover:!text-danger"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile cards */}
            <div className="divide-y divide-line md:hidden">
              {data!.rows.map((a) => (
                <div key={a.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium text-ink">{a.name}</div>
                      <div className="mt-0.5 text-[11.5px] text-dim">{a.team}</div>
                    </div>
                    <Badge tone={STATUS_TONE[a.status]}>{a.status.replace('_', ' ')}</Badge>
                  </div>
                  <div className="nums mt-2.5 flex items-center justify-between text-[12px] text-muted">
                    <span>{(a.utilisation * 100).toFixed(1)}% utilised</span>
                    <span className="font-medium text-ink">{fmtUsd(a.spend_usd)}</span>
                  </div>
                  <div className="mt-1.5">
                    <Meter value={a.utilisation} tone={a.utilisation > 0.95 ? 'danger' : undefined} />
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setVarying(a)}>
                      Vary quota
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDoomed(a)} className="hover:!text-danger">
                      <Trash2 size={13} /> Deprovision
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <DeprovisionDialog
        row={doomed}
        onClose={() => setDoomed(null)}
        onDone={async (name) => {
          note(`deprovisioned the allocation "${name}"`)
          setDoomed(null)
          await load()
          await reload()
        }}
      />

      <QuotaVariationModal
        row={varying}
        onClose={() => setVarying(null)}
        onDone={async (cn, body, name) => {
          note(`varied the quota for "${name}"`)
          setVarying(null)
          setReceiptCn(cn)
          setReceipt(body)
          await load()
          await reload()
        }}
      />

      <Modal
        open={!!receipt}
        onClose={() => setReceipt(null)}
        eyebrow="Instrument issued · retain for your records"
        title="Quota Variation Receipt"
        width="max-w-lg"
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] tracking-[0.1em] text-dim uppercase">
              <FileCheck2 size={13} /> Document control number
            </div>
            <div className="nums mt-1 font-mono text-[13px] text-ink">{receiptCn}</div>
          </div>
          <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {Object.entries(receipt ?? {}).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[150px_1fr] gap-3 bg-surface-1 px-4 py-2.5">
                <dt className="text-[11.5px] text-dim capitalize">{k.replace(/_/g, ' ')}</dt>
                <dd className="nums text-[12.5px] leading-relaxed break-words text-ink">{String(v)}</dd>
              </div>
            ))}
          </dl>
          <Button variant="primary" className="w-full" onClick={() => setReceipt(null)}>
            I have retained this for my records
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mechanic H — the confirmation dialog with unhelpful choices.
// Three prominent buttons, none of which proceed. One quiet link, which does.
// ---------------------------------------------------------------------------

function DeprovisionDialog({
  row,
  onClose,
  onDone,
}: {
  row: Allocation | null
  onClose: () => void
  onDone: (name: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setNudge(null)
    setErr(null)
  }, [row])

  if (!row) return null

  const CHOICES = [
    ['Cancel', 'Cancelled. Nothing was deprovisioned. You remain exactly where you were.'],
    ['Cancel (Confirm)', 'You have confirmed the cancellation. Nothing was deprovisioned. This is the same as "Cancel", confirmed.'],
    ["I'd rather not say", 'Your preference not to say has been recorded. Nothing was deprovisioned.'],
  ] as const

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow="Irreversible · Form DP-9"
      title={`Deprovision "${row.name}"?`}
      width="max-w-lg"
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-muted">
          This permanently removes the allocation and its attestation history from the ledger. The audit trail
          retains a record of the removal, because the audit trail retains a record of everything, including this
          sentence being read.
        </p>

        <div className="grid gap-2 sm:grid-cols-3">
          {CHOICES.map(([label, outcome]) => (
            <Button key={label} variant="secondary" onClick={() => setNudge(outcome)}>
              {label}
            </Button>
          ))}
        </div>

        {nudge && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-muted"
          >
            {nudge}
          </motion.p>
        )}

        {err && (
          <p role="alert" className="text-[12.5px] font-medium text-danger">
            {err}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-line pt-3.5">
          <span className="text-[11.5px] text-dim">Considered De-emphasis applied to destructive affordance.</span>
          <button
            data-testid="deprovision-proceed"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setErr(null)
              try {
                await del(`/allocations/${row.id}`)
                await onDone(row.name)
              } catch (e) {
                setErr(e instanceof RequestFailed ? e.detail.message : 'Deprovisioning failed.')
              } finally {
                setBusy(false)
              }
            }}
            className={cx(
              'text-[12px] text-dim underline decoration-dotted underline-offset-4 transition-colors hover:text-danger',
              busy && 'opacity-50',
            )}
          >
            {busy ? 'Proceeding…' : 'Proceed with deprovisioning'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Quota Variation Request — real write, real validation, formal receipt.
// ---------------------------------------------------------------------------

function QuotaVariationModal({
  row,
  onClose,
  onDone,
}: {
  row: Allocation | null
  onClose: () => void
  onDone: (cn: string, body: Receipt['body'], name: string) => Promise<void>
}) {
  const [tokens, setTokens] = useState('')
  const [why, setWhy] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (row) {
      setTokens(String(row.tokens_granted))
      setWhy('')
      setErr(null)
    }
  }, [row])

  if (!row) return null

  return (
    <Modal open onClose={onClose} eyebrow="Form 27-B · Quota variation" title={`Vary quota — ${row.name}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12.5px]">
          <div>
            <div className="text-dim">Current quota</div>
            <div className="nums mt-0.5 font-medium text-ink">{row.tokens_granted.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-dim">Consumed to date</div>
            <div className="nums mt-0.5 font-medium text-ink">{row.tokens_used.toLocaleString()}</div>
          </div>
        </div>

        <Field label="Revised quota (tokens)" required>
          <Input
            type="number"
            min={0}
            value={tokens}
            onChange={(e) => setTokens(e.target.value)}
            className="nums"
            data-testid="quota-tokens"
          />
        </Field>

        <Field
          label="Justification"
          required
          hint={`${why.trim().length} / 20 characters minimum. Form 27-B will not be accepted without one.`}
        >
          <Textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="e.g. Incident volume has doubled this quarter and drafts are being truncated."
            data-testid="quota-why"
          />
        </Field>

        {err && (
          <p role="alert" className="text-[12.5px] font-medium text-danger">
            {err}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Discard
          </Button>
          <Button
            variant="primary"
            busy={busy}
            data-testid="quota-submit"
            onClick={async () => {
              setBusy(true)
              setErr(null)
              try {
                const r = await patch<{ receipt: { control_number: string; body: Receipt['body'] } }>(
                  `/allocations/${row.id}`,
                  { tokens_granted: Number(tokens), justification: why },
                )
                await onDone(r.receipt.control_number, r.receipt.body, row.name)
              } catch (e) {
                setErr(e instanceof RequestFailed ? e.detail.message : 'The variation was rejected.')
              } finally {
                setBusy(false)
              }
            }}
          >
            Submit Form 27-B
          </Button>
        </div>
      </div>
    </Modal>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BadgeCheck, CircleAlert, FileSignature, ShieldQuestion } from 'lucide-react'
import { api, fmtDate, post, RequestFailed } from '../api'
import type { Allocation, Attestation } from '../types'
import { useStore } from '../store'
import { Badge, Button, Card, CardHead, Empty, Field, Input, Meter, Notice, Rows, Select } from './ui'

/**
 * Mechanic E — Progress absurdity (Forced Action).
 *
 * Generation runs to 99%, then reveals a genuinely new requirement: a
 * Secondary Attestor must type "I am not a robot". Typing it certifies the
 * attestation for real and persists it. The remaining 1% is not fake — the
 * server will not move the row to `certified` without the phrase.
 */

const TICKS = [
  [12, 'Reconciling consumption against the provider ledger…'],
  [34, 'Recomputing unit rates for the attestation period…'],
  [58, 'Cross-referencing allocation owners against the directory…'],
  [79, 'Applying Governance Standard GS-19 control mappings…'],
  [94, 'Rendering the attestation instrument…'],
  [99, 'Finalising…'],
] as const

export function AttestationsPanel() {
  const { note, reload } = useStore()
  const [rows, setRows] = useState<Attestation[] | null>(null)
  const [allocs, setAllocs] = useState<Allocation[]>([])
  const [target, setTarget] = useState('')
  const [pct, setPct] = useState(0)
  const [tick, setTick] = useState('')
  const [pending, setPending] = useState<Attestation | null>(null)
  const [phrase, setPhrase] = useState('')
  const [required, setRequired] = useState('I am not a robot')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [a, l] = await Promise.all([
      api<{ rows: Attestation[]; secondaryPhrase: string }>('/attestations'),
      api<{ rows: Allocation[] }>('/allocations?status=all&interpretation=plain'),
    ])
    setRows(a.rows)
    setRequired(a.secondaryPhrase)
    setAllocs(l.rows)
    if (!target && l.rows[0]) setTarget(l.rows[0].id)
  }, [target])

  useEffect(() => {
    void load().catch(() => setErr('Could not load attestations.'))
  }, [load])

  const generate = async () => {
    if (!target) return setErr('Select an allocation to attest.')
    setErr(null)
    setPending(null)
    setPhrase('')
    setBusy(true)

    // Walk the progress bar honestly: these are real client-side stages that
    // precede the real server call, which then stops the bar dead at 99%.
    for (const [p, label] of TICKS) {
      setPct(p)
      setTick(label)
      await new Promise((r) => setTimeout(r, 340))
    }

    try {
      const r = await post<{ attestation: Attestation; progress: number }>('/attestations', {
        allocation_id: target,
      })
      setPct(r.progress)
      setPending(r.attestation)
      note('reached 99% on an attestation and was asked to prove humanity in writing')
      await load()
      await reload()
    } catch (e) {
      setErr(e instanceof RequestFailed ? e.detail.message : 'Attestation generation failed.')
      setPct(0)
    } finally {
      setBusy(false)
    }
  }

  const certify = async () => {
    if (!pending) return
    setBusy(true)
    setErr(null)
    try {
      await post(`/attestations/${pending.id}/certify`, { phrase })
      setPct(100)
      setTick('Certified.')
      setPending(null)
      note('certified an attestation by confirming it is not a robot')
      await load()
      await reload()
    } catch (e) {
      setErr(e instanceof RequestFailed ? e.detail.message : 'Certification failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHead
          title="Generate quarterly attestation"
          sub="Produces a signed instrument certifying that an allocation's consumption has been reviewed."
        />
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Allocation to attest" required>
                <Select value={target} onChange={(e) => setTarget(e.target.value)} data-testid="attest-target">
                  {allocs.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.team}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button variant="primary" busy={busy && !pending} onClick={() => void generate()} data-testid="attest-generate">
              <FileSignature size={15} /> Generate attestation
            </Button>
          </div>

          {pct > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[12px]">
                <span className="text-muted">{tick}</span>
                <span className="nums font-medium text-ink" data-testid="attest-pct">
                  {pct}%
                </span>
              </div>
              <Meter value={pct / 100} tone={pct === 99 ? 'warn' : undefined} />
            </div>
          )}

          {pending && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <Notice tone="warn" title="Secondary Attestor confirmation required">
                <p>
                  Generation is 99% complete. Before the remaining 1% may be released, a Secondary Attestor must
                  confirm <em>in writing</em> that they are not a robot. A robot could also do this. The control
                  remains.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                    placeholder={`Type: ${required}`}
                    aria-label="Secondary Attestor confirmation phrase"
                    data-testid="attest-phrase"
                    className="sm:flex-1"
                  />
                  <Button variant="primary" busy={busy} onClick={() => void certify()} data-testid="attest-certify">
                    Confirm and release
                  </Button>
                </div>
              </Notice>
            </motion.div>
          )}

          {err && (
            <p role="alert" className="flex items-center gap-1.5 text-[12.5px] font-medium text-danger">
              <CircleAlert size={13} /> {err}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="Attestation register" sub="Every instrument issued against this tenant." />
        {!rows && <Rows n={3} />}
        {rows?.length === 0 && (
          <Empty
            icon={<ShieldQuestion size={18} />}
            title="No attestations on record"
            body="Generate one above. It will reach 99% and then require something of you."
          />
        )}
        {rows && rows.length > 0 && (
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="nums font-mono text-[12.5px] text-ink">{r.control_number}</span>
                    <Badge tone={r.state === 'certified' ? 'ok' : 'warn'}>
                      {r.state === 'certified' ? <BadgeCheck size={11} /> : null}
                      {r.state.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-dim">
                    {r.period} · attested by {r.attestor} · opened {fmtDate(r.created_at)}
                  </div>
                </div>
                <div className="nums text-[11.5px] text-muted">
                  {r.certified_at ? `certified ${fmtDate(r.certified_at)}` : 'awaiting secondary confirmation'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

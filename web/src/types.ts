export type Allocation = {
  id: string
  name: string
  team: string
  workload: string
  model: string
  status: 'active' | 'suspended' | 'archived' | 'pending_review'
  tokens_granted: number
  tokens_used: number
  unit_cost_micros: number
  owner: string
  risk_tier: 'low' | 'moderate' | 'elevated' | 'ceremonial'
  created_at: string
  updated_at: string
  spend_usd: number
  utilisation: number
}

export type Attestation = {
  id: string
  allocation_id: string
  period: string
  state: 'draft' | 'pending_secondary' | 'certified'
  control_number: string
  attestor: string
  secondary_phrase: string | null
  created_at: string
  certified_at: string | null
}

export type AuditEvent = {
  id: number
  ts: string
  actor: string
  kind: string
  summary: string
  detail: string
}

export type Receipt = {
  id: number
  control_number: string
  subject: string
  body: Record<string, unknown>
  created_at: string
}

export type Settings = Record<string, string>

export type Interlock = { when: [string, string]; force: [string, string]; note: string }

export type Bootstrap = {
  settings: Settings
  sortLabels: Record<string, string>
  interlocks: Interlock[]
  summary: {
    allocations: number
    tokensGranted: number
    tokensUsed: number
    spendUsd: number
    pendingAttestations: number
  }
  notification: { key: string; tier: number; body: string; dismissed: number } | null
}

export type AllocationQuery = {
  rows: Allocation[]
  total: number
  meta: {
    sort: string
    sortLabel: string
    searchMode: 'literal' | 'human'
    interpretation: 'policy' | 'plain'
    searchNote: string | null
    filterNote: string | null
  }
}

export type ChatRow = {
  id: number
  session_id: string
  role: 'user' | 'arbiter'
  content: string
  created_at: string
}

export type ApiError = { code: string; message: string; issues?: { path: string; message: string }[] }

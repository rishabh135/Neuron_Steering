// Shared by the local app and the portable artifact. Pure types and constants: no DOM, no framework imports.

export type Branch = "baseline" | "forward" | "reverse"

export interface BranchInfo {
  key: Branch
  label: string // always paired with a symbol and a line pattern, never colour alone
  short: string
  sign: 0 | 1 | -1
  symbol: string
  dash: string // SVG stroke-dasharray
  cssVar: string
}

export const BRANCHES: BranchInfo[] = [
  { key: "baseline", label: "Baseline", short: "Base", sign: 0, symbol: "●", dash: "none", cssVar: "var(--baseline)" },
  { key: "forward", label: "Selected recipe", short: "Recipe", sign: 1, symbol: "◆", dash: "7 4", cssVar: "var(--recipe)" },
  { key: "reverse", label: "Reversed recipe", short: "Reversed", sign: -1, symbol: "■", dash: "2 4", cssVar: "var(--reverse)" },
]

export const BRANCH_BY_KEY: Record<Branch, BranchInfo> = Object.fromEntries(BRANCHES.map((b) => [b.key, b])) as Record<Branch, BranchInfo>

export interface Neuron {
  layer: number // zero-based decoder layer
  neuron: number // zero-based coordinate of the 9,216-wide MLP activation
  dose: number // signed, in units of the layer's median residual norm
}

export interface Preset {
  name: string
  claim: string
  neurons: Neuron[]
}

/** The parameters a result was produced with. Results always carry their own snapshot. */
export interface Snapshot {
  prompt: string
  preset: string
  intensity: number
  maxNew: number
  component: number | null
}

export type RunSource = "illustrative" | "imported" | "live"

export interface CalibrationRow {
  layer: number
  neuron: number
  dose: number // effective dose (intensity x preset dose) for this run
  residMedian: number // R_L
  downColumnNorm: number // ||w||_2
  alpha: number // activation_addition
  writeNorm: number // |dose| * R_L
  source?: string
}

export interface TokenRow {
  id?: number
  text: string
  p: number[] // probabilities per series, aligned to the series list of the table
}

export interface ProbTable {
  title: string
  series: Branch[]
  rows: TokenRow[]
  kl?: { label: string; nats: number }[]
  caption: string
}

export interface ForkInfo {
  firstTokenDifference: number | null
  commonPrefixTokens?: number
  commonPrefixText?: string
  baselineToken?: string
  branchToken?: string
  table?: ProbTable
  singleRowMatches?: boolean[]
}

export interface BranchTokens {
  count: number
  finish: string
  pieces: string[]
  ids: number[] | null // null when token ids were not recorded (llama-server reports pieces only)
  idsComplete: boolean
}

export interface ActivationUnit {
  text: string
  baseline: number
  forward: number
  reverse: number
}
export interface ActivationCapture {
  layer: number
  neuron: number
  capture: string
  addedForward: number
  units: ActivationUnit[]
}

export interface ViewRun {
  source: RunSource
  id: string // run_id, or "illustration"
  createdAt?: string
  backend: "reference" | "llama" | "illustration" | string
  backendLabel: string
  request: Snapshot
  replies: Record<Branch, string>
  firstCharDiff: Record<"forward" | "reverse", number | null | undefined>
  tokens: Record<Branch, BranchTokens> | null
  calibration: CalibrationRow[]
  calibrationNote: string
  firstToken: ProbTable | null // null = diagnostics unavailable
  forks: Record<"forward" | "reverse", ForkInfo | null> | null
  diagnosticsNote: string
  activations: ActivationCapture[]
  metrics: Partial<Record<Branch, { characters: number; words: number; distinct4: number | null }>>
  timings: Record<string, number> | null
  provenance: Record<string, unknown>
  elapsedSeconds?: number
  promptTokens?: number
  raw: unknown // the original JSON, exported unchanged
}

export const fmt = (x: number | null | undefined, digits = 3) =>
  x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(digits)
export const signed = (x: number, digits = 2) => (x > 0 ? "+" : x < 0 ? "−" : "±") + Math.abs(x).toFixed(digits)
export const pct = (p: number | null | undefined) => (p === null || p === undefined ? "—" : (p * 100).toFixed(p < 0.001 && p > 0 ? 3 : p < 0.1 ? 2 : 1) + "%")

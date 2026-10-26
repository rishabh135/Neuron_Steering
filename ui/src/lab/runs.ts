import { PRESETS } from "./presets"
import type { ActivationCapture, Branch, BranchTokens, CalibrationRow, ForkInfo, ProbTable, RunSource, Snapshot, TokenRow, ViewRun } from "./types"

/** Validated request limits. The local app replaces these with the server's /api/status values. */
export interface Limits {
  prompt_chars: number
  intensity_min: number
  intensity_max: number
  max_new_min: number
  max_new_max: number
  max_new_default: number
  intensity_default: number
}
export const DEFAULT_LIMITS: Limits = { prompt_chars: 4000, intensity_min: 0, intensity_max: 1.25, max_new_min: 1, max_new_max: 512, max_new_default: 160, intensity_default: 0.5 }

export const SUPPORTED_SCHEMA = 1
export const MAX_IMPORT_BYTES = 12 * 1024 * 1024
const MAX_NODES = 400_000
const MAX_TEXT = 200_000

export class RunError extends Error {}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** Rejects non-finite numbers, absurd nesting and oversize documents before any field is trusted. */
export function checkShape(value: unknown): void {
  let nodes = 0
  const walk = (v: unknown, depth: number): void => {
    if (++nodes > MAX_NODES) throw new RunError("The file has too many values to be a run exported by this project.")
    if (depth > 14) throw new RunError("The file is nested too deeply to be a run exported by this project.")
    if (typeof v === "number" && !Number.isFinite(v)) throw new RunError("The file contains a non-finite number.")
    if (typeof v === "string" && v.length > 4_000_000) throw new RunError("The file contains an oversize string.")
    if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1))
    else if (isObj(v)) Object.values(v).forEach((x) => walk(x, depth + 1))
  }
  walk(value, 0)
}

export function parseJsonText(text: string): unknown {
  if (text.length > MAX_IMPORT_BYTES) throw new RunError(`The file is larger than ${(MAX_IMPORT_BYTES / 1048576).toFixed(0)} MB.`)
  try {
    return JSON.parse(text)
  } catch {
    throw new RunError("That is not valid JSON.")
  }
}

const str = (v: unknown, what: string, max = MAX_TEXT): string => {
  if (typeof v !== "string") throw new RunError(`${what} must be text.`)
  if (v.length > max) throw new RunError(`${what} is longer than ${max.toLocaleString()} characters.`)
  return v
}

function parseRequest(r: unknown, limits: Limits): Snapshot {
  if (!isObj(r)) throw new RunError("The run has no request block.")
  const preset = r.preset
  if (typeof preset !== "string" || !PRESETS[preset]) throw new RunError(`Unknown preset ${JSON.stringify(preset)}; this build knows ${Object.keys(PRESETS).join(", ")}.`)
  if (!isNum(r.intensity) || r.intensity < limits.intensity_min || r.intensity > limits.intensity_max) throw new RunError(`Intensity must be between ${limits.intensity_min} and ${limits.intensity_max}.`)
  if (!Number.isInteger(r.max_new) || (r.max_new as number) < limits.max_new_min || (r.max_new as number) > limits.max_new_max) throw new RunError(`max_new must be an integer from ${limits.max_new_min} to ${limits.max_new_max}.`)
  const component = r.component === undefined || r.component === null ? null : r.component
  if (component !== null && !(Number.isInteger(component) && (component as number) >= 0 && (component as number) < PRESETS[preset].neurons.length)) throw new RunError("component is not a valid zero-based index into the preset's neurons.")
  return { prompt: str(r.prompt, "The prompt", limits.prompt_chars), preset, intensity: r.intensity as number, maxNew: r.max_new as number, component: component as number | null }
}

function parseCalibration(rows: unknown): CalibrationRow[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((c) => {
    if (!isObj(c) || ![c.layer, c.neuron, c.dose, c.resid_median, c.down_column_norm, c.activation_addition, c.individual_write_norm].every(isNum)) throw new RunError("A calibration row is incomplete.")
    return [{ layer: c.layer as number, neuron: c.neuron as number, dose: c.dose as number, residMedian: c.resid_median as number, downColumnNorm: c.down_column_norm as number,
      alpha: c.activation_addition as number, writeNorm: c.individual_write_norm as number, source: typeof c.calibration_source === "string" ? c.calibration_source : undefined }]
  })
}

function parseTokenRows(rows: unknown, seriesCount: number): TokenRow[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((t) => {
    if (!isObj(t) || typeof t.text !== "string" || !Array.isArray(t.p) || t.p.length !== seriesCount || !t.p.every(isNum)) return []
    return [{ id: Number.isInteger(t.id) ? (t.id as number) : undefined, text: t.text, p: t.p as number[] }]
  })
}

function parseForks(d: Obj): Record<"forward" | "reverse", ForkInfo | null> | null {
  if (!isObj(d.forks)) return null
  const out = { forward: null, reverse: null } as Record<"forward" | "reverse", ForkInfo | null>
  for (const k of ["forward", "reverse"] as const) {
    const f = d.forks[k]
    if (!isObj(f)) continue
    const first = f.first_token_difference === null || f.first_token_difference === undefined ? null : Number.isInteger(f.first_token_difference) ? (f.first_token_difference as number) : null
    const info: ForkInfo = { firstTokenDifference: first }
    if (first !== null && Array.isArray(f.tokens)) {
      info.commonPrefixTokens = isNum(f.common_prefix_tokens) ? f.common_prefix_tokens : first
      info.commonPrefixText = typeof f.common_prefix_text === "string" ? f.common_prefix_text : undefined
      info.baselineToken = typeof f.baseline_token === "string" ? f.baseline_token : undefined
      info.branchToken = typeof f.branch_token === "string" ? f.branch_token : undefined
      info.singleRowMatches = Array.isArray(f.single_row_argmax_matches_batch) ? (f.single_row_argmax_matches_batch as unknown[]).map(Boolean) : undefined
      info.table = { title: "Next-token probabilities at the fork", series: ["baseline", k], rows: parseTokenRows(f.tokens, 2),
        kl: isNum(f.kl_base_to_branch_nats) ? [{ label: `KL(baseline ‖ ${k === "forward" ? "recipe" : "reversed"})`, nats: f.kl_base_to_branch_nats }] : undefined,
        caption: `Teacher-forced on the prompt plus ${info.commonPrefixTokens} shared reply tokens: both branches see exactly the same history.` }
    }
    out[k] = info
  }
  return out
}

function llamaFirstToken(runs: unknown): ProbTable | null {
  if (!Array.isArray(runs) || runs.length !== 3) return null
  const by: Partial<Record<Branch, { token: string; logprob: number }[]>> = {}
  for (const b of runs) {
    if (!isObj(b) || !["baseline", "forward", "reverse"].includes(b.branch as string) || !Array.isArray(b.first_token_top_logprobs)) return null
    by[b.branch as Branch] = (b.first_token_top_logprobs as unknown[]).flatMap((x) => (isObj(x) && typeof x.token === "string" && isNum(x.logprob) ? [{ token: x.token, logprob: x.logprob }] : []))
  }
  const tokens = [...new Set(Object.values(by).flatMap((l) => l!.map((x) => x.token)))]
  const rows = tokens.map((text) => ({ text, p: (["baseline", "forward", "reverse"] as Branch[]).map((k) => { const h = by[k]?.find((x) => x.token === text); return h ? Math.exp(h.logprob) : NaN }) }))
    .sort((a, b) => Math.max(...b.p.map((x) => x || 0)) - Math.max(...a.p.map((x) => x || 0))).slice(0, 10)
  return { title: "First reply token (llama-server top 10)", series: ["baseline", "forward", "reverse"], rows,
    caption: "Reported by llama-server for the identical prompt. A dash means outside that branch's top 10, not zero. Only the top 10 are known, so no KL divergence is computed." }
}

function parseActivations(a: unknown): ActivationCapture[] {
  if (!Array.isArray(a)) return []
  return a.flatMap((x) => {
    if (!isObj(x) || !isNum(x.layer) || !isNum(x.neuron) || !Array.isArray(x.units)) return []
    const units = x.units.flatMap((u) => (isObj(u) && typeof u.text === "string" && isNum(u.baseline) && isNum(u.forward_pre_hook) && isNum(u.reverse_pre_hook) ? [{ text: u.text, baseline: u.baseline, forward: u.forward_pre_hook, reverse: u.reverse_pre_hook }] : []))
    return [{ layer: x.layer, neuron: x.neuron, capture: typeof x.capture === "string" ? x.capture : "down_proj pre-hook read", addedForward: isNum(x.added_by_hook_forward) ? x.added_by_hook_forward : NaN, units }]
  })
}

export function backendLabel(raw: Obj): string {
  const pv = isObj(raw.provenance) ? raw.provenance : {}
  if (raw.backend === "llama") {
    const file = String(pv.model_path ?? "").split("/").pop() ?? ""
    const quant = file.match(/(Q\d_K_M|Q\d_0|BF16|F16)/)?.[0] ?? "GGUF"
    return `llama.cpp ${quant} · BF16-derived vector port`
  }
  return `${String(raw.backend)} · ${String(pv.dtype ?? "").replace("torch.", "")} · ${String(pv.device ?? "")}`.replace(/ · $/, "")
}

/** Validates one run exported by this project (schema_version 1) and maps it to the view model. */
export function parseRun(value: unknown, source: RunSource, limits: Limits = DEFAULT_LIMITS): ViewRun {
  if (!isObj(value)) throw new RunError("Expected a JSON object.")
  if (value.schema_version !== SUPPORTED_SCHEMA) throw new RunError(`Unsupported schema_version ${JSON.stringify(value.schema_version)}. This build reads version ${SUPPORTED_SCHEMA}.`)
  if (value.kind !== "measured") throw new RunError('Only runs with kind "measured" can be imported.')
  checkShape(value)
  const request = parseRequest(value.request, limits)
  const replies = { baseline: str(value.baseline, "The baseline reply"), forward: str(value.forward, "The recipe reply"), reverse: str(value.reverse, "The reversed reply") }
  const run_id = typeof value.run_id === "string" && /^[0-9a-f]{32}$/.test(value.run_id) ? value.run_id : "imported"
  let tokens: ViewRun["tokens"] = null
  const bt = value.branch_tokens
  if (isObj(bt)) {
    const t = {} as Record<Branch, BranchTokens>
    for (const k of ["baseline", "forward", "reverse"] as Branch[]) {
      const b = bt[k]
      if (!isObj(b) || !Array.isArray(b.pieces) || !b.pieces.every((p) => typeof p === "string")) { tokens = null; break }
      const ids = Array.isArray(b.ids) && b.ids.length === b.pieces.length && b.ids.every(Number.isInteger) ? (b.ids as number[]) : null
      t[k] = { count: isNum(b.count) ? b.count : b.pieces.length, finish: typeof b.finish === "string" ? b.finish : "unknown", pieces: b.pieces as string[], ids, idsComplete: b.ids_complete === true }
      tokens = t
    }
  } else if (Array.isArray(value.branch_runs) && value.branch_runs.length === 3) {
    const t = {} as Record<Branch, BranchTokens>
    for (const b of value.branch_runs) {
      if (!isObj(b) || !Array.isArray(b.generated_pieces) || !["baseline", "forward", "reverse"].includes(b.branch as string)) { tokens = null; break }
      const pieces = (b.generated_pieces as unknown[]).filter((p): p is string => typeof p === "string")
      t[b.branch as Branch] = { count: isObj(b.usage) && isNum(b.usage.completion_tokens) ? b.usage.completion_tokens : pieces.length, finish: typeof b.finish_reason === "string" ? b.finish_reason : "unknown", pieces, ids: null, idsComplete: false }
      tokens = t
    }
  }
  const d = isObj(value.diagnostics) ? value.diagnostics : null
  let firstToken: ProbTable | null = null
  let diagnosticsNote = "Not recorded for this backend (diagnostics = null). Nothing is inferred from the reply text."
  if (d && Array.isArray(d.tokens)) {
    firstToken = { title: "First reply token", series: ["baseline", "forward", "reverse"], rows: parseTokenRows(d.tokens, 3),
      kl: [isNum(d.kl_base_to_forward_nats) ? { label: "KL(baseline ‖ recipe)", nats: d.kl_base_to_forward_nats } : null, isNum(d.kl_base_to_reverse_nats) ? { label: "KL(baseline ‖ reversed)", nats: d.kl_base_to_reverse_nats } : null].filter((x): x is { label: string; nats: number } => x !== null),
      caption: "Full-vocabulary softmax on the identical chat-formatted prompt, before any reply token exists. Top tokens by probability; KL uses the whole vocabulary." }
    diagnosticsNote = typeof d.scope === "string" ? d.scope : "First reply token at an identical prompt prefix."
  } else if (value.backend === "llama") {
    firstToken = llamaFirstToken(value.branch_runs)
    if (firstToken) diagnosticsNote = "llama-server top-10 log-probabilities for the first reply token (no full-vocabulary diagnostics, no fork analysis)."
  }
  const metrics: ViewRun["metrics"] = {}
  if (isObj(value.metrics)) for (const k of ["baseline", "forward", "reverse"] as Branch[]) { const m = value.metrics[k]; if (isObj(m) && isNum(m.characters) && isNum(m.words)) metrics[k] = { characters: m.characters, words: m.words, distinct4: isNum(m.distinct_word_4gram_ratio) ? m.distinct_word_4gram_ratio : null } }
  const fcd = isObj(value.first_character_difference) ? value.first_character_difference : {}
  const cd = (k: string) => (fcd[k] === null ? null : Number.isInteger(fcd[k]) ? (fcd[k] as number) : undefined)
  const timings: Record<string, number> | null = isObj(value.timings) ? Object.fromEntries(Object.entries(value.timings).filter(([, v]) => isNum(v)) as [string, number][]) : null
  return { source, id: run_id, createdAt: typeof value.created_at === "string" ? value.created_at : undefined,
    backend: typeof value.backend === "string" ? value.backend : "unknown", backendLabel: backendLabel(value), request, replies,
    firstCharDiff: { forward: cd("forward"), reverse: cd("reverse") }, tokens,
    calibration: parseCalibration(value.calibration),
    calibrationNote: value.backend === "llama" ? "Recorded from the BF16 reference model; not re-measured inside the GGUF." : "Measured by this run, before any hook was active, on the fixed reference passage.",
    firstToken, forks: d ? parseForks(d) : null, diagnosticsNote, activations: parseActivations(value.activations), metrics, timings,
    provenance: isObj(value.provenance) ? value.provenance : {}, elapsedSeconds: isNum(value.elapsed_seconds) ? value.elapsed_seconds : undefined,
    promptTokens: isNum(value.prompt_tokens) ? value.prompt_tokens : undefined, raw: value }
}

export interface ImportResult { runs: ViewRun[]; skipped: string[] }

/** One run, or a bundle {kind:"bundle", runs:[...]}. Invalid entries in a bundle are skipped and reported. */
export function parseImport(text: string, limits: Limits = DEFAULT_LIMITS): ImportResult {
  const value = parseJsonText(text)
  if (isObj(value) && value.kind === "bundle") {
    if (!Array.isArray(value.runs) || value.runs.length === 0) throw new RunError("The bundle contains no runs.")
    const runs: ViewRun[] = []
    const skipped: string[] = []
    value.runs.slice(0, 200).forEach((r, i) => { try { runs.push(parseRun(r, "imported", limits)) } catch (e) { skipped.push(`run ${i + 1}: ${(e as Error).message}`) } })
    if (!runs.length) throw new RunError(`No valid runs in the bundle. First problem: ${skipped[0]}`)
    return { runs, skipped }
  }
  return { runs: [parseRun(value, "imported", limits)], skipped: [] }
}

/** The first token index where two id (or piece) lists differ; null when identical. */
export function firstDifference<T>(a: T[], b: T[]): number | null {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return a.length === b.length ? null : n
}

export const runLabel = (r: ViewRun) => (r.source === "illustrative" ? "Illustrative" : r.source === "imported" ? "Imported run" : "Live local run")
export const sameSnapshot = (a: Snapshot, b: Snapshot) => a.prompt === b.prompt && a.preset === b.preset && a.intensity === b.intensity && a.maxNew === b.maxNew && a.component === b.component
export function describeDifference(a: Snapshot, b: Snapshot): string[] {
  const out: string[] = []
  if (a.preset !== b.preset) out.push(`preset ${a.preset} → ${b.preset}`)
  if (a.component !== b.component) out.push("neuron subset changed")
  if (a.intensity !== b.intensity) out.push(`intensity ${a.intensity} → ${b.intensity}`)
  if (a.maxNew !== b.maxNew) out.push(`max tokens ${a.maxNew} → ${b.maxNew}`)
  if (a.prompt !== b.prompt) out.push("prompt edited")
  return out
}

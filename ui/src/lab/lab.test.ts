import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { illustrativeRun } from "./illustration"
import { MODEL, FULL_ATTENTION_LAYERS, LAYER_KINDS } from "./model"
import { PRESETS, neuronsFor } from "./presets"
import { RunError, firstDifference, parseImport, parseRun, sameSnapshot } from "./runs"
import { SOURCES } from "./sources"
import { alphaFor, calibrationFor, effectiveDose, readmeCalibration, sumNorm, writeNormFor } from "./steering"

const calRow = (layer: number, neuron: number, dose: number) => ({ layer, neuron, dose, resid_median: 10.642, down_column_norm: 0.4629, calibration_source: "REFERENCE_TEXT",
  activation_addition: (dose * 10.642) / 0.4629, individual_write_norm: Math.abs(dose) * 10.642 })

/** Synthetic, clearly fake run for validation tests only; never shown in the UI. */
const synthetic = (over: Record<string, unknown> = {}) => ({
  schema_version: 1, kind: "measured", backend: "reference", run_id: "0".repeat(32), created_at: "2026-01-01T00:00:00+00:00",
  request: { prompt: "synthetic test prompt", preset: "sarcasm", intensity: 0.5, max_new: 16 },
  baseline: "aaa bbb", forward: "aaa ccc", reverse: "zzz",
  calibration: [calRow(15, 3920, 0.5)], provenance: { dtype: "torch.bfloat16", device: "mps", model_revision: "x" },
  diagnostics: null, branch_tokens: { baseline: { count: 2, pieces: ["aaa", " bbb"], ids: [1, 2], ids_complete: true, finish: "eos" },
    forward: { count: 2, pieces: ["aaa", " ccc"], ids: [1, 3], ids_complete: true, finish: "eos" }, reverse: { count: 1, pieces: ["zzz"], ids: [9], ids_complete: true, finish: "eos" } },
  first_character_difference: { forward: 4, reverse: 0 }, ...over,
})

describe("steering formulas", () => {
  it("alpha and write norm follow the documented definitions", () => {
    const eff = effectiveDose(0.5, -1)
    expect(eff).toBe(-0.5)
    const alpha = alphaFor(eff, 10.642, 0.4629)
    expect(alpha).toBeCloseTo(-11.4949, 3)
    expect(Math.abs(alpha) * 0.4629).toBeCloseTo(writeNormFor(eff, 10.642), 10) // ||alpha w|| = |dose| R_L
  })
  it("intensity 1.00 means the exact preset doses", () => {
    for (const [id, p] of Object.entries(PRESETS)) {
      const rows = readmeCalibration({ prompt: "x", preset: id, intensity: 1, maxNew: 8, component: null })
      expect(rows.map((r) => r.dose)).toEqual(p.neurons.map((n) => n.dose))
    }
  })
  it("every preset neuron has recorded calibration and zero-based indices in range", () => {
    for (const p of Object.values(PRESETS)) for (const n of p.neurons) {
      expect(n.layer).toBeGreaterThanOrEqual(1) // layer 0 is never steered by the llama.cpp port
      expect(n.layer).toBeLessThan(MODEL.num_hidden_layers)
      expect(n.neuron).toBeLessThan(MODEL.intermediate_size)
    }
    for (const id of Object.keys(PRESETS)) expect(readmeCalibration({ prompt: "x", preset: id, intensity: 1, maxNew: 8, component: null })).toHaveLength(PRESETS[id].neurons.length)
  })
  it("a run's own calibration wins and is rescaled to the requested intensity", () => {
    const s = { prompt: "x", preset: "sarcasm", intensity: 1, maxNew: 8, component: null }
    const own = [{ layer: 15, neuron: 3920, dose: 0.5, residMedian: 11, downColumnNorm: 0.5, alpha: 11, writeNorm: 5.5 }]
    const [row] = calibrationFor(s, own)
    expect(row.residMedian).toBe(11)
    expect(row.alpha).toBeCloseTo(22, 10)
  })
  it("multi-neuron norms depend on direction", () => {
    expect(sumNorm([[3, 0], [0, 4]])).toBe(5)
    expect(sumNorm([[3, 0], [-3, 0]])).toBe(0)
  })
  it("component selects exactly one listed neuron", () => {
    expect(neuronsFor("mixed", 2)).toEqual([PRESETS.mixed.neurons[2]])
    expect(neuronsFor("mixed", null)).toHaveLength(5)
    expect(neuronsFor("mixed", 9)).toEqual([])
  })
})

describe("model facts", () => {
  it("hybrid layout derived from config", () => {
    expect(MODEL.num_hidden_layers).toBe(32)
    expect(MODEL.intermediate_size).toBe(9216)
    expect(FULL_ATTENTION_LAYERS).toEqual([3, 7, 11, 15, 19, 23, 27, 31])
    expect(LAYER_KINDS.filter((k) => k === "linear_attention")).toHaveLength(24)
  })
})

describe("source index", () => {
  it("every reference carries a verbatim snippet and a pinned link where upstream", () => {
    for (const s of Object.values(SOURCES)) {
      expect(s.snippet.length).toBeGreaterThan(10)
      expect(s.lines[1]).toBeGreaterThanOrEqual(s.lines[0])
      if (s.repo === "explorer" || s.repo === "llama") expect(s.url).toContain(s.rev)
    }
    expect(SOURCES["llama-cvec-call"].snippet).toContain("build_cvec(cur, il)")
    expect(SOURCES["hook-add"].snippet).toContain("h[:, :, n] = h[:, :, n] + vals")
  })
})

describe("run parsing", () => {
  it("maps forward/reverse without swapping them and keeps the snapshot", () => {
    const r = parseRun(synthetic(), "imported")
    expect(r.replies.forward).toBe("aaa ccc")
    expect(r.replies.reverse).toBe("zzz")
    expect(r.request).toEqual({ prompt: "synthetic test prompt", preset: "sarcasm", intensity: 0.5, maxNew: 16, component: null })
    expect(r.firstToken).toBeNull() // diagnostics=null handled explicitly
    expect(r.tokens?.forward.ids).toEqual([1, 3])
  })
  it("rejects unsupported versions, unknown presets, bad ranges and non-measured kinds", () => {
    const bad = (o: Record<string, unknown>, re: RegExp) => expect(() => parseRun(synthetic(o), "imported")).toThrow(re)
    bad({ schema_version: 2 }, /schema_version/)
    bad({ kind: "synthetic" }, /measured/)
    bad({ request: { prompt: "x", preset: "nope", intensity: 0.5, max_new: 8 } }, /preset/)
    bad({ request: { prompt: "x", preset: "sarcasm", intensity: 9, max_new: 8 } }, /Intensity/)
    bad({ request: { prompt: "x", preset: "sarcasm", intensity: 0.5, max_new: 9999 } }, /max_new/)
    bad({ request: { prompt: "x", preset: "sarcasm", intensity: 0.5, max_new: 8, component: 7 } }, /component/)
    bad({ baseline: 5 }, /text/)
    bad({ calibration: [{ layer: 1 }] }, /calibration/)
  })
  it("rejects non-finite numbers that survive in-memory objects", () => {
    expect(() => parseRun(synthetic({ timings: { x: Infinity } }), "imported")).toThrow(RunError)
  })
  it("imports bundles, skipping invalid members and reporting them", () => {
    const text = JSON.stringify({ kind: "bundle", runs: [synthetic(), synthetic({ schema_version: 7 })] })
    const out = parseImport(text)
    expect(out.runs).toHaveLength(1)
    expect(out.skipped[0]).toMatch(/run 2/)
    expect(() => parseImport(JSON.stringify({ kind: "bundle", runs: [synthetic({ kind: "x" })] }))).toThrow(/No valid runs/)
  })
  it("rejects invalid JSON and oversize input", () => {
    expect(() => parseImport("{nope")).toThrow(/valid JSON/)
    expect(() => parseImport(" ".repeat(13 * 1024 * 1024))).toThrow(/larger/)
  })
  it("treats markup in strings as data", () => {
    const r = parseRun(synthetic({ baseline: "<img src=x onerror=alert(1)>" }), "imported")
    expect(r.replies.baseline).toBe("<img src=x onerror=alert(1)>")
  })
  it("first difference helpers", () => {
    expect(firstDifference([1, 2, 3], [1, 2, 3])).toBeNull()
    expect(firstDifference([1, 2], [1, 2, 3])).toBe(2)
    expect(firstDifference([1, 2, 3], [1, 9, 3])).toBe(1)
    expect(sameSnapshot(parseRun(synthetic(), "live").request, { prompt: "synthetic test prompt", preset: "sarcasm", intensity: 0.5, maxNew: 16, component: null })).toBe(true)
  })
  it("parses a llama-style run with pieces only and no diagnostics", () => {
    const lr = parseRun(synthetic({ backend: "llama", branch_tokens: undefined, diagnostics: null, provenance: { model_path: "/x/Qwen3.5-4B-Q4_K_M.gguf" },
      branch_runs: ["baseline", "forward", "reverse"].map((b) => ({ branch: b, finish_reason: "stop", usage: { completion_tokens: 2 }, generated_pieces: ["a", "b"], first_token_top_logprobs: [{ token: "a", logprob: -0.1 }] })) }), "imported")
    expect(lr.backendLabel).toContain("Q4_K_M")
    expect(lr.tokens?.baseline.ids).toBeNull()
    expect(lr.firstToken?.rows[0].text).toBe("a")
    expect(lr.forks).toBeNull()
  })
})

describe("illustration", () => {
  it("is labelled illustrative and uses recorded calibration only", () => {
    const r = illustrativeRun({ prompt: "x", preset: "mixed", intensity: 1, maxNew: 8, component: null })
    expect(r.source).toBe("illustrative")
    expect(r.raw).toBeNull()
    expect(r.calibration).toHaveLength(5)
    expect(r.backendLabel).toMatch(/not a model/)
  })
})

// WCAG contrast of the semantic tokens, parsed from the stylesheet so the test cannot drift from the design.
const css = readFileSync(path.resolve(import.meta.dirname, "theme.css"), "utf8")
const block = (sel: string) => css.split(sel)[1].split("}")[0]
const tokens = (b: string) => Object.fromEntries([...b.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe.each([["dark", block(':root,\n[data-theme="dark"] {')], ["light", block('[data-theme="light"] {')]])("%s theme contrast", (_n, b) => {
  const t = tokens(b)
  it("body and secondary text meet AA on every surface", () => {
    for (const surface of ["background", "card", "popover", "secondary"]) {
      expect(ratio(t.foreground, t[surface])).toBeGreaterThanOrEqual(7)
      expect(ratio(t["muted-foreground"], t[surface])).toBeGreaterThanOrEqual(4.5)
    }
  })
  it("branch colours and the focus ring are readable (3:1 non-text, 4.5:1 text) on cards", () => {
    for (const k of ["baseline", "recipe", "reverse", "ring"]) expect(ratio(t[k], t.card)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(t["primary-foreground"], t.primary)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(t.destructive, t.card)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(t.input, t.background)).toBeGreaterThanOrEqual(3) // control borders
  })
})

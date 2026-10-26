import { useState } from "react"
import { useLab } from "../store"
import { ViewImplementation } from "../source-ui"
import { BRANCHES, fmt, signed } from "../types"
import { Card, Chip, ImportExport, Note } from "../ui"
import { ChapterFrame } from "./frame"

const s = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v))

function Row({ k, v, mono = true }: { k: string; v: unknown; mono?: boolean }) {
  return <tr><th scope="row" className="w-48 font-normal">{k}</th><td className={mono ? "font-mono text-[14px] [overflow-wrap:anywhere]" : ""}>{s(v)}</td></tr>
}

export function Chapter7() {
  const lab = useLab()
  const { run } = lab
  const pv = run.provenance as Record<string, unknown>
  const src = (pv.source ?? {}) as Record<string, unknown>
  const live = run.source !== "illustrative"
  const llama = run.backend === "llama"
  const [rawOpen, setRawOpen] = useState(false)
  const quant = llama ? (String(pv.model_path ?? "").match(/(Q\d_K_M|Q\d_0)/)?.[0] ?? "GGUF (quantization unknown)") : live ? String(pv.dtype ?? "").replace("torch.", "") : "—"
  const toy = "illustration only: nothing was measured"
  const diag = [
    ["First-token probabilities (identical prefix)", !!run.firstToken && live, !live ? toy : run.firstToken ? (llama ? "top 10 from llama-server" : "full-vocabulary softmax") : "unavailable: not recorded"],
    ["KL divergence from baseline", !!run.firstToken?.kl?.length && live, !live ? toy : llama ? "unavailable: llama-server reports only the top 10" : run.firstToken?.kl?.length ? "full vocabulary, nats" : "unavailable: not recorded"],
    ["Fork analysis (teacher-forced shared prefix)", !!run.forks && live && !!(run.forks.forward?.table || run.forks.reverse?.table), !live ? toy : run.forks ? "only where a branch differs from baseline" : "unavailable: needs exact token ids (reference backend)"],
    ["Exact token ids", !!run.tokens?.baseline.ids && live, !live ? toy : llama ? "unavailable: llama-server reports text pieces only" : run.tokens?.baseline.ids ? "recorded" : "unavailable: not recorded"],
    ["Activation captures (aligned, pre-hook)", run.activations.length > 0 && live, !live ? toy : run.activations.length ? "down_proj pre-hook, before the neuron's own addition" : "unavailable: reference backend only"],
    ["Measured heatmaps", false, "not implemented: no aligned per-neuron capture across all positions exists, so none is drawn"],
  ] as [string, boolean, string][]

  return (
    <ChapterFrame n={7} title="Evidence and limits" lead={<p>What this view of the experiment actually measured, what is authored illustration, and what is unavailable, with exact values in tables rather than only in graphics.</p>}>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col gap-3"><h3>Measured</h3><ul className="list-disc space-y-1 pl-5 text-label text-muted-foreground">
          <li>Replies, token pieces and (reference) ids from the real model.</li><li>Calibration constants R_L and ‖w‖ (reference) before any hook.</li><li>First-token and fork probabilities (reference only).</li><li>Wall-clock timings of that run.</li></ul>
          <Chip tone={live ? "ok" : "note"}>{live ? "this view: measured" : "this view: nothing measured yet"}</Chip></Card>
        <Card className="flex flex-col gap-3"><h3>Illustrative</h3><ul className="list-disc space-y-1 pl-5 text-label text-muted-foreground">
          <li>Authored sample replies and toy probabilities (labelled).</li><li>The 2-D toy vector and all animation timing.</li><li>Recipe names: hypotheses, not findings.</li></ul></Card>
        <Card className="flex flex-col gap-3"><h3>Not available</h3><ul className="list-disc space-y-1 pl-5 text-label text-muted-foreground">
          <li>Proof that any recipe changes persona, safety or intent.</li><li>Circuit connections from weight or logit-lens similarity.</li><li>Quantized equivalence: GGUF results are a BF16-derived vector port, reported separately.</li></ul></Card>
      </div>

      <Card className="flex flex-col gap-4">
        <h3>Provenance</h3>
        <div className="overflow-x-auto"><table aria-label="Run provenance"><tbody>
          <Row k="Status" v={live ? (run.source === "live" ? "Live local run" : "Imported run") : "Illustrative (no run)"} mono={false} />
          <Row k="Run identifier" v={run.id} />
          <Row k="Created" v={run.createdAt} />
          <Row k="Backend" v={run.backendLabel} />
          <Row k="Model" v={`${s(pv.model_id ?? src.model_id ?? "Qwen/Qwen3.5-4B")} @ ${s(pv.model_revision ?? src.model_revision)}`} />
          <Row k={llama ? "Quantization" : "Dtype"} v={quant} />
          <Row k="Device" v={pv.device ?? (llama ? "Metal (-ngl 99)" : undefined)} />
          <Row k="Decoding" v={pv.sampling} />
          <Row k="Thinking" v={pv.thinking === undefined ? undefined : String(pv.thinking)} />
          <Row k="Seed" v={pv.seed === null ? "none (greedy argmax)" : pv.seed} />
          <Row k="Prompt tokens" v={run.promptTokens} />
          <Row k="Max new tokens" v={run.request.maxNew} />
          <Row k="Explorer commit" v={pv.explorer_commit ?? src.explorer_commit} />
          <Row k="torch / transformers" v={pv.torch || src.torch ? `${s(pv.torch ?? src.torch)} / ${s(pv.transformers ?? src.transformers)}` : undefined} />
          {llama && <><Row k="GGUF sha256" v={pv.model_sha256} /><Row k="Vector sha256" v={pv.vector_sha256} /><Row k="Calibration origin" v={pv.calibration_origin} /></>}
          <Row k="Parameters submitted" v={JSON.stringify(run.request)} />
        </tbody></table></div>
        <p className="text-label text-muted-foreground">{run.calibrationNote}</p>
        <div className="flex flex-wrap gap-2"><ViewImplementation id="lab-calibration" /><ViewImplementation id="chat-template" /></div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h3>Calibration used by this run</h3>
        <div className="overflow-x-auto"><table aria-label="Calibration, exact values">
          <thead><tr><th>Neuron</th><th className="num">effective dose</th><th className="num">R_L</th><th className="num">‖w‖₂</th><th className="num">α</th><th className="num">‖Δr‖₂</th></tr></thead>
          <tbody>{run.calibration.map((c) => <tr key={`${c.layer}-${c.neuron}`}><td className="font-mono">L{c.layer} N{c.neuron}</td><td className="num">{signed(c.dose, 4)}</td><td className="num">{c.residMedian.toPrecision(6)}</td><td className="num">{c.downColumnNorm.toPrecision(6)}</td><td className="num">{signed(c.alpha, 4)}</td><td className="num">{c.writeNorm.toPrecision(6)}</td></tr>)}</tbody>
        </table></div>
        {!live && <p className="text-label text-muted-foreground">These rows use the constants recorded in README.md for the controls above; they are not a measurement made by this page.</p>}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3>Branch comparison, exact values</h3>
        <div className="overflow-x-auto"><table aria-label="Per-branch metrics">
          <thead><tr><th>Branch</th><th className="num">characters</th><th className="num">words</th><th className="num">tokens</th><th>stopped by</th><th className="num">first differing character</th><th className="num">distinct 4-grams</th></tr></thead>
          <tbody>{BRANCHES.map((b) => {
            const m = run.metrics[b.key]
            const t = run.tokens?.[b.key]
            const d = b.key === "baseline" ? "—" : run.firstCharDiff[b.key as "forward" | "reverse"]
            return <tr key={b.key}><td>{b.symbol} {b.label}</td><td className="num">{m?.characters ?? run.replies[b.key].length}</td><td className="num">{m?.words ?? "—"}</td><td className="num">{t?.count ?? "—"}</td><td>{t?.finish ?? "—"}</td><td className="num">{d === null ? "identical" : d === undefined ? "—" : d}</td><td className="num">{fmt(m?.distinct4, 2)}</td></tr>
          })}</tbody>
        </table></div>
        <p className="text-meta text-muted-foreground">Text difference and KL are not personality scores. Distinct-4-gram ratio is a crude repetition check.</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h3>Diagnostics for this run</h3>
        <div className="overflow-x-auto"><table aria-label="Diagnostics availability">
          <thead><tr><th>Diagnostic</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>{diag.map(([k, ok, d]) => <tr key={k}><td>{k}</td><td>{ok ? "✓ available" : "✗ unavailable"}</td><td className="text-muted-foreground">{d}</td></tr>)}</tbody>
        </table></div>
        {!run.firstToken && <Note title="diagnostics = null">{run.diagnosticsNote}</Note>}
        {run.timings && <div className="overflow-x-auto"><table aria-label="Timings"><thead><tr><th>Timing</th><th className="num">seconds</th></tr></thead><tbody>{Object.entries(run.timings).map(([k, v]) => <tr key={k}><td className="font-mono text-[14px]">{k}</td><td className="num">{v.toFixed(2)}</td></tr>)}</tbody></table></div>}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3>Import, export, raw JSON</h3>
        <ImportExport />
        {live && <div><button type="button" className="min-h-11 text-label underline underline-offset-4" aria-expanded={rawOpen} onClick={() => setRawOpen((o) => !o)}>{rawOpen ? "Hide" : "Show"} raw run JSON</button>{rawOpen && <pre className="mt-2 max-h-[60vh] overflow-auto rounded-md bg-background p-3 font-mono text-[12px]" tabIndex={0}>{JSON.stringify(run.raw, null, 2)}</pre>}</div>}
      </Card>
    </ChapterFrame>
  )
}

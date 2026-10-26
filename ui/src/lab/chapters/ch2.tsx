import { useState } from "react"
import { useKit, type Selection } from "../kit"
import { HIDDEN, INTERMEDIATE, LAYER_KINDS, MODEL, N_LAYERS, kindLabel } from "../model"
import { PRESETS, neuronsFor } from "../presets"
import { calibrationFor } from "../steering"
import { useLab } from "../store"
import { ViewImplementation } from "../source-ui"
import { fmt, signed } from "../types"
import { Card, Chip, Illustration, Note, cx } from "../ui"
import { ChapterFrame } from "./frame"

function Inspector({ sel }: { sel: Selection }) {
  const lab = useLab()
  const { controls, run } = lab
  const kind = LAYER_KINDS[sel.layer]
  const ns = neuronsFor(controls.preset, controls.component)
  const here = ns.filter((n) => n.layer === sel.layer)
  const focus = sel.neuron === null ? here : here.filter((n) => n.neuron === sel.neuron)
  const cal = calibrationFor(controls, run.calibration)
  const own = run.calibration.length > 0 && run.source !== "illustrative"
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-label">
        <dt className="text-muted-foreground">Layer</dt><dd className="font-mono">L{sel.layer} of {N_LAYERS - 1} (zero-based)</dd>
        <dt className="text-muted-foreground">Block</dt><dd>{kindLabel(kind)}{kind === "full_attention" ? ` · ${MODEL.num_attention_heads} heads, ${MODEL.num_key_value_heads} KV heads` : ` · ${MODEL.linear_num_value_heads} value heads`}</dd>
        <dt className="text-muted-foreground">MLP</dt><dd>{HIDDEN.toLocaleString()} → {INTERMEDIATE.toLocaleString()} → {HIDDEN.toLocaleString()}, {MODEL.hidden_act} gate</dd>
      </dl>
      {focus.length === 0 && <Note title="No recipe neuron here">{sel.neuron === null && here.length === 0 ? "This layer is not part of the selected recipe, so nothing is added here." : "This neuron is not in the selected recipe."}</Note>}
      {focus.map((n) => {
        const c = cal.find((x) => x.layer === n.layer && x.neuron === n.neuron)
        const cap = run.activations.find((a) => a.layer === n.layer && a.neuron === n.neuron)
        return (
          <section key={n.neuron} aria-label={`L${n.layer} N${n.neuron}`} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-mono">L{n.layer} N{n.neuron}</h3><Chip tone="recipe">◆ preset {signed(n.dose)}</Chip></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-label">
              <dt className="text-muted-foreground">Effective dose</dt><dd className="font-mono">{controls.intensity.toFixed(2)} × {signed(n.dose)} = <strong>{signed(controls.intensity * n.dose, 3)}</strong></dd>
              {c && <>
                <dt className="text-muted-foreground">R_L</dt><dd className="font-mono">{fmt(c.residMedian, 3)}</dd>
                <dt className="text-muted-foreground">‖w‖₂</dt><dd className="font-mono">{fmt(c.downColumnNorm, 4)}</dd>
                <dt className="text-muted-foreground">α added to z[n]</dt><dd className="font-mono">{signed(c.alpha, 3)}</dd>
                <dt className="text-muted-foreground">‖Δr‖₂ (this neuron)</dt><dd className="font-mono">{fmt(c.writeNorm, 3)}</dd>
                <dt className="text-muted-foreground">Calibration</dt><dd>{own ? "measured by the viewed run" : "recorded in README.md"}</dd>
              </>}
            </dl>
            <div>
              <p className="text-label font-semibold">Available measurements</p>
              {cap ? (
                <div className="mt-1 flex flex-col gap-2">
                  <p className="text-label text-muted-foreground">Captured at: {cap.capture}. This is the activation <em>entering</em> down_proj before this neuron's own addition, so it does not show the added α.</p>
                  <div className="overflow-x-auto"><table aria-label={`Measured activation of L${n.layer} N${n.neuron} per prompt token`}>
                    <thead><tr><th>Token</th><th className="num">Baseline</th><th className="num">Recipe</th><th className="num">Reversed</th></tr></thead>
                    <tbody>{cap.units.slice(-8).map((u, i) => <tr key={i}><td className="font-mono">{JSON.stringify(u.text)}</td><td className="num">{fmt(u.baseline, 4)}</td><td className="num">{fmt(u.forward, 4)}</td><td className="num">{fmt(u.reverse, 4)}</td></tr>)}</tbody>
                  </table></div>
                  <p className="text-meta text-muted-foreground">Last {Math.min(8, cap.units.length)} of {cap.units.length} prompt tokens.</p>
                </div>
              ) : <p className="text-label text-muted-foreground">No activation capture in the viewed run. Only the reference backend records them, and only for imported or live reference runs.</p>}
            </div>
          </section>
        )
      })}
      <div className="flex flex-wrap gap-2">
        <ViewImplementation id="hook-register" label="Where the hook is installed" />
        <ViewImplementation id="hf-decoder-layer" label="Layer structure" />
      </div>
    </div>
  )
}

export function Chapter2() {
  const lab = useLab()
  const { Tabs, Dialog, LayerView3D } = useKit()
  const { controls } = lab
  const [view, setView] = useState<"2d" | "3d">("2d")
  const sel = lab.inspect
  const setSel = lab.setInspect
  const ns = neuronsFor(controls.preset, controls.component)
  const recipeLayers = [...new Set(ns.map((n) => n.layer))]
  const full = LAYER_KINDS.filter((k) => k === "full_attention").length
  return (
    <ChapterFrame n={2} title="Inside the model" lead={<>
      <p>Qwen3.5-4B is a hybrid: {N_LAYERS - full} of its {N_LAYERS} decoder layers mix tokens with Gated DeltaNet linear attention and {full} with full attention (every {MODEL.full_attention_interval}th layer, indices {LAYER_KINDS.flatMap((k, i) => (k === "full_attention" ? [i] : [])).join(", ")}). Every layer ends with the same gated MLP, {INTERMEDIATE.toLocaleString()} neurons wide. This recipe touches only {recipeLayers.length} of the layers; click one to inspect it.</p>
    </>}>
      <Card className="relative flex flex-col gap-4 overflow-hidden">
        <div className="lab-atmosphere" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <Tabs label="Map view" value={view} onChange={(v) => setView(v as "2d" | "3d")} items={[{ value: "2d", label: "2D map" }, { value: "3d", label: "3D view" }]} />
          <p className="text-label text-muted-foreground">Recipe: <strong className="text-foreground">{PRESETS[controls.preset].name}</strong></p>
        </div>
        {view === "2d" || !LayerView3D ? (
          <>
            {view === "3d" && <Note title="3D view unavailable here">The optional 3D layer view is part of the local app (it loads three.js on demand). The 2D map below carries the same information.</Note>}
            <ol className="relative grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label="Decoder layers">
              {Array.from({ length: N_LAYERS }, (_, i) => {
                const hits = ns.filter((n) => n.layer === i)
                const isFull = LAYER_KINDS[i] === "full_attention"
                const on = sel?.layer === i
                return (
                  <li key={i}>
                    <button type="button" onClick={() => setSel({ layer: i, neuron: null })} aria-pressed={on}
                      aria-label={`Layer ${i}, ${kindLabel(LAYER_KINDS[i])}${hits.length ? `, ${hits.map((h) => `neuron ${h.neuron} dose ${signed(h.dose)}`).join(", ")}` : ", not in this recipe"}`}
                      className={cx("flex min-h-[72px] w-full flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-2 font-mono transition-colors duration-200", isFull && "border-dashed",
                        hits.length ? "border-recipe bg-recipe-soft text-foreground hover:bg-accent" : "border-border bg-card/60 text-muted-foreground hover:bg-accent", on && "ring-2 ring-ring")}>
                      <span className="text-[15px] font-semibold">L{i}</span>
                      <span aria-hidden className="text-[13px]">{isFull ? "▣ full" : "≈ linear"}</span>
                      {hits.length > 0 && <span className="text-[12px] text-recipe">◆ {hits.map((h) => signed(h.dose, 1)).join(" ")}</span>}
                    </button>
                  </li>
                )
              })}
            </ol>
          </>
        ) : (
          <LayerView3D selected={sel} onSelect={setSel} />
        )}
        <div className="relative flex flex-wrap gap-2" role="group" aria-label="Recipe neurons">
          {ns.map((n) => (
            <button key={`${n.layer}-${n.neuron}`} type="button" onClick={() => setSel({ layer: n.layer, neuron: n.neuron })}
              className="min-h-11 rounded-full border border-recipe bg-recipe-soft px-4 font-mono text-[14px] hover:bg-accent">◆ L{n.layer} · N{n.neuron} · {signed(n.dose)}</button>
          ))}
        </div>
        <p className="relative text-label text-muted-foreground">Layout is a table of indices. Position on this map means nothing about how neurons connect: weight similarity, logit lenses and spatial proximity do not establish circuits.</p>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h3>What the map comes from</h3>
          <ul className="list-disc space-y-2 pl-5 text-label text-muted-foreground">
            <li>Layer count, widths and block types are read from the pinned snapshot's <code>config.json</code> (revision <code>{MODEL.revision.slice(0, 10)}</code>) by <code>scripts/build_lab_data.py</code>.</li>
            <li>Neuron indices are zero-based coordinates of the activation that enters <code>down_proj</code>, copied from <code>presets.json</code>.</li>
            <li>Which layers are "relevant" is the recipe's own list; nothing here was ranked or discovered by this page.</li>
          </ul>
          <div className="flex flex-wrap gap-2"><ViewImplementation id="hf-decoder-layer" /><ViewImplementation id="hf-mlp" /></div>
        </Card>
        <Card className="flex flex-col gap-3">
          <h3>Why the hybrid matters here</h3>
          <p className="text-label text-muted-foreground">The intervention lives in the MLP, which is identical in both block types, so the same hook works in linear-attention and full-attention layers. In this recipe, L11 and L15 are full-attention layers; L10, L12–L14 and L16–L18 are linear-attention layers. Whether the block type changes how a push propagates is not something this page measures. <Illustration>Not measured</Illustration></p>
        </Card>
      </div>

      <Dialog open={!!sel && view === "2d"} onOpenChange={(o) => !o && setSel(null)} title={sel ? `Inspector · L${sel.layer}${sel.neuron !== null ? ` N${sel.neuron}` : ""}` : "Inspector"} description="Identifier, dose, measurements and verified source" side>
        {sel && <Inspector sel={sel} />}
      </Dialog>
      {view === "3d" && sel && <Card><Inspector sel={sel} /></Card>}
    </ChapterFrame>
  )
}

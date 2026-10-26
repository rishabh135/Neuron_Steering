import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "../icons"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useKit } from "../kit"
import { neuronsFor } from "../presets"
import { useLab } from "../store"
import { ViewImplementation } from "../source-ui"
import { calibrationFor, effectiveDose } from "../steering"
import { fmt, signed } from "../types"
import { Card, Chip, Illustration, Note, cx } from "../ui"
import { ChapterFrame } from "./frame"

interface Eq { id: string; title: string; eq: ReactNode; plain: string; source: string; rows: { sym: string; meaning: string; example: string; tag: "measured" | "recorded" | "computed" | "illustrative" }[] }

function ToyGeometry({ dose }: { dose: number }) {
  // r is drawn at length R_L (the calibration median), so |delta r| / R_L = |dose| is to scale. Angles are invented.
  const R = 120
  const o = { x: 56, y: 236 }
  const r = { x: o.x + R * Math.cos(-0.3), y: o.y + R * Math.sin(-0.3) }
  const u = { x: Math.cos(-1.0), y: Math.sin(-1.0) }
  const d = Math.abs(dose) * R
  const s = Math.sign(dose) || 1
  const fwd = { x: r.x + s * u.x * d, y: r.y + s * u.y * d }
  const rev = { x: r.x - s * u.x * d, y: r.y - s * u.y * d }
  const arrow = (a: { x: number; y: number }, b: { x: number; y: number }, c: string, dash: string, w = 3.5) => <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c} strokeWidth={w} strokeDasharray={dash} markerEnd={`url(#toy-${c.includes("baseline") ? "b" : c.includes("recipe") ? "r" : "v"})`} />
  const mk = (id: string, c: string) => <marker key={id} id={`toy-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill={c} /></marker>
  return (
    <svg viewBox="0 0 460 330" role="img" aria-label="Illustration: a two-dimensional toy of the residual vector r, and the added vector delta r in the recipe and reversed directions" className="h-auto w-full max-w-lg">
      <defs>{mk("b", "var(--baseline)")}{mk("r", "var(--recipe)")}{mk("v", "var(--reverse)")}</defs>
      <rect x="1" y="1" width="458" height="328" rx="12" fill="var(--background)" stroke="var(--border)" />
      <text x={14} y={26} fontSize={15} fill="var(--muted-foreground)">Illustration · 2-D toy · angles invented</text>
      {arrow(o, r, "var(--baseline)", "none", 4.5)}
      {arrow(r, fwd, "var(--recipe)", "7 4")}
      {arrow(r, rev, "var(--reverse)", "2 4")}
      <text x={fwd.x + 10} y={fwd.y + 5} fontSize={16} fill="var(--recipe)">◆</text>
      <text x={rev.x + 10} y={rev.y + 5} fontSize={16} fill="var(--reverse)">■</text>
      <g fontSize={15}>
        <text x={14} y={298} fill="var(--baseline)">● r_t (length R_L)</text>
        <text x={170} y={298} fill="var(--recipe)">◆ r_t + Δr_t (recipe)</text>
        <text x={340} y={298} fill="var(--reverse)">■ reversed</text>
      </g>
    </svg>
  )
}

export function Chapter4() {
  const lab = useLab()
  const { Button, Slider } = useKit()
  const { controls, run, prefs } = lab
  const ns = neuronsFor(controls.preset, controls.component)
  const cal = calibrationFor(controls, run.calibration)
  const [pick, setPick] = useState(0)
  const [step, setStep] = useState(1)
  const [playing, setPlaying] = useState(false)
  const n = ns[Math.min(pick, ns.length - 1)]
  const c = cal.find((x) => x.layer === n?.layer && x.neuron === n?.neuron)
  const own = run.source !== "illustrative" && run.calibration.some((x) => x.layer === n?.layer && x.neuron === n?.neuron)
  const capture = run.activations.find((a) => a.layer === n?.layer && a.neuron === n?.neuron)
  const lastUnit = capture?.units[capture.units.length - 1]

  const eqs: Eq[] = useMemo(() => {
    if (!n || !c) return []
    const eff = effectiveDose(controls.intensity, n.dose)
    const srcTag = own ? "measured" : "recorded"
    return [
      { id: "w", title: "The neuron's output direction", eq: <>w = W<sub>down</sub>[L][:, n]</>, source: "down-column", plain: "Column n of the down-projection matrix in layer L: the 2,560-number direction this neuron writes into the residual stream.",
        rows: [{ sym: "w", meaning: "one column of W_down, 2,560 numbers", example: `L${n.layer}, n = ${n.neuron}. ‖w‖₂ = ${fmt(c.downColumnNorm, 4)}`, tag: srcTag }, { sym: "n", meaning: "zero-based neuron index (0–9,215)", example: String(n.neuron), tag: "computed" }] },
      { id: "R", title: "How big a residual usually is", eq: <>R<sub>L</sub> = median<sub>t ≥ 1</sub> ‖r<sub>cal</sub>[L, t]‖<sub>2</sub></>, source: "resid-median", plain: "Run a fixed passage through the unsteered model, take the size of the residual leaving layer L at every position after the first, and keep the median. Position 0 is left out of this measurement only; it is still in the forward pass.",
        rows: [{ sym: "R_L", meaning: "median residual norm at layer L", example: fmt(c.residMedian, 3), tag: srcTag }, { sym: "r_cal[L,t]", meaning: "residual vector leaving layer L at calibration position t", example: "not shown: thousands of numbers per position", tag: "computed" }] },
      { id: "dose", title: "Scale the recipe by the slider", eq: <>effective_dose = intensity × preset_dose</>, source: "lab-pushes", plain: "Intensity 1.00 means the exact doses in presets.json. The sign travels with the dose.",
        rows: [{ sym: "intensity", meaning: "the slider", example: controls.intensity.toFixed(2), tag: "computed" }, { sym: "preset_dose", meaning: "signed dose from presets.json", example: signed(n.dose), tag: "computed" }, { sym: "effective_dose", meaning: "what is actually applied", example: `${controls.intensity.toFixed(2)} × ${signed(n.dose)} = ${signed(eff, 3)}`, tag: "computed" }] },
      { id: "alpha", title: "Turn a dose into one number", eq: <>α = effective_dose · R<sub>L</sub> / ‖w‖<sub>2</sub></>, source: "push-unit", plain: "α is the constant added to one activation. Dividing by ‖w‖ makes the write's size depend on the dose and R_L only, not on how long this particular column happens to be.",
        rows: [{ sym: "α", meaning: "activation offset added to z[n]", example: `${signed(eff, 3)} × ${fmt(c.residMedian, 3)} ÷ ${fmt(c.downColumnNorm, 4)} = ${signed(c.alpha, 3)}`, tag: srcTag }] },
      { id: "act", title: "Add it to the activation", eq: <>a′<sub>t</sub> = a<sub>t</sub> + α · e<sub>n</sub></>, source: "hook-add", plain: "a_t is the gated activation vector (9,216 numbers) entering down_proj at position t. e_n is zero everywhere except a 1 at coordinate n, so only that coordinate moves. Negative α subtracts a constant; it does not set the neuron to zero.",
        rows: [{ sym: "a_t", meaning: "z = SiLU(gate) ⊙ up at position t", example: lastUnit ? `a_t[n] = ${fmt(lastUnit.baseline, 4)} at the last prompt token ${JSON.stringify(lastUnit.text)} (measured, run ${run.id.slice(0, 8)})` : n.layer === 15 && n.neuron === 3920 ? "README records a_t[n] = 0.061 at one prompt's last token (a single measurement)" : "varies by token; not measured in this view", tag: lastUnit ? "measured" : "recorded" },
          { sym: "e_n", meaning: "unit vector selecting coordinate n", example: "(0, …, 0, 1, 0, …, 0)", tag: "computed" }, { sym: "a′_t[n]", meaning: "the activation after the push", example: lastUnit ? `${fmt(lastUnit.baseline, 4)} ${c.alpha < 0 ? "−" : "+"} ${Math.abs(c.alpha).toFixed(3)} = ${fmt(lastUnit.baseline + c.alpha, 4)}` : `a_t[n] ${c.alpha < 0 ? "−" : "+"} ${Math.abs(c.alpha).toFixed(3)}`, tag: lastUnit ? "computed" : "computed" }] },
      { id: "dr", title: "What reaches the residual stream", eq: <>Δr<sub>t</sub> = α · w</>, source: "hf-mlp", plain: "down_proj is linear, so the extra α at coordinate n produces exactly α times column n in the layer's output, then the residual addition carries it forward. The same vector is added at every position the hook sees.",
        rows: [{ sym: "Δr_t", meaning: "vector added to the residual at layer L", example: `${signed(c.alpha, 3)} × w, a 2,560-vector`, tag: srcTag }] },
      { id: "norm", title: "How large that write is", eq: <>‖Δr<sub>t</sub>‖<sub>2</sub> = |α| · ‖w‖<sub>2</sub> = |effective_dose| · R<sub>L</sub></>, source: "lab-calibration", plain: "For one neuron the size of the write is just the dose times a typical residual norm. With several neurons the norm of the sum also depends on the angles between their vectors, which are not in a run file.",
        rows: [{ sym: "‖Δr‖₂", meaning: "size of this neuron's write", example: `|${signed(eff, 3)}| × ${fmt(c.residMedian, 3)} = ${fmt(c.writeNorm, 3)}`, tag: srcTag }] },
    ]
  }, [n, c, controls.intensity, own, lastUnit, run.id])

  useEffect(() => {
    if (!playing) return
    if (step >= eqs.length) { setPlaying(false); return }
    const t = setTimeout(() => setStep((s) => s + 1), 3200 / prefs.speed)
    return () => clearTimeout(t)
  }, [playing, step, eqs.length, prefs.speed])

  if (!n || !c) return <ChapterFrame n={4} title="The mathematics" lead={<p>No calibration is available for this selection.</p>}><Note tone="error">No calibration rows match the selected neurons.</Note></ChapterFrame>
  const cur = eqs[Math.min(step, eqs.length) - 1]
  const tagTone = { measured: "ok", recorded: "baseline", computed: "neutral", illustrative: "note" } as const
  return (
    <ChapterFrame n={4} title="The mathematics" lead={<><p>Seven short statements, one at a time. Each is matched to the code that runs it and a worked example for the neuron you select. Numbers are labelled by where they come from.</p></>}>
      <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="Neuron used in the examples">
        {ns.map((x, i) => (
          <button key={`${x.layer}-${x.neuron}`} type="button" role="radio" aria-checked={i === pick} onClick={() => setPick(i)}
            className={cx("min-h-11 rounded-full border px-4 font-mono text-[14px]", i === pick ? "border-primary bg-recipe-soft" : "border-border hover:bg-accent")}>◆ L{x.layer} · N{x.neuron} · {signed(x.dose)}</button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-6">
          <ol className="flex flex-col gap-3" aria-label="Equations revealed so far">
            {eqs.slice(0, step).map((e, i) => (
              <li key={e.id} className={cx("lab-reveal rounded-md border px-4 py-3 font-mono text-[17px] sm:text-[19px]", i === step - 1 ? "border-primary bg-recipe-soft" : "border-border bg-secondary text-muted-foreground")} aria-current={i === step - 1 ? "step" : undefined}>
                <span className="mr-3 text-meta text-muted-foreground">{i + 1}</span>{e.eq}
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3 border-t border-border pt-4" role="group" aria-label="Playback">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => { if (step >= eqs.length) setStep(1); setPlaying((p) => !p) }} aria-pressed={playing}>{playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}{playing ? "Pause" : "Play"}</Button>
              <Button variant="outline" size="icon" aria-label="Previous equation" onClick={() => { setPlaying(false); setStep((s) => Math.max(1, s - 1)) }} disabled={step <= 1}><SkipBack size={18} /></Button>
              <Button variant="outline" size="icon" aria-label="Next equation" onClick={() => { setPlaying(false); setStep((s) => Math.min(eqs.length, s + 1)) }} disabled={step >= eqs.length}><SkipForward size={18} /></Button>
              <Button variant="ghost" onClick={() => { setStep(1); setPlaying(true) }}><RotateCcw size={16} aria-hidden />Replay</Button>
              <label className="ml-auto flex items-center gap-2 text-label"><span className="text-muted-foreground">Speed</span>
                <select value={prefs.speed} onChange={(e) => lab.setPrefs({ speed: Number(e.target.value) as 0.25 | 0.5 | 1 | 2 })} className="min-h-11 rounded-md border border-input bg-background px-2" aria-label="Playback speed">
                  <option value={0.25}>0.25× (slowest)</option><option value={0.5}>0.5× (slow)</option><option value={1}>1×</option><option value={2}>2×</option>
                </select></label>
            </div>
            <div className="flex items-center gap-3"><span className="text-label text-muted-foreground" aria-hidden>Scrub</span>
              <Slider label={`Equation ${step} of ${eqs.length}`} value={step} min={1} max={eqs.length} step={1} onChange={(v) => { setPlaying(false); setStep(v) }} /><span className="font-mono text-label">{step}/{eqs.length}</span></div>
            <p className="text-meta text-muted-foreground">No autoplay. Playback stops at the last equation and does not loop. Explanatory timing only: {(3.2 / prefs.speed).toFixed(1)} s per equation.</p>
          </div>
        </Card>

        <Card className="flex flex-col gap-4" aria-live="polite">
          <p className="text-label font-semibold text-muted-foreground">Equation {step} · {cur.title}</p>
          <p className="text-body">{cur.plain}</p>
          <div className="overflow-x-auto"><table aria-label="Symbols for this equation">
            <thead><tr><th>Symbol</th><th>Meaning</th><th>For L{n.layer} N{n.neuron}</th></tr></thead>
            <tbody>{cur.rows.map((r) => (
              <tr key={r.sym}><td className="font-mono font-semibold">{r.sym}</td><td>{r.meaning}</td><td><span className="font-mono text-[14px]">{r.example}</span><div className="mt-1"><Chip tone={tagTone[r.tag]}>{r.tag === "measured" ? "measured in the viewed run" : r.tag === "recorded" ? "recorded in README.md" : r.tag === "computed" ? "arithmetic" : "illustration"}</Chip></div></td></tr>
            ))}</tbody>
          </table></div>
          <div className="flex flex-wrap gap-2"><ViewImplementation id={cur.source} />{cur.id === "act" && <ViewImplementation id="push-unit" label="Dose to α" />}</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3>Adding a vector, in two dimensions</h3><Illustration>Illustration · 2-D toy</Illustration></div>
          <ToyGeometry dose={effectiveDose(controls.intensity, n.dose)} />
          <p className="text-label text-muted-foreground">r is drawn at length R<sub>L</sub>, so the added vector's length relative to it, |effective dose| = {Math.abs(effectiveDose(controls.intensity, n.dose)).toFixed(2)}, is to scale. The angles are invented; a real residual has 2,560 dimensions and the real w is not drawn here.</p>
        </Card>
        <Card className="flex flex-col gap-4">
          <h3>Details that are easy to get wrong</h3>
          <ul className="list-disc space-y-3 pl-5 text-label text-muted-foreground">
            <li><strong className="text-foreground">Negative dose subtracts α.</strong> It shifts the activation down by a constant; the neuron is not switched off.</li>
            <li><strong className="text-foreground">Several neurons:</strong> each adds its own α·w. The norm of the sum depends on their directions, so |dose|·R_L holds per neuron, not for the total.</li>
            <li><strong className="text-foreground">Positions:</strong> the reference hook acts on every position of each forward input: all prompt positions in prefill, the new token in each decode step. Only the calibration measurement skips position 0.</li>
            <li><strong className="text-foreground">Steering is not abliteration.</strong> Steering adds a vector at run time and leaves every weight unchanged. Abliteration removes a direction (projects it out) from activations or weights. This project does only the first.</li>
          </ul>
        </Card>
      </div>
    </ChapterFrame>
  )
}

import { Play, RotateCcw, Square } from "../icons"
import { useEffect, useState } from "react"
import { useKit } from "../kit"
import { PRESETS, PRESET_IDS, neuronsFor } from "../presets"
import { useLab } from "../store"
import { effectiveDose } from "../steering"
import { BRANCHES, signed } from "../types"
import { BranchTag, Card, Chip, ImportExport, Note, NumberField, cx } from "../ui"
import { ChapterFrame } from "./frame"
import { LayerStrip } from "./layer-strip"

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])
  return <span className="tabular-nums">{Math.max(0, (now - since) / 1000).toFixed(0)} s</span>
}

export function Chapter1() {
  const lab = useLab()
  const { Button, Slider, Number: Num } = useKit()
  const { controls, limits } = lab
  const neurons = neuronsFor(controls.preset, controls.component)
  const preset = PRESETS[controls.preset]
  const busy = !!lab.pending
  const runHelp = !lab.api ? "This portable page cannot run the model. Import a measured run, or use the local app for live inference."
    : lab.apiError ? lab.apiError
    : lab.apiStatus && !lab.apiStatus.generates ? "The API is in illustration mode and does not generate. Start it with --backend reference or --backend llama."
    : null
  return (
    <ChapterFrame n={1} title="Experiment" lead={<>
      <p>One prompt goes in three times. Only the model's internal state differs: a constant is added to a few named MLP activations, then to the same activations with every sign reversed. Greedy decoding, thinking off, no system prompt. This is activation steering; the personality names are hypotheses to test, not findings.</p>
    </>}>
      <div className="relative overflow-hidden rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="lab-atmosphere" aria-hidden />
        <div className="relative flex flex-col gap-3">
          <p className="text-label font-semibold">The 32 decoder layers, and where this recipe writes</p>
          <LayerStrip />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="prompt" className="text-label font-semibold">Shared prompt <span className="font-normal text-muted-foreground">(identical in all three branches)</span></label>
            <textarea id="prompt" value={controls.prompt} rows={3} maxLength={limits.prompt_chars} onChange={(e) => lab.setControls({ prompt: e.target.value })}
              className="w-full resize-y rounded-md border border-input bg-background p-3 text-body" />
            <p className="text-meta text-muted-foreground">{controls.prompt.length.toLocaleString()} / {limits.prompt_chars.toLocaleString()} characters. {lab.run.source === "illustrative" && "The illustration always shows its own authored prompt."}</p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label font-semibold">Recipe</legend>
            <div role="radiogroup" aria-label="Recipe" className="grid gap-2 sm:grid-cols-2">
              {PRESET_IDS.map((id) => {
                const on = id === controls.preset
                return (
                  <label key={id} className={cx("flex min-h-11 cursor-pointer flex-col gap-0.5 rounded-md border p-3 transition-colors duration-200 focus-within:outline focus-within:outline-[3px] focus-within:outline-ring", on ? "border-primary bg-recipe-soft" : "border-border hover:bg-accent")}>
                    <input type="radio" name="preset" value={id} checked={on} onChange={() => lab.setControls({ preset: id })} className="sr-only" />
                    <span className="flex items-center gap-2 font-semibold"><span aria-hidden className="font-mono text-recipe">{on ? "◆" : "◇"}</span>{PRESETS[id].name}</span>
                    <span className="font-mono text-meta text-muted-foreground">{PRESETS[id].neurons.map((n) => `L${n.layer}·N${n.neuron}`).join("  ")}</span>
                  </label>
                )
              })}
            </div>
            <p className="text-label text-muted-foreground"><strong className="text-foreground">Hypothesis:</strong> {preset.claim}</p>
          </fieldset>

          {preset.neurons.length > 1 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="subset" className="text-label font-semibold">Neurons to push</label>
              <select id="subset" value={controls.component ?? ""} onChange={(e) => lab.setControls({ component: e.target.value === "" ? null : Number(e.target.value) })}
                disabled={lab.apiStatus ? !lab.apiStatus.components : false} className="min-h-11 rounded-md border border-input bg-background px-3 text-label">
                <option value="">Whole recipe ({preset.neurons.length} neurons)</option>
                {preset.neurons.map((n, i) => <option key={i} value={i}>Only L{n.layer} N{n.neuron} ({signed(n.dose)})</option>)}
              </select>
              {lab.apiStatus && !lab.apiStatus.components && <p className="text-meta text-muted-foreground">The llama backend runs whole exported recipes; single neurons need the reference backend.</p>}
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-col gap-1">
              <label htmlFor="intensity-slider" className="text-label font-semibold">Intensity <span className="font-normal text-muted-foreground">(1.00 = the exact preset doses)</span></label>
              <Slider id="intensity-slider" label="Intensity" value={controls.intensity} min={limits.intensity_min} max={limits.intensity_max} step={0.01} onChange={(v) => lab.setControls({ intensity: Math.round(v * 100) / 100 })} />
            </div>
            <NumberField id="intensity" label="Exact value" value={controls.intensity} min={limits.intensity_min} max={limits.intensity_max} onCommit={(v) => lab.setControls({ intensity: v })} hint={`Validated range ${limits.intensity_min}–${limits.intensity_max}`} />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <NumberField id="max-new" label="Maximum new tokens" value={controls.maxNew} min={limits.max_new_min} max={limits.max_new_max} onCommit={(v) => Number.isInteger(v) && lab.setControls({ maxNew: v })} hint={`Whole number, ${limits.max_new_min}–${limits.max_new_max}`} />
            <div className="flex flex-col gap-1"><span className="text-label font-semibold">Fixed settings</span><p className="text-label text-muted-foreground">Greedy argmax · thinking off · one user turn · BF16 (reference). Not editable: no backend path or validation exists for other values.</p></div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
            {lab.api ? (
              <Button variant="primary" onClick={lab.runComparison} disabled={!lab.canRun} aria-describedby="run-help"><Play size={18} aria-hidden />Run comparison</Button>
            ) : (
              <Button variant="primary" onClick={() => document.getElementById("import-panel")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Play size={18} aria-hidden />Load a measured run</Button>
            )}
            {busy && <Button variant="outline" onClick={lab.cancelWait}><Square size={16} aria-hidden />Stop waiting</Button>}
            <Button variant="ghost" onClick={lab.resetControls}><RotateCcw size={16} aria-hidden />Reset</Button>
          </div>
          <div id="run-help" aria-live="polite" className="flex flex-col gap-2">
            {runHelp && <p className="text-label text-muted-foreground">{runHelp}</p>}
            {busy && lab.pending && (
              <div className="flex flex-col gap-1">
                <div role="progressbar" aria-label="Waiting for the model; progress is unknown" aria-busy className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full w-1/3 animate-[lab-slide_1.6s_ease-in-out_infinite] rounded-full bg-primary" /></div>
                <p className="text-label text-muted-foreground">The server answers once all three branches finish; there is no per-token progress. Waiting <Elapsed since={lab.pending.startedAt} /> (the first reference request also loads the model, about 10–15 s on an M4 Pro).</p>
              </div>
            )}
            {lab.liveMessage && <p role={lab.liveMessage.kind === "error" ? "alert" : "status"} className={cx("text-label", lab.liveMessage.kind === "error" ? "text-destructive" : lab.liveMessage.kind === "ok" ? "text-ok" : "text-muted-foreground")}>{lab.liveMessage.text}</p>}
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <h3>Signed coordinates</h3>
            <p className="text-label text-muted-foreground">Zero-based layer L, zero-based neuron N in the 9,216-wide MLP activation. Dose is in units of that layer's median residual norm.</p>
            <ul className="flex flex-col gap-2" aria-label="Neurons in the selected recipe">
              {neurons.map((n) => (
                <li key={`${n.layer}-${n.neuron}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary px-3 py-2">
                  <span className="font-mono text-label font-semibold">L{n.layer} · N{n.neuron}</span>
                  <span className="font-mono text-[14px]">preset {signed(n.dose)} <span className="text-muted-foreground">×</span> {controls.intensity.toFixed(2)} <span className="text-muted-foreground">=</span> <strong className="text-recipe"><Num value={effectiveDose(controls.intensity, n.dose)} format={(v) => signed(v, 3)} /></strong></span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="flex flex-col gap-3">
            <h3>Three branches, one prompt</h3>
            <ul className="flex flex-col gap-2">
              {BRANCHES.map((b) => (
                <li key={b.key} className="flex items-start gap-3 rounded-md bg-secondary px-3 py-2">
                  <BranchTag branch={b.key} />
                  <span className="text-label text-muted-foreground">{b.key === "baseline" ? "Hooks installed, zero added." : b.key === "forward" ? "Each signed dose × intensity added." : "The same recipe with every sign flipped."}</span>
                </li>
              ))}
            </ul>
            {lab.stale && <Note title="Earlier configuration">The result you are looking at was produced with different settings than the controls above. It is kept, not recomputed.</Note>}
          </Card>
          <Card className="flex flex-col gap-3" id="import-panel">
            <h3>Measured runs</h3>
            <p className="text-label text-muted-foreground">Import a run exported by this project (schema_version 1) or a bundle. A file that fails validation never replaces what you are viewing.</p>
            <ImportExport />
            {lab.savedRuns.length > 0 && (
              <div className="flex flex-col gap-1">
                <label htmlFor="saved" className="text-label font-semibold">Saved on this Mac ({lab.savedRuns.length})</label>
                <select id="saved" value="" onChange={(e) => e.target.value && lab.loadSaved(e.target.value)} className="min-h-11 rounded-md border border-input bg-background px-3 text-label">
                  <option value="">Choose a saved run…</option>
                  {lab.savedRuns.slice(0, 60).map((r) => <option key={r.run_id} value={r.run_id}>{r.preset} · {r.intensity} · {r.backend} · {r.prompt.slice(0, 40)}</option>)}
                </select>
              </div>
            )}
            {lab.runs.length > 1 && (
              <div className="flex flex-col gap-1">
                <label htmlFor="history" className="text-label font-semibold">Runs this session</label>
                <select id="history" value={lab.activeKey ?? ""} onChange={(e) => lab.selectRun(e.target.value || null)} className="min-h-11 rounded-md border border-input bg-background px-3 text-label">
                  <option value="">Illustration</option>
                  {lab.runs.map((r) => <option key={lab.runKey(r)} value={lab.runKey(r)}>{r.source === "live" ? "Live" : "Imported"} · {r.request.preset} · {r.request.intensity} · {r.request.prompt.slice(0, 32)}</option>)}
                </select>
              </div>
            )}
            {lab.run.source === "illustrative" && <Chip tone="note">Showing authored illustration</Chip>}
          </Card>
        </div>
      </div>
    </ChapterFrame>
  )
}

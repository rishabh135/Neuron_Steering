import { Eye, EyeOff, Minus, Plus, RotateCcw } from "../icons"
import { useEffect, useState } from "react"
import { useKit } from "../kit"
import { HIDDEN, INTERMEDIATE } from "../model"
import { neuronsFor } from "../presets"
import { useLab } from "../store"
import { ViewImplementation } from "../source-ui"
import { calibrationFor } from "../steering"
import { Card, Note, cx } from "../ui"
import { ChapterFrame } from "./frame"

interface Step { n: number; title: string; short: string; detail: string; sources: string[]; kind: "stream" | "op" | "hook" | "port" }

export const STEPS: Step[] = [
  { n: 1, title: "Residual stream after attention", short: "h after mixer", kind: "stream", sources: ["hf-decoder-layer"],
    detail: `The layer's input h has already passed through input_layernorm and the token mixer (Gated DeltaNet or full attention) and been added back: h_mid = h + mixer(norm(h)). h_mid is a ${HIDDEN.toLocaleString()}-vector per token position. One copy continues down the skip path unchanged.` },
  { n: 2, title: "RMSNorm", short: "post_attention_layernorm", kind: "op", sources: ["hf-decoder-layer"],
    detail: "A copy of h_mid is normalised by post_attention_layernorm (RMSNorm with a zero-centred weight, output × (1 + weight)). Only this copy enters the MLP; the skip path keeps the un-normalised h_mid." },
  { n: 3, title: "gate_proj and up_proj", short: "two linear maps", kind: "op", sources: ["hf-mlp"],
    detail: `Two linear maps take the normalised ${HIDDEN.toLocaleString()}-vector to ${INTERMEDIATE.toLocaleString()} numbers each: gate = gate_proj(x) and up = up_proj(x).` },
  { n: 4, title: "Gated activation z = SiLU(gate) ⊙ up", short: "z, 9,216 wide", kind: "op", sources: ["hf-mlp"],
    detail: `Elementwise: z[i] = SiLU(gate[i]) · up[i]. These ${INTERMEDIATE.toLocaleString()} numbers per token are "the MLP neuron activations" in this project (a_t). They are the input of down_proj.` },
  { n: 5, title: "Intervention: z[n] ← z[n] + α", short: "+ α · eₙ  (before down_proj)", kind: "hook", sources: ["hook-add", "push-unit", "hook-register"],
    detail: "A forward pre-hook on down_proj receives z, clones it, and adds the dose-derived constant α to coordinate n only. It runs on every position of the forward input: all prompt positions during prefill, then the one new token at each decode step. The batch carries three rows with signs +1, 0 and −1, so one call produces the recipe, baseline and reversed branches." },
  { n: 6, title: "down_proj", short: "W_down · z", kind: "op", sources: ["hf-mlp", "down-column"],
    detail: "down_proj is linear and has no bias, so the extra α at coordinate n contributes exactly α · W_down[:, n] = α·w to the MLP output, a vector in the residual space. That is the whole effect on this layer: Δr = α·w." },
  { n: 7, title: "Residual addition", short: "h_out = h_mid + MLP out", kind: "op", sources: ["hf-decoder-layer"],
    detail: "The MLP output joins the skip path: h_out = h_mid + down_proj(z′). Layer L+1 reads h_out. Later layers see the change through their own norms, attention and MLPs; the push is not re-applied there unless the recipe lists that layer." },
  { n: 8, title: "Port: control vector after step 7", short: "llama.cpp build_cvec", kind: "port", sources: ["llama-cvec-call", "llama-cvec-apply", "llama-cvec-parse"],
    detail: "llama.cpp has no neuron hook. The exported GGUF stores α·w per layer as direction.L, and build_cvec adds it after the layer's FFN residual addition. Because step 6 and step 7 are linear, this equals step 5 exactly in real arithmetic. The vectors are derived from BF16 weights; on a quantized model it is a port, not the same intervention." },
]

// Diagram geometry in viewBox units; text sizes are >= 14 so labels stay readable when scaled to phone width.
const NODE = { x: 150, w: 250, h: 58 }
const Y: Record<number, number> = { 1: 20, 2: 120, 3: 220, 4: 320, 5: 420, 6: 520, 7: 640 }

function Badge({ cx: x, cy, n, on }: { cx: number; cy: number; n: number; on: boolean }) {
  return <g aria-hidden><circle cx={x} cy={cy} r={15} fill={on ? "var(--primary)" : "var(--card)"} stroke={on ? "var(--primary)" : "var(--muted-foreground)"} strokeWidth={2} /><text x={x} y={cy + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill={on ? "var(--primary-foreground)" : "var(--foreground)"}>{n}</text></g>
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof matchMedia === "function" && matchMedia("(max-width: 639px)").matches)
  useEffect(() => {
    const m = matchMedia("(max-width: 639px)")
    const f = () => setNarrow(m.matches)
    m.addEventListener("change", f)
    return () => m.removeEventListener("change", f)
  }, [])
  return narrow
}

export function Chapter3() {
  const lab = useLab()
  const { Button } = useKit()
  const [active, setActive] = useState(5)
  const [zoom, setZoom] = useState(1)
  const narrow = useNarrow()
  const reduce = lab.reducedMotion
  const step = STEPS.find((s) => s.n === active)!
  const ns = neuronsFor(lab.controls.preset, lab.controls.component)
  const cal = calibrationFor(lab.controls, lab.run.calibration)
  const first = cal[0]
  const showNotes = lab.prefs.annotations

  const node = (s: number, label: string, sub: string, kind: "op" | "hook" | "stream" = "op", x = NODE.x) => {
    const y = Y[s]
    const on = active === s
    const stroke = kind === "hook" ? "var(--recipe)" : on ? "var(--ring)" : "var(--border)"
    return (
      <g key={s} role="button" tabIndex={0} aria-label={`Step ${s}: ${label}`} aria-pressed={on} onClick={() => setActive(s)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(s) } }} className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[4px] [&:focus-visible>rect]:stroke-ring">
        <rect x={x} y={y} width={NODE.w} height={NODE.h} rx={12} fill={kind === "hook" ? "var(--recipe-soft)" : "var(--secondary)"} stroke={stroke} strokeWidth={on ? 3.5 : 2} strokeDasharray={kind === "hook" ? "7 4" : undefined} />
        <text x={x + NODE.w / 2} y={y + 25} textAnchor="middle" fontSize={16} fontWeight={650} fill="var(--foreground)">{label}</text>
        <text x={x + NODE.w / 2} y={y + 44} textAnchor="middle" fontSize={14.5} fill="var(--muted-foreground)" fontFamily="var(--font-mono)">{sub}</text>
        <Badge cx={x} cy={y} n={s} on={on} />
      </g>
    )
  }
  const arrow = (x1: number, y1: number, x2: number, y2: number, flowing = false, dash?: string) => (
    <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={flowing ? "var(--ring)" : "var(--muted-foreground)"} strokeWidth={2.5} fill="none" markerEnd="url(#arr)" strokeDasharray={dash} className={flowing && !reduce ? "lab-flow" : undefined} />
  )
  const cx0 = NODE.x + NODE.w / 2
  return (
    <ChapterFrame n={3} title="The intervention" lead={<>
      <p>One decoder layer, drawn as the code runs it. The skip path on the left never touches the MLP. The push happens on the right, <strong className="text-foreground">after</strong> the gated activation is formed and <strong className="text-foreground">immediately before</strong> <code>down_proj</code>. Select a numbered step.</p>
    </>}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="flex min-w-0 flex-col gap-4 self-start">
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Diagram controls">
            <Button variant="outline" size="icon" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} disabled={zoom <= 1}><Minus size={18} /></Button>
            <span className="min-w-14 text-center font-mono text-label" aria-live="polite">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="icon" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))} disabled={zoom >= 2.5}><Plus size={18} /></Button>
            <Button variant="ghost" size="sm" onClick={() => setZoom(1)}><RotateCcw size={16} aria-hidden />Reset zoom</Button>
            <Button variant="outline" size="sm" aria-pressed={showNotes} onClick={() => lab.setPrefs({ annotations: !showNotes })}>{showNotes ? <Eye size={16} aria-hidden /> : <EyeOff size={16} aria-hidden />}Annotations {showNotes ? "on" : "off"}</Button>
          </div>
          <div className="overflow-auto rounded-md border border-border bg-background" tabIndex={0} aria-label="Intervention diagram (scrollable)">
            <svg viewBox={narrow ? "30 0 380 800" : "0 0 700 800"} style={{ width: `${zoom * 100}%`, minWidth: narrow ? 0 : 640 }} role="group" aria-label="Decoder layer block diagram with the additive intervention before down_proj" className="block">
              <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--muted-foreground)" /></marker></defs>
              {/* skip path (left rail): 1 -> 7 */}
              <path d={`M${NODE.x} ${Y[1] + 28} H60 V${Y[7] + 28} H${NODE.x}`} fill="none" stroke="var(--baseline)" strokeWidth={3} markerEnd="url(#arr)" />
              <text x={44} y={Y[4] + 60} fontSize={15} fill="var(--baseline)" transform={`rotate(-90 44 ${Y[4] + 60})`} textAnchor="middle">skip path: h_mid, unchanged</text>
              {/* main path */}
              {arrow(cx0, Y[1] + 56, cx0, Y[2], active === 2)}
              {arrow(cx0, Y[2] + 56, cx0, Y[3], active === 3)}
              {arrow(cx0, Y[3] + 56, cx0, Y[4], active === 4)}
              {arrow(cx0, Y[4] + 56, cx0, Y[5], active === 5)}
              {arrow(cx0, Y[5] + 56, cx0, Y[6], active === 6)}
              {arrow(cx0, Y[6] + 56, cx0, Y[7], active === 7)}
              {/* step 5 carries the constant in from the side */}
              <path d={`M${NODE.x + NODE.w + 36} ${Y[5] + 28} H${NODE.x + NODE.w + 4}`} stroke="var(--recipe)" strokeWidth={3} markerEnd="url(#arr)" fill="none" className={active === 5 && !reduce ? "lab-flow" : undefined} />
              {node(1, "h_mid", "2,560 per token", "stream")}
              {node(2, "RMSNorm", "post_attention_layernorm")}
              {node(3, "gate_proj · up_proj", "2,560 → 9,216 ×2")}
              {node(4, "z = SiLU(gate) ⊙ up", "9,216 per token")}
              {node(5, "z[n] ← z[n] + α", "pre-hook on down_proj", "hook")}
              {node(6, "down_proj", "W_down · z′ → α·w added")}
              {node(7, "h_out = h_mid + MLP", "to layer L+1", "stream")}
              {/* port (step 8): dashed alternative after step 7 */}
              <g role="button" tabIndex={0} aria-label="Step 8: llama.cpp control vector" aria-pressed={active === 8} onClick={() => setActive(8)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(8) } }} className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[4px] [&:focus-visible>rect]:stroke-ring">
                <rect x={NODE.x} y={Y[7] + 74} width={NODE.w} height={50} rx={12} fill="var(--reverse-soft)" stroke={active === 8 ? "var(--ring)" : "var(--reverse)"} strokeWidth={active === 8 ? 3.5 : 2} strokeDasharray="2 4" />
                <text x={cx0} y={Y[7] + 104} textAnchor="middle" fontSize={15} fontWeight={650} fill="var(--foreground)">llama.cpp: + α·w here</text>
                <Badge cx={NODE.x} cy={Y[7] + 74} n={8} on={active === 8} />
              </g>
              {/* annotation callouts: short label + leader line to the node edge, right of the diagram */}
              {showNotes && !narrow && ([[5, "+ α on coordinate n, every position"], [4, "These 9,216 are the neurons"], [6, "Linear: gives exactly α·w"], [7, "Reaches layer L+1"], [1, "Skip path keeps h_mid"]] as [number, string][]).map(([s, text]) => {
                const y = Y[s] + 28
                const lx = NODE.x + NODE.w + 40
                const lines = text.length > 24 ? [text.slice(0, text.lastIndexOf(" ", 24)), text.slice(text.lastIndexOf(" ", 24) + 1)] : [text]
                return (
                  <g key={s} aria-hidden>
                    {s !== 5 && <path d={`M${NODE.x + NODE.w + 6} ${y} H${lx - 6}`} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="3 3" />}
                    <rect x={lx} y={y - 22} width={250} height={lines.length > 1 ? 58 : 40} rx={8} fill="var(--card)" stroke="var(--border)" />
                    <circle cx={lx + 18} cy={y - 2} r={11} fill="var(--secondary)" stroke="var(--muted-foreground)" /><text x={lx + 18} y={y + 3} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--foreground)">{s}</text>
                    {lines.map((l, i) => <text key={i} x={lx + 38} y={y + 3 + i * 19} fontSize={15} fill="var(--foreground)">{l}</text>)}
                  </g>
                )
              })}
            </svg>
          </div>
          <p className="text-meta text-muted-foreground">Schematic. Arrow animation shows direction of data flow, not signal size or speed. Zoom keeps annotations anchored because they scale with the drawing.</p>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-4" aria-live="polite">
            <p className="text-label font-semibold text-muted-foreground">Step {step.n} of {STEPS.length}</p>
            <h3>{step.title}</h3>
            <p className="text-body text-foreground/95">{step.detail}</p>
            {step.n === 5 && first && (
              <p className="rounded-md bg-secondary p-3 font-mono text-[14px]">
                α = {first.dose.toFixed(3)} × {first.residMedian.toFixed(3)} ÷ {first.downColumnNorm.toFixed(4)} = <strong>{first.alpha.toFixed(3)}</strong><br />
                <span className="text-muted-foreground">for L{first.layer} N{first.neuron}, current intensity {lab.controls.intensity.toFixed(2)}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">{step.sources.map((id) => <ViewImplementation key={id} id={id} />)}</div>
          </Card>
          <Card className="flex flex-col gap-2">
            <h3>Steps</h3>
            <ol className="flex flex-col gap-1" aria-label="Steps">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <button type="button" onClick={() => setActive(s.n)} aria-current={active === s.n ? "step" : undefined}
                    className={cx("flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-label transition-colors duration-200", active === s.n ? "border-primary bg-recipe-soft" : "border-transparent hover:bg-accent")}>
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-muted-foreground font-mono text-[13px] font-bold">{s.n}</span>
                    <span className="min-w-0"><span className="font-semibold">{s.title}</span></span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
      <Note title="Actual hook placement, in one line">
        Reference backend: <code>layers[L].mlp.down_proj.register_forward_pre_hook</code> adds α to <code>z[:, :, n]</code> for the {ns.length} recipe neuron{ns.length > 1 ? "s" : ""} ({ns.map((n) => `L${n.layer} N${n.neuron}`).join(", ")}). The hook does not alter weights, does not zero anything, and its push state is cleared in a <code>finally</code> block after every call (the hook stays installed but adds nothing when no push is set).
      </Note>
    </ChapterFrame>
  )
}

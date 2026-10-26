import { useLab } from "../store"
import { LAYER_KINDS, N_LAYERS, kindLabel } from "../model"
import { neuronsFor } from "../presets"
import { signed } from "../types"
import { cx } from "../ui"

/** Compact 32-layer strip: highlights only the recipe layers; shape (not colour) marks the block type. */
export function LayerStrip() {
  const { controls } = useLab()
  const ns = neuronsFor(controls.preset, controls.component)
  const byLayer = new Map<number, number[]>()
  ns.forEach((n) => byLayer.set(n.layer, [...(byLayer.get(n.layer) ?? []), n.dose]))
  return (
    <div>
      <ol className="grid grid-cols-8 gap-1.5 sm:grid-cols-16 sm:gap-2" aria-label="Decoder layers 0 to 31">
        {Array.from({ length: N_LAYERS }, (_, i) => {
          const hit = byLayer.get(i)
          const full = LAYER_KINDS[i] === "full_attention"
          return (
            <li key={i} className={cx("flex min-h-11 flex-col items-center justify-center rounded-md border text-center font-mono text-[13px] leading-tight", hit ? "border-recipe bg-recipe-soft text-foreground" : "border-border text-muted-foreground", full && "border-dashed")}
              aria-label={`Layer ${i}, ${kindLabel(LAYER_KINDS[i])}${hit ? `, recipe dose ${hit.map((d) => signed(d)).join(" and ")}` : ""}`}>
              <span>{i}</span>
              <span aria-hidden className="text-[11px]">{hit ? "◆" : full ? "▣" : "·"}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-meta text-muted-foreground">▣ dashed = full attention (8 layers) · plain = Gated DeltaNet linear attention (24 layers) · ◆ violet = layer with a recipe neuron. Layer 0 is never steered by the llama.cpp port.</p>
    </div>
  )
}

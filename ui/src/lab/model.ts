import facts from "./generated/model-facts.json"

// Derived by scripts/build_lab_data.py from the pinned snapshot's config.json; never typed by hand.
export const MODEL = facts
export type LayerKind = "linear_attention" | "full_attention"
export const LAYER_KINDS = facts.layer_types as LayerKind[]
export const N_LAYERS = facts.num_hidden_layers
export const HIDDEN = facts.hidden_size
export const INTERMEDIATE = facts.intermediate_size
export const FULL_ATTENTION_LAYERS = LAYER_KINDS.flatMap((k, i) => (k === "full_attention" ? [i] : []))
export const kindLabel = (k: LayerKind) => (k === "full_attention" ? "Full attention" : "Gated DeltaNet (linear attention)")
export const kindShort = (k: LayerKind) => (k === "full_attention" ? "Full" : "Linear")

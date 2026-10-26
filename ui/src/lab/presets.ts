import presetsJson from "../../../presets.json"
import type { Neuron, Preset } from "./types"

// presets.json at the repository root is the authority for every recipe, sign and zero-based index.
export const PRESETS = presetsJson as Record<string, Preset>
export const PRESET_IDS = Object.keys(PRESETS)

export function neuronsFor(presetId: string, component: number | null): Neuron[] {
  const all = PRESETS[presetId]?.neurons ?? []
  return component === null ? all : all[component] ? [all[component]] : []
}

export const neuronKey = (n: { layer: number; neuron: number }) => `L${n.layer} N${n.neuron}`

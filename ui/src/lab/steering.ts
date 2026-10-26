import { PRESETS, neuronsFor } from "./presets"
import type { CalibrationRow, Snapshot } from "./types"

/** alpha = effective_dose * R_L / ||w||_2 : the constant added to coordinate n of the down_proj input. */
export const alphaFor = (effectiveDose: number, residMedian: number, downNorm: number) => (effectiveDose * residMedian) / downNorm
/** ||delta_r||_2 for one neuron: |alpha| * ||w|| = |effective_dose| * R_L. */
export const writeNormFor = (effectiveDose: number, residMedian: number) => Math.abs(effectiveDose) * residMedian
export const effectiveDose = (intensity: number, presetDose: number) => intensity * presetDose

/** Norm of a sum of write vectors, given their dot products (needs the real W_down columns; not in a run JSON). */
export function sumNorm(vectors: number[][]): number {
  const dim = vectors[0]?.length ?? 0
  const total = new Array<number>(dim).fill(0)
  for (const v of vectors) v.forEach((x, i) => (total[i] += x))
  return Math.hypot(...total)
}

/**
 * Per-neuron calibration recorded in README.md ("Calibration actually used": BF16, MPS, fixed reference passage,
 * positions >= 1). It lets the illustrative mode show real constants; a run's own calibration always wins.
 * tests/test_lab_data.py checks these numbers against the README table.
 */
export const README_CALIBRATION: Record<string, { residMedian: number; downColumnNorm: number }> = {
  "10:6295": { residMedian: 9.242, downColumnNorm: 0.4433 },
  "11:6261": { residMedian: 9.133, downColumnNorm: 0.4335 },
  "12:2920": { residMedian: 9.273, downColumnNorm: 0.4566 },
  "13:7956": { residMedian: 9.747, downColumnNorm: 0.4183 },
  "14:8949": { residMedian: 10.343, downColumnNorm: 0.4647 },
  "15:3920": { residMedian: 10.642, downColumnNorm: 0.4629 },
  "16:8168": { residMedian: 10.954, downColumnNorm: 0.4189 },
  "17:7870": { residMedian: 11.841, downColumnNorm: 0.4118 },
  "18:5796": { residMedian: 13.911, downColumnNorm: 0.4707 },
}

export function readmeCalibration(s: Snapshot): CalibrationRow[] {
  return neuronsFor(s.preset, s.component).flatMap((n) => {
    const c = README_CALIBRATION[`${n.layer}:${n.neuron}`]
    if (!c) return []
    const dose = effectiveDose(s.intensity, n.dose)
    return [{ layer: n.layer, neuron: n.neuron, dose, residMedian: c.residMedian, downColumnNorm: c.downColumnNorm,
      alpha: alphaFor(dose, c.residMedian, c.downColumnNorm), writeNorm: writeNormFor(dose, c.residMedian), source: "README.md calibration table" }]
  })
}

/** Rows for a snapshot using a run's own calibration where it matches, otherwise the recorded README values. */
export function calibrationFor(s: Snapshot, rows: CalibrationRow[]): CalibrationRow[] {
  const own = new Map(rows.map((r) => [`${r.layer}:${r.neuron}`, r]))
  return neuronsFor(s.preset, s.component).flatMap((n) => {
    const hit = own.get(`${n.layer}:${n.neuron}`)
    if (!hit) return readmeCalibration({ ...s, component: s.component }).filter((r) => r.layer === n.layer && r.neuron === n.neuron)
    // a run's calibration is scaled to the run's own intensity; rescale to the requested one
    const dose = effectiveDose(s.intensity, n.dose)
    return [{ ...hit, dose, alpha: alphaFor(dose, hit.residMedian, hit.downColumnNorm), writeNorm: writeNormFor(dose, hit.residMedian) }]
  })
}

export const presetSummary = (id: string) => PRESETS[id]?.neurons.map((n) => `L${n.layer} N${n.neuron}`).join(" · ") ?? ""

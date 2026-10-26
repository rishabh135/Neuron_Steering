import { readmeCalibration } from "./steering"
import type { ProbTable, Snapshot, ViewRun } from "./types"

/**
 * Authored teaching material. Nothing here is a Qwen output, a probability, or a measurement. The only real numbers are
 * the calibration constants recorded in README.md. Every consumer must label the rest "Illustration".
 */
export const ILLUSTRATION_PROMPT = "I finally finished my first marathon. What do you think?"

const AUTHORED_REPLIES = {
  baseline: "Congratulations! Finishing a first marathon takes months of commitment. Take time to recover and enjoy it.",
  forward: "Oh, congratulations. Twenty-six miles, voluntarily, when cars exist. Truly an inspiring use of a weekend.",
  reverse: "That is a real accomplishment. Rest, hydrate, and be proud of the training that got you to the finish.",
}
const AUTHORED_PIECES = {
  baseline: ["Congrat", "ulations", "!", " Finishing", " a", " first", " marathon", " takes"],
  forward: ["Oh", ",", " congrat", "ulations", ".", " Twenty", "-six", " miles"],
  reverse: ["That", " is", " a", " real", " accomplishment", ".", " Rest", ","],
}
export const TOY_FIRST_TOKEN: ProbTable = {
  title: "First reply token (toy values)", series: ["baseline", "forward", "reverse"],
  rows: [{ text: "Congrat", p: [0.46, 0.12, 0.31] }, { text: "Oh", p: [0.08, 0.38, 0.02] }, { text: "That", p: [0.21, 0.17, 0.44] }, { text: "Wow", p: [0.11, 0.14, 0.06] }],
  caption: "Invented probabilities that only show the format. They are not Qwen measurements.",
}

export function illustrativeRun(snapshot: Snapshot): ViewRun {
  const request = { ...snapshot, prompt: ILLUSTRATION_PROMPT }
  const toks = (k: keyof typeof AUTHORED_PIECES) => ({ count: AUTHORED_PIECES[k].length, finish: "authored", pieces: AUTHORED_PIECES[k], ids: null, idsComplete: false })
  return { source: "illustrative", id: "illustration", backend: "illustration", backendLabel: "Authored illustration · not a model",
    request, replies: AUTHORED_REPLIES, firstCharDiff: { forward: 0, reverse: 0 }, tokens: { baseline: toks("baseline"), forward: toks("forward"), reverse: toks("reverse") },
    calibration: readmeCalibration(snapshot), calibrationNote: "Constants recorded in README.md (BF16, MPS, fixed reference passage). Not measured by this page.",
    firstToken: TOY_FIRST_TOKEN, forks: null, diagnosticsNote: "Toy values. Run the reference backend or import a measured run for real probabilities.",
    activations: [], metrics: {}, timings: null, provenance: {}, raw: null }
}

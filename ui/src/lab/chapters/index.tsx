import type { ComponentType } from "react"
import { Chapter1 } from "./ch1"
import { Chapter2 } from "./ch2"
import { Chapter3 } from "./ch3"
import { Chapter4 } from "./ch4"
import { Chapter5 } from "./ch5"
import { Chapter6 } from "./ch6"
import { Chapter7 } from "./ch7"
import { Chapter8 } from "./ch8"

export interface ChapterDef { id: string; title: string; short: string; Component: ComponentType }
export const CHAPTERS: ChapterDef[] = [
  { id: "experiment", title: "Experiment", short: "Experiment", Component: Chapter1 },
  { id: "inside", title: "Inside the model", short: "Inside", Component: Chapter2 },
  { id: "intervention", title: "The intervention", short: "Intervention", Component: Chapter3 },
  { id: "mathematics", title: "The mathematics", short: "Math", Component: Chapter4 },
  { id: "divergence", title: "Token divergence", short: "Divergence", Component: Chapter5 },
  { id: "compare", title: "Compare replies", short: "Compare", Component: Chapter6 },
  { id: "evidence", title: "Evidence and limits", short: "Evidence", Component: Chapter7 },
  { id: "mac", title: "Run on my Mac", short: "Run locally", Component: Chapter8 },
]

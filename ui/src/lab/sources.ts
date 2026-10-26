import sourcesJson from "./generated/sources.json"

export interface SourceRef {
  id: string
  repo: "explorer" | "llama" | "lab" | "transformers"
  file: string
  lines: [number, number]
  shows: string
  snippet: string
  file_sha256: string
  rev: string
  url: string | null
  pinned: boolean
  note?: string
}

export const SOURCES = sourcesJson as unknown as Record<string, SourceRef>
export const source = (id: string): SourceRef => {
  const s = SOURCES[id]
  if (!s) throw new Error(`Unknown source id ${id}; run scripts/build_lab_data.py`)
  return s
}
export const sourceLabel = (s: SourceRef) => `${s.file}:${s.lines[0]}${s.lines[1] !== s.lines[0] ? "–" + s.lines[1] : ""}`

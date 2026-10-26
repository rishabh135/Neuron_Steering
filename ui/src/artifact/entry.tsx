// Entry of the portable artifact. scripts/build_artifact.mjs bundles this file, the shared lab/ modules and the
// compiled Tailwind CSS into artifacts/NeuronSteeringArtifact.tsx. Only `react` may be imported.
import { useCallback, useEffect, useRef, useState } from "react"
import LAB_CSS from "virtual:lab-css"
import { CHAPTERS } from "../lab/chapters"
import { MotionSwitch, ProgressBar, ThemeSwitch } from "../lab/chrome"
import { ArrowLeft, ArrowRight } from "../lab/icons"
import { DEFAULT_KIT } from "../lab/kit"
import { SourceProvider } from "../lab/source-ui"
import { LabProvider, useLab } from "../lab/store"
import { StatusBadge, cx } from "../lab/ui"

function Shell() {
  const lab = useLab()
  const { Button, Tabs } = DEFAULT_KIT
  const [idx, setIdx] = useState(0)
  const top = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  const go = useCallback((i: number) => { moved.current = true; setIdx(Math.max(0, Math.min(CHAPTERS.length - 1, i))) }, [])
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    top.current?.scrollIntoView({ block: "start" })
    requestAnimationFrame(() => top.current?.querySelector<HTMLElement>("[data-chapter-title]")?.focus({ preventScroll: true }))
  }, [idx])
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape" && lab.presentation) lab.setPresentation(false) }
    window.addEventListener("keydown", f)
    return () => window.removeEventListener("keydown", f)
  }, [lab])
  const C = CHAPTERS[idx].Component
  return (
    <div ref={top} className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pt-4 pb-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col"><p className="text-label font-semibold tracking-wide text-muted-foreground">Qwen3.5-4B · activation steering · portable page</p><p className="font-bold" style={{ fontSize: "clamp(1.25rem,1rem+1vw,1.75rem)" }}>One Prompt. Different Paths.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge />
            {!lab.presentation && <><ThemeSwitch /><MotionSwitch /></>}
            <Button variant="outline" size="sm" aria-pressed={lab.presentation} onClick={() => lab.setPresentation(!lab.presentation)}>{lab.presentation ? "Exit presentation" : "Present"}</Button>
          </div>
        </div>
        <Tabs label="Chapters" value={CHAPTERS[idx].id} onChange={(v) => go(CHAPTERS.findIndex((c) => c.id === v))} items={CHAPTERS.map((c, i) => ({ value: c.id, ariaLabel: `Chapter ${i + 1}: ${c.title}`, label: <><span className="mr-1.5 font-mono text-meta text-muted-foreground">{i + 1}</span>{c.short}</> }))} />
        <div className="flex items-center gap-4"><ProgressBar index={idx} total={CHAPTERS.length} /><span className="shrink-0 font-mono text-label text-muted-foreground" aria-live="polite">{idx + 1} / {CHAPTERS.length}</span></div>
      </header>
      <main key={CHAPTERS[idx].id} className="lab-reveal min-w-0" aria-label={`Chapter ${idx + 1} of ${CHAPTERS.length}: ${CHAPTERS[idx].title}`}><C /></main>
      <div className={cx("sticky bottom-0 z-40 -mx-4 border-t border-border bg-background/95 px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8")}>
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => go(idx - 1)} disabled={idx === 0}><ArrowLeft size={18} />Previous</Button>
          <p className="hidden text-center font-mono text-label text-muted-foreground sm:block" aria-hidden>Chapter {idx + 1} of {CHAPTERS.length}</p>
          <Button variant="primary" onClick={() => go(idx + 1)} disabled={idx === CHAPTERS.length - 1}>Next<ArrowRight size={18} /></Button>
        </div>
      </div>
    </div>
  )
}

/** One Prompt. Different Paths. Offline explanation of Qwen3.5-4B neuron steering; import a measured run JSON to see real results. */
export default function NeuronSteeringArtifact() {
  return (
    <LabProvider>
      <style>{LAB_CSS}</style>
      <SourceProvider><Shell /></SourceProvider>
    </LabProvider>
  )
}

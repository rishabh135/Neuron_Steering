import { AnimatePresence, MotionConfig, motion } from "motion/react"
import { ArrowLeft, ArrowRight, Presentation, Search as SearchIcon, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs"
import { CHAPTERS } from "@lab/chapters"
import { MotionSwitch, ProgressBar, ThemeSwitch } from "@lab/chrome"
import { KitProvider } from "@lab/kit"
import { SourceProvider } from "@lab/source-ui"
import { LabProvider, useLab } from "@lab/store"
import { StatusBadge } from "@lab/ui"
import { api } from "./api"
import { APP_KIT } from "./kit"
import { Search } from "./Search"
import { Button } from "@/components/ui/button"

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "") // "" locally, "/neuron_abliteration" on GitHub Pages
const pathFor = (i: number) => `${BASE}/chapter/${CHAPTERS[i].id}`
const indexFromPath = () => {
  const m = location.pathname.slice(BASE.length).match(/^\/chapter\/([a-z]+)\/?$/)
  const i = m ? CHAPTERS.findIndex((c) => c.id === m[1]) : 0
  return i < 0 ? 0 : i
}

function Shell() {
  const lab = useLab()
  const [idx, setIdx] = useState(indexFromPath)
  const [carousel, setCarousel] = useState<CarouselApi>()
  const [search, setSearch] = useState(false)
  const moved = useRef(false)
  const top = useRef<HTMLDivElement>(null)

  const go = useCallback((i: number) => {
    const n = Math.max(0, Math.min(CHAPTERS.length - 1, i))
    moved.current = true
    setIdx(n)
    history.pushState(null, "", pathFor(n))
  }, [])

  useEffect(() => { const f = () => { moved.current = true; setIdx(indexFromPath()) }; addEventListener("popstate", f); return () => removeEventListener("popstate", f) }, [])
  useEffect(() => { carousel?.scrollTo(idx, true) }, [carousel, idx])
  useEffect(() => { document.title = `${CHAPTERS[idx].title} · One Prompt. Different Paths.` }, [idx])
  // After a user-driven change, move focus to the new chapter's heading and the page to its top.
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    top.current?.scrollIntoView({ block: "start" })
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-slot=carousel-item]:not([aria-hidden=true]) [data-chapter-title]")?.focus({ preventScroll: true }))
  }, [idx])
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((s) => !s) } else if (e.key === "Escape" && lab.presentation && !search) lab.setPresentation(false) }
    addEventListener("keydown", f)
    return () => removeEventListener("keydown", f)
  }, [lab, search])

  const pres = lab.presentation
  return (
    <MotionConfig reducedMotion={lab.reducedMotion ? "always" : "never"}>
      <TooltipProvider delayDuration={200}>
        <div ref={top} className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pt-4 pb-24 sm:px-6 lg:px-8" style={{ scrollMarginTop: 0 }}>
          <a href="#panel" className="sr-only focus:not-sr-only focus:rounded-md focus:bg-card focus:p-3">Skip to chapter</a>
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col"><p className="text-label font-semibold tracking-wide text-muted-foreground">Qwen3.5-4B · activation steering</p>{!pres && <p className="font-bold" style={{ fontSize: "clamp(1.25rem,1rem+1vw,1.75rem)" }}>One Prompt. Different Paths.</p>}</div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge />
                {!pres && <>
                  <Button variant="outline" size="sm" onClick={() => setSearch(true)} aria-keyshortcuts="Control+K Meta+K"><SearchIcon size={16} aria-hidden />Search<kbd className="ml-1 hidden rounded border border-border px-1.5 text-meta sm:inline">⌘K</kbd></Button>
                  <ThemeSwitch /><MotionSwitch />
                </>}
                <Button variant="outline" size="sm" aria-pressed={pres} onClick={() => lab.setPresentation(!pres)}>{pres ? <X size={16} aria-hidden /> : <Presentation size={16} aria-hidden />}{pres ? "Exit presentation" : "Present"}</Button>
              </div>
            </div>
            <nav aria-label="Chapters" className="min-w-0">
              <Tabs value={CHAPTERS[idx].id} onValueChange={(v) => go(CHAPTERS.findIndex((c) => c.id === v))} variant="pill">
                <TabsList aria-label="Chapters">
                  {CHAPTERS.map((c, i) => <TabsTrigger key={c.id} value={c.id} aria-label={`Chapter ${i + 1}: ${c.title}`}><span className="mr-1.5 font-mono text-meta text-muted-foreground">{i + 1}</span>{c.short}</TabsTrigger>)}
                </TabsList>
              </Tabs>
            </nav>
            <div className="flex items-center gap-4"><ProgressBar index={idx} total={CHAPTERS.length} /><span className="shrink-0 font-mono text-label text-muted-foreground" aria-live="polite">{idx + 1} / {CHAPTERS.length}</span></div>
          </header>

          <main id="panel" className="min-w-0">
            <Carousel setApi={setCarousel} opts={{ watchDrag: false, duration: 0, align: "start", containScroll: false }} aria-label="Chapters" tabIndex={0} className="min-w-0 rounded-lg focus-visible:outline-none">
              <CarouselContent className="ml-0">
                {CHAPTERS.map((c, i) => (
                  <CarouselItem key={c.id} aria-hidden={i !== idx} inert={i !== idx} className="min-w-0 pl-0" aria-label={`Chapter ${i + 1} of ${CHAPTERS.length}: ${c.title}`}>
                    {i === idx && (
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 / lab.prefs.speed, ease: [0.2, 0.7, 0.2, 1] }}>
                          <c.Component />
                        </motion.div>
                      </AnimatePresence>
                    )}
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </main>

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur">
            <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
              <Button variant="outline" onClick={() => go(idx - 1)} disabled={idx === 0}><ArrowLeft size={18} aria-hidden /><span className="hidden sm:inline">{idx > 0 ? CHAPTERS[idx - 1].title : "Previous"}</span><span className="sm:hidden">Previous</span></Button>
              <p className="hidden text-center font-mono text-label text-muted-foreground sm:block" aria-hidden>Chapter {idx + 1} of {CHAPTERS.length}</p>
              <Button variant="default" onClick={() => go(idx + 1)} disabled={idx === CHAPTERS.length - 1}><span className="hidden sm:inline">{idx < CHAPTERS.length - 1 ? CHAPTERS[idx + 1].title : "Next"}</span><span className="sm:hidden">Next</span><ArrowRight size={18} aria-hidden /></Button>
            </div>
          </div>
        </div>
        <Search open={search} setOpen={setSearch} go={go} />
      </TooltipProvider>
    </MotionConfig>
  )
}

// The static GitHub Pages build (VITE_STATIC) has no API behind it: it behaves like the portable page (illustration + JSON import).
export function App() {
  return (
    <LabProvider api={import.meta.env.VITE_STATIC ? null : api} documentTheme>
      <KitProvider kit={APP_KIT}>
        <SourceProvider><Shell /></SourceProvider>
      </KitProvider>
    </LabProvider>
  )
}

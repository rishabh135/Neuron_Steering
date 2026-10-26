import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { DEFAULT_LIMITS, RunError, parseImport, parseRun, sameSnapshot, type Limits } from "./runs"
import { illustrativeRun, ILLUSTRATION_PROMPT } from "./illustration"
import type { Selection } from "./kit"
import type { Snapshot, ViewRun } from "./types"

export interface ApiStatus {
  backend: string
  busy: boolean
  limits: Limits
  generates: boolean
  components: boolean
  diagnostics: boolean
  model_file: string | null
  ui: string
}
export interface SavedRunRow { run_id: string; created_at: string; backend: string; preset: string; component: number | null; intensity: number; prompt: string }

/** Implemented by the local app (relative /api URLs). The portable artifact passes none. */
export interface LabApi {
  status(signal?: AbortSignal): Promise<ApiStatus>
  compare(snapshot: Snapshot, signal: AbortSignal): Promise<unknown>
  runs?(): Promise<SavedRunRow[]>
  run?(id: string): Promise<unknown>
}
export class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }

export type ThemePref = "system" | "dark" | "light"
export type MotionPref = "system" | "reduce" | "full"
export type Speed = 0.25 | 0.5 | 1 | 2

interface Prefs { theme: ThemePref; motion: MotionPref; speed: Speed; annotations: boolean }
const DEFAULT_PREFS: Prefs = { theme: "system", motion: "system", speed: 1, annotations: true }

const readPrefs = (): Prefs => {
  try {
    const raw = JSON.parse(localStorage.getItem("lab-prefs") ?? "{}")
    return { ...DEFAULT_PREFS, ...(["system", "dark", "light"].includes(raw.theme) ? { theme: raw.theme } : {}),
      ...(["system", "reduce", "full"].includes(raw.motion) ? { motion: raw.motion } : {}),
      ...([0.25, 0.5, 1, 2].includes(raw.speed) ? { speed: raw.speed } : {}), ...(typeof raw.annotations === "boolean" ? { annotations: raw.annotations } : {}) }
  } catch { return DEFAULT_PREFS }
}

export interface Message { kind: "ok" | "error" | "info"; text: string }

export interface LabState {
  controls: Snapshot
  limits: Limits
  setControls(patch: Partial<Snapshot>): void
  resetControls(): void
  api: LabApi | null
  apiStatus: ApiStatus | null
  apiError: string | null
  canRun: boolean
  run: ViewRun // always something to show: the active run or the illustration
  runs: ViewRun[]
  activeKey: string | null
  selectRun(key: string | null): void
  runKey(r: ViewRun): string
  stale: boolean // the shown result was produced with other parameters than the current controls
  pending: { snapshot: Snapshot; startedAt: number } | null
  runComparison(): void
  cancelWait(): void
  liveMessage: Message | null
  importText(text: string): Message
  importMessage: Message | null
  exportJson(): string | null
  savedRuns: SavedRunRow[]
  loadSaved(id: string): void
  prefs: Prefs
  setPrefs(p: Partial<Prefs>): void
  reducedMotion: boolean
  resolvedTheme: "dark" | "light"
  presentation: boolean
  setPresentation(v: boolean): void
  inspect: Selection | null
  setInspect(s: Selection | null): void
}

const Ctx = createContext<LabState | null>(null)
export const useLab = (): LabState => {
  const v = useContext(Ctx)
  if (!v) throw new Error("useLab outside LabProvider")
  return v
}

const mq = (q: string) => (typeof matchMedia === "function" ? matchMedia(q) : null)
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => mq(query)?.matches ?? false)
  useEffect(() => {
    const m = mq(query)
    if (!m) return
    const f = () => setOn(m.matches)
    f()
    m.addEventListener("change", f)
    return () => m.removeEventListener("change", f)
  }, [query])
  return on
}

export const DEFAULT_CONTROLS: Snapshot = { prompt: ILLUSTRATION_PROMPT, preset: "sarcasm", intensity: 0.5, maxNew: 160, component: null }

export function LabProvider({ api = null, children, initialRuns = [], documentTheme = false }: { api?: LabApi | null; children: ReactNode; initialRuns?: ViewRun[]; documentTheme?: boolean }) {
  const [controls, setControlsState] = useState<Snapshot>(DEFAULT_CONTROLS)
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS)
  const [runs, setRuns] = useState<ViewRun[]>(initialRuns)
  const [activeKey, setActiveKey] = useState<string | null>(initialRuns[0] ? "k0" : null)
  const counter = useRef(initialRuns.length)
  const keys = useRef(new WeakMap<ViewRun, string>())
  const [pending, setPending] = useState<LabState["pending"]>(null)
  const [liveMessage, setLiveMessage] = useState<Message | null>(null)
  const [importMessage, setImportMessage] = useState<Message | null>(null)
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [savedRuns, setSavedRuns] = useState<SavedRunRow[]>([])
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs)
  const [presentation, setPresentation] = useState(false)
  const [inspect, setInspect] = useState<Selection | null>(null)
  const abort = useRef<AbortController | null>(null)
  const systemDark = useMedia("(prefers-color-scheme: dark)")
  const systemReduce = useMedia("(prefers-reduced-motion: reduce)")
  initialRuns.forEach((r, i) => { if (!keys.current.has(r)) keys.current.set(r, "k" + i) })

  const resolvedTheme: "dark" | "light" = prefs.theme === "system" ? (systemDark ? "dark" : "light") : prefs.theme
  const reducedMotion = prefs.motion === "reduce" || (prefs.motion === "system" && systemReduce)

  useEffect(() => {
    if (!documentTheme) return
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.dataset.motion = reducedMotion ? "reduced" : "full"
  }, [documentTheme, resolvedTheme, reducedMotion])

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setPrefsState((old) => {
      const next = { ...old, ...p }
      try { localStorage.setItem("lab-prefs", JSON.stringify(next)); localStorage.setItem("lab-theme", next.theme) } catch { /* private window or blocked storage: keep in memory */ }
      return next
    })
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!api) return
    try {
      const s = await api.status()
      setApiStatus(s)
      setLimits(s.limits)
      setApiError(null)
    } catch (e) {
      setApiStatus(null)
      setApiError(e instanceof Error ? e.message : "The local API is not reachable.")
    }
  }, [api])

  useEffect(() => {
    if (!api) return
    void refreshStatus()
    api.runs?.().then(setSavedRuns).catch(() => setSavedRuns([]))
    const t = setInterval(() => void refreshStatus(), 15000)
    return () => clearInterval(t)
  }, [api, refreshStatus])

  const setControls = useCallback((patch: Partial<Snapshot>) => {
    setControlsState((c) => {
      const next = { ...c, ...patch }
      if (patch.preset && patch.preset !== c.preset && patch.component === undefined) next.component = null
      return next
    })
  }, [])
  const resetControls = useCallback(() => setControlsState({ ...DEFAULT_CONTROLS, intensity: limits.intensity_default, maxNew: limits.max_new_default }), [limits])

  const addRun = useCallback((r: ViewRun[]) => {
    const keyed = r.map((x) => { const k = "k" + ++counter.current; keys.current.set(x, k); return x })
    setRuns((old) => [...keyed.slice().reverse(), ...old].slice(0, 40))
    setActiveKey(keys.current.get(keyed[0])!)
    // bring the controls to the shown result so the two agree until the user edits something
    setControlsState(keyed[0].request)
  }, [])

  const runKey = useCallback((r: ViewRun) => keys.current.get(r) ?? "", [])

  const canRun = !!api && !!apiStatus?.generates && !pending

  const runComparison = useCallback(() => {
    if (!api || pending) return
    const snapshot = { ...controls }
    const ctl = new AbortController()
    abort.current = ctl
    setPending({ snapshot, startedAt: Date.now() })
    setLiveMessage(null)
    api.compare(snapshot, ctl.signal)
      .then((raw) => { const run = parseRun(raw, "live", limits); addRun([run]); setLiveMessage({ kind: "ok", text: `Finished in ${run.elapsedSeconds?.toFixed(1) ?? "?"} s. Saved by the server as runs/${run.id}.json.` }); api.runs?.().then(setSavedRuns).catch(() => {}) })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) { setLiveMessage({ kind: "info", text: "Stopped waiting. The server may still be generating; it runs one comparison at a time." }); return }
        const status = e instanceof ApiError ? e.status : 0
        const text = status === 409 ? "Another comparison is still running on the server. It handles one at a time; wait for it to finish, then run again."
          : status === 403 ? "The server refused this request: it only accepts same-origin local requests."
          : e instanceof ApiError ? e.message : e instanceof RunError ? `The server answered, but the result failed validation: ${e.message}` : "Cannot reach the local API. Is `python3 scripts/dev.py` still running?"
        setLiveMessage({ kind: "error", text })
      })
      .finally(() => { setPending(null); abort.current = null; void refreshStatus() })
  }, [api, pending, controls, limits, addRun, refreshStatus])

  const cancelWait = useCallback(() => abort.current?.abort(), [])

  const importText = useCallback((text: string): Message => {
    let msg: Message
    try {
      const { runs: parsed, skipped } = parseImport(text, limits)
      addRun(parsed)
      msg = { kind: "ok", text: `Imported ${parsed.length} run${parsed.length > 1 ? "s" : ""}.${skipped.length ? ` Skipped ${skipped.length}: ${skipped[0]}` : ""}` }
    } catch (e) {
      msg = { kind: "error", text: `${e instanceof RunError ? e.message : "Could not read that file."} The run you were viewing is unchanged.` }
    }
    setImportMessage(msg)
    return msg
  }, [addRun, limits])

  const loadSaved = useCallback((id: string) => {
    if (!api?.run) return
    api.run(id).then((raw) => importText(JSON.stringify(raw))).catch((e) => setImportMessage({ kind: "error", text: e instanceof Error ? e.message : "Could not load that run." }))
  }, [api, importText])

  const active = activeKey ? runs.find((r) => keys.current.get(r) === activeKey) ?? null : null
  const illustration = useMemo(() => illustrativeRun(controls), [controls])
  const run = active ?? illustration
  const stale = !!active && !sameSnapshot(active.request, controls)
  const exportJson = useCallback(() => (active?.raw ? JSON.stringify(active.raw, null, 2) : null), [active])

  const value: LabState = { controls, limits, setControls, resetControls, api, apiStatus, apiError, canRun, run, runs, activeKey, selectRun: setActiveKey, runKey,
    stale, pending, runComparison, cancelWait, liveMessage, importText, importMessage, exportJson, savedRuns, loadSaved, prefs, setPrefs, reducedMotion, resolvedTheme, presentation, setPresentation, inspect, setInspect }
  return (
    <Ctx.Provider value={value}>
      <div className="lab-root min-h-dvh" data-theme={resolvedTheme} data-motion={reducedMotion ? "reduced" : "full"} data-presentation={presentation ? "on" : "off"}
        style={{ ["--lab-speed" as string]: String(1 / prefs.speed), ["--lab-reveal" as string]: `${Math.round(400 / prefs.speed)}ms` }}>
        {children}
      </div>
    </Ctx.Provider>
  )
}

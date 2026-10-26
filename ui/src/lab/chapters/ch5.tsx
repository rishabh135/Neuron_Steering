import { Pause, Play, RotateCcw } from "../icons"
import { useEffect, useMemo, useState } from "react"
import { useKit } from "../kit"
import { firstDifference } from "../runs"
import { useLab } from "../store"
import { ViewImplementation } from "../source-ui"
import { BRANCHES, BRANCH_BY_KEY, fmt, pct, type Branch, type ProbTable } from "../types"
import { BranchTag, Card, Chip, Illustration, Note, cx } from "../ui"
import { ChapterFrame } from "./frame"

export const visible = (s: string) => s.replace(/ /g, "␣").replace(/\n/g, "↵").replace(/\t/g, "⇥") || "∅"

const PATTERN: Record<Branch, string> = {
  baseline: "var(--baseline)",
  forward: "repeating-linear-gradient(45deg, var(--recipe) 0 6px, transparent 6px 10px)",
  reverse: "radial-gradient(circle at 3px 3px, var(--reverse) 2px, transparent 2.5px) 0 0 / 7px 7px",
}

export function ProbBars({ table }: { table: ProbTable }) {
  const max = Math.max(1e-9, ...table.rows.flatMap((r) => r.p.map((x) => (Number.isFinite(x) ? x : 0))))
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table aria-label={table.title}>
          <thead><tr><th>Token</th>{table.series.map((s) => <th key={s}><BranchTag branch={s}>{BRANCH_BY_KEY[s].short}</BranchTag></th>)}</tr></thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>
                <td className="font-mono font-semibold">{visible(r.text)}{r.id !== undefined && <span className="ml-2 text-meta text-muted-foreground">id {r.id}</span>}</td>
                {table.series.map((s, j) => (
                  <td key={s} className="min-w-[120px]">
                    <div className="h-3 rounded-sm bg-secondary" aria-hidden><div className="h-3 rounded-sm transition-[width] duration-300" style={{ width: `${Number.isFinite(r.p[j]) ? Math.max(1, (100 * r.p[j]) / max) : 0}%`, background: PATTERN[s], outline: s === "baseline" ? undefined : `1px solid ${BRANCH_BY_KEY[s].cssVar}` }} /></div>
                    <span className="font-mono text-[14px]">{Number.isFinite(r.p[j]) ? pct(r.p[j]) : "—"}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.kl && table.kl.length > 0 && <p className="font-mono text-[14px]">{table.kl.map((k) => `${k.label} = ${fmt(k.nats, 4)} nats`).join("  ·  ")}</p>}
      <p className="text-label text-muted-foreground">{table.caption}</p>
    </div>
  )
}

function LoopDiagram() {
  const boxes = ["Same prefix", "Hidden states\n(± push)", "Next-token\ndistribution", "Greedy pick\n(argmax)"]
  return (
    <svg viewBox="0 0 880 150" role="img" aria-label="Loop: prefix, hidden states, next-token distribution, choose a token, append it to the prefix" className="h-auto w-full">
      <defs><marker id="loop-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--muted-foreground)" /></marker></defs>
      {boxes.map((b, i) => (
        <g key={i}>
          <rect x={10 + i * 220} y={25} width={190} height={64} rx={12} fill="var(--secondary)" stroke={i === 1 ? "var(--recipe)" : "var(--border)"} strokeWidth={2} strokeDasharray={i === 1 ? "7 4" : undefined} />
          {b.split("\n").map((l, k, a) => <text key={k} x={105 + i * 220} y={a.length === 1 ? 63 : 52 + k * 20} textAnchor="middle" fontSize={16} fontWeight={600} fill="var(--foreground)">{l}</text>)}
          {i < 3 && <path d={`M${202 + i * 220} 57 H${228 + i * 220}`} stroke="var(--muted-foreground)" strokeWidth={2.5} markerEnd="url(#loop-arr)" />}
        </g>
      ))}
      <path d="M765 89 V125 H105 V92" fill="none" stroke="var(--muted-foreground)" strokeWidth={2.5} strokeDasharray="6 5" markerEnd="url(#loop-arr)" />
      <text x={435} y={146} textAnchor="middle" fontSize={15} fill="var(--muted-foreground)">append the chosen token, then repeat: histories now differ</text>
    </svg>
  )
}

export function Chapter5() {
  const lab = useLab()
  const { Slider, Button, Tabs } = useKit()
  const { run, prefs } = lab
  const [view, setView] = useState("prompt")
  const [shown, setShown] = useState(Infinity)
  const [playing, setPlaying] = useState(false)
  const illustrative = run.source === "illustrative"

  const table: ProbTable | null = view === "prompt" ? run.firstToken : (run.forks?.[view as "forward" | "reverse"]?.table ?? null)
  const forkInfo = view !== "prompt" ? run.forks?.[view as "forward" | "reverse"] : null

  const tk = run.tokens
  const idsOk = !!tk && !!tk.baseline.ids && !!tk.forward.ids && !!tk.reverse.ids && tk.baseline.idsComplete && tk.forward.idsComplete && tk.reverse.idsComplete
  const diffIdx = useMemo(() => {
    if (!tk) return null
    const f = (k: "forward" | "reverse") => (idsOk ? firstDifference(tk.baseline.ids!, tk[k].ids!) : firstDifference(tk.baseline.pieces, tk[k].pieces))
    return { forward: f("forward"), reverse: f("reverse") }
  }, [tk, idsOk])
  const maxLen = tk ? Math.max(...BRANCHES.map((b) => tk[b.key].pieces.length)) : 0
  const fk = diffIdx ? [diffIdx.forward, diffIdx.reverse].filter((x): x is number => x !== null) : []
  const start = fk.length ? Math.max(0, Math.min(...fk) - 3) : 0
  const end = Math.min(maxLen, fk.length ? Math.max(...fk) + 9 : 12)
  const total = end - start
  const reveal = Math.min(total, shown)

  useEffect(() => {
    if (!playing) return
    if (reveal >= total) { setPlaying(false); return }
    const t = setTimeout(() => setShown(reveal + 1), 600 / prefs.speed)
    return () => clearTimeout(t)
  }, [playing, reveal, total, prefs.speed])

  const tabs = [{ value: "prompt", label: "Prompt boundary" }, { value: "forward", label: "At the recipe fork" }, { value: "reverse", label: "At the reversed fork" }]
  const forkMissing = view !== "prompt" && !table
  const why = view === "prompt" ? null : !run.forks ? (illustrative ? "Fork distributions come only from a measured reference run." : "This run has no fork diagnostics. They need exact token ids, which only the reference backend records.")
    : forkInfo && forkInfo.firstTokenDifference === null ? "This branch matched baseline token for token, so there is no fork to inspect." : "Fork diagnostics were not recorded for this branch."

  return (
    <ChapterFrame n={5} title="Token divergence" lead={<>
      <p>The model writes one token at a time and feeds each choice back in. A small change in the next-token distribution can flip one greedy choice; every later step then conditions on a different history. That is how one prompt reaches different continuations.</p>
    </>}>
      <Card className="flex flex-col gap-3"><LoopDiagram /><p className="text-label text-muted-foreground">Before the first reply token all three branches share an identical prefix, so their distributions are directly comparable. After the first different token they are not: later distributions belong to different histories. Arrows show order, not signal size.</p></Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3>{table?.title ?? "Next-token probabilities"}</h3>
          {illustrative ? <Illustration>Toy values · not Qwen</Illustration> : <Chip tone="ok">measured · {run.backendLabel}</Chip>}
        </div>
        <Tabs label="Where to compare" value={view} onChange={setView} items={tabs} />
        {table ? <ProbBars table={table} /> : forkMissing ? <Note title="Not available">{why}</Note> : <Note title="Diagnostics unavailable">{run.diagnosticsNote}</Note>}
        {forkInfo?.baselineToken !== undefined && <p className="text-label">After {forkInfo.commonPrefixTokens} shared reply tokens (<span className="font-mono">{JSON.stringify(forkInfo.commonPrefixText)}</span>) baseline chose <span className="font-mono font-semibold">{JSON.stringify(forkInfo.baselineToken)}</span>; this branch chose <span className="font-mono font-semibold">{JSON.stringify(forkInfo.branchToken)}</span>.{forkInfo.singleRowMatches && !forkInfo.singleRowMatches.every(Boolean) ? " Note: a single-row recomputation disagreed with the batched greedy choice here, a near-tie in BF16." : ""}</p>}
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3>Where the paths part</h3>
          {illustrative && <Illustration>Authored tokens · not model output</Illustration>}
        </div>
        {!tk || !diffIdx ? <Note title="No per-token output in this run">This run did not record generated tokens, so no token strip is drawn and no token-level difference is claimed.</Note> : (
          <>
            <p className="text-label text-muted-foreground" role="status">
              {BRANCHES.slice(1).map((b) => {
                const d = diffIdx[b.key as "forward" | "reverse"]
                const cd = run.firstCharDiff[b.key as "forward" | "reverse"]
                return <span key={b.key} className="mr-4 inline-block"><BranchTag branch={b.key}>{b.short}</BranchTag>: {d === null ? "identical to baseline" : idsOk ? `first differing token: #${d} (token ids recorded)` : `first text difference: ${cd === undefined || cd === null ? `piece #${d}` : `character ${cd}`} (token ids not recorded, so this is a text comparison, not a token claim)`}</span>
              })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => { if (reveal >= total) setShown(0); setPlaying((p) => !p) }} aria-pressed={playing}>{playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}{playing ? "Pause" : "Replay tokens"}</Button>
              <Button variant="ghost" onClick={() => { setShown(0); setPlaying(false) }}><RotateCcw size={16} aria-hidden />Clear</Button>
              <Button variant="ghost" onClick={() => { setShown(Infinity); setPlaying(false) }}>Show all</Button>
              <div className="flex min-w-48 flex-1 items-center gap-3"><Slider label="Tokens revealed" value={reveal} min={0} max={total} step={1} onChange={(v) => { setPlaying(false); setShown(v) }} /><span className="font-mono text-label">{reveal}/{total}</span></div>
            </div>
            <p className="text-meta text-muted-foreground">This is a replay of a finished result. The server returns completed JSON, so nothing here is streaming live. Showing token positions {start}–{Math.max(start, end - 1)} of {maxLen}.</p>
            <div className="flex flex-col gap-3">
              {BRANCHES.map((b) => {
                const t = tk[b.key]
                const d = b.key === "baseline" ? null : diffIdx[b.key as "forward" | "reverse"]
                return (
                  <div key={b.key} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
                    <div className="w-44 shrink-0 pt-2"><BranchTag branch={b.key} /></div>
                    <ol className="flex min-w-0 flex-wrap gap-1.5" aria-label={`${b.label} tokens`}>
                      {Array.from({ length: Math.max(0, end - start) }, (_, k) => start + k).map((i, k) => {
                        if (k >= reveal) return null
                        const has = i < t.pieces.length
                        const same = b.key === "baseline" || (has && t.pieces[i] === tk.baseline.pieces[i] && (d === null || i < d))
                        const isFork = d !== null && i === d && b.key !== "baseline"
                        return (
                          <li key={i} className={cx("lab-reveal min-h-9 rounded-md border px-2 py-1 font-mono text-[14px]", !has ? "border-dashed border-border text-muted-foreground" : isFork ? "border-2 text-foreground" : same ? "border-border bg-secondary text-muted-foreground" : "border-border bg-card text-foreground")}
                            style={isFork ? { borderColor: b.cssVar, background: `var(--${b.key === "forward" ? "recipe" : "reverse"}-soft)` } : undefined}>
                            <span className="mr-1 text-[11px] text-muted-foreground">{i}</span>{has ? visible(t.pieces[i]) : t.finish === "length" ? "limit" : "⏹ end"}
                            {isFork && <span className="ml-1 font-sans text-[12px] font-bold">{idsOk ? "← first differing token" : "← first text difference"}</span>}
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      <Note title="Why a fixed seed is not a guarantee">
        The reference backend decodes greedily (argmax), so there is no sampling seed to fix; the llama backend sends temperature 0 and seed 42. Even so, BF16 arithmetic on different devices, batch sizes or backends can break near-ties differently: README records 22 of 238 measured forks where a single-row recomputation disagreed with the batched greedy token by one BF16 step. Treat a result as belonging to its backend, device and batch layout.
      </Note>
      <div className="flex flex-wrap gap-2"><ViewImplementation id="greedy-step" /><ViewImplementation id="next-logprobs" /><ViewImplementation id="lab-compare-reference" /></div>
    </ChapterFrame>
  )
}

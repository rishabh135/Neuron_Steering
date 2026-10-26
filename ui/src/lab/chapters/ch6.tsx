import { useRef, useState } from "react"
import { useKit } from "../kit"
import { neuronsFor } from "../presets"
import { useLab } from "../store"
import { BRANCHES, BRANCH_BY_KEY, fmt, signed, type Branch } from "../types"
import { BranchTag, Card, Chip, CopyButton, Illustration, cx } from "../ui"
import { ChapterFrame } from "./frame"

function commonPrefix(a: string, b: string) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

export function Chapter6() {
  const lab = useLab()
  const { Tabs } = useKit()
  const { run } = lab
  const [sel, setSel] = useState<Branch>("forward")
  const [diff, setDiff] = useState(true)
  const [sync, setSync] = useState(false)
  const refs = useRef<Partial<Record<Branch, HTMLDivElement | null>>>({})
  const syncing = useRef(false)
  const req = run.request
  const ns = neuronsFor(req.preset, req.component)

  const onScroll = (from: Branch) => {
    if (!sync || syncing.current) return
    const src = refs.current[from]
    if (!src) return
    const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight)
    syncing.current = true
    for (const b of BRANCHES) { const el = refs.current[b.key]; if (el && b.key !== from) el.scrollTop = ratio * (el.scrollHeight - el.clientHeight) }
    requestAnimationFrame(() => { syncing.current = false })
  }

  return (
    <ChapterFrame n={6} title="Compare replies" lead={<p>The same prompt, three internal states. Full replies are shown in flowing text so nothing is hidden inside a scroll box. Text after the first difference from baseline is no longer aligned with it, so the marker is a position, not a word-by-word diff.</p>}>
      <Card className="flex flex-col gap-3" aria-label="Comparison context">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3>Prompt (identical in all three)</h3>{run.source === "illustrative" ? <Illustration>Authored replies · not Qwen output</Illustration> : <Chip tone="ok">{run.backendLabel}</Chip>}</div>
        <p className="border-l-4 border-primary pl-4 text-body [overflow-wrap:anywhere]">{req.prompt}</p>
        <p className="text-label text-muted-foreground">Recipe <strong className="text-foreground">{req.preset}</strong> at intensity {req.intensity.toFixed(2)}: {ns.map((n) => `L${n.layer} N${n.neuron} ${signed(n.dose * req.intensity, 2)}`).join(" · ")}. Reversed: every sign flipped. {lab.stale && <Chip tone="note">Earlier configuration</Chip>}</p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex min-h-11 items-center gap-2 text-label"><input type="checkbox" checked={diff} onChange={(e) => setDiff(e.target.checked)} className="size-5 accent-[var(--primary)]" />Mark where each reply departs from baseline</label>
          <label className="hidden min-h-11 items-center gap-2 text-label lg:inline-flex"><input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} className="size-5 accent-[var(--primary)]" />Synchronized scrolling (boxes replies at 70% of the screen height)</label>
        </div>
      </Card>

      <div className="lg:hidden"><Tabs label="Reply to show" value={sel} onChange={(v) => setSel(v as Branch)} items={BRANCHES.map((b) => ({ value: b.key, label: <span className="inline-flex items-center gap-2"><span aria-hidden className="font-mono">{b.symbol}</span>{b.short}</span>, ariaLabel: b.label }))} /></div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        {BRANCHES.map((b) => {
          const text = run.replies[b.key]
          const cut = b.key === "baseline" ? undefined : run.firstCharDiff[b.key as "forward" | "reverse"] ?? commonPrefix(run.replies.baseline, text)
          const same = b.key !== "baseline" && text === run.replies.baseline
          const m = run.metrics[b.key]
          const tok = run.tokens?.[b.key]
          const idx = b.key === "baseline" ? null : cut
          const accent = b.key === "baseline" ? "border-baseline" : b.key === "forward" ? "border-recipe" : "border-reverse"
          return (
            <article key={b.key} aria-label={`${b.label} reply`} className={cx("min-w-0 flex-col gap-4 rounded-lg border-t-4 border-x border-b border-border bg-card p-4 sm:p-6 lg:flex", accent, sel === b.key ? "flex" : "hidden")}>
              <header className="flex flex-wrap items-center justify-between gap-2"><h3><BranchTag branch={b.key} /></h3><CopyButton text={text} label="Copy reply" /></header>
              <p className="font-mono text-meta text-muted-foreground">{b.key === "baseline" ? "no push" : ns.map((n) => `L${n.layer} N${n.neuron} ${signed(b.sign * n.dose * req.intensity, 3)}`).join(" · ")}</p>
              <div ref={(el) => { refs.current[b.key] = el }} onScroll={() => onScroll(b.key)} className={cx(sync && "max-h-[70vh] overflow-auto lg:block")} tabIndex={sync ? 0 : undefined} aria-label={sync ? `${b.label} reply, scrollable` : undefined}>
                {text === "" ? <p className="text-muted-foreground">(empty reply)</p> : (
                  <p className="whitespace-pre-wrap text-body [overflow-wrap:anywhere]">
                    {diff && idx !== null && idx !== undefined && idx > 0 && !same ? (<>
                      <span className="text-muted-foreground">{text.slice(0, idx)}</span>
                      <mark className="mx-1 rounded-sm border border-current bg-transparent px-1 font-sans text-[13px] font-bold text-foreground" aria-label="differs from baseline from here">⟶ differs</mark>
                      {text.slice(idx)}
                    </>) : text}
                  </p>
                )}
              </div>
              {diff && same && <Chip tone="note">Identical to baseline</Chip>}
              {diff && !same && idx === 0 && <Chip tone="note">Differs from baseline from the first character</Chip>}
              <footer className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-meta text-muted-foreground">
                <span>{m ? `${m.words} words · ${m.characters} characters` : `${text.length} characters`}</span>
                {tok && <span>{tok.count} tokens · stopped by {tok.finish}</span>}
                {m?.distinct4 !== null && m?.distinct4 !== undefined && <span>distinct 4-grams {fmt(m.distinct4, 2)}</span>}
              </footer>
            </article>
          )
        })}
      </div>
      <p className="text-label text-muted-foreground">{BRANCH_BY_KEY.forward.label} and {BRANCH_BY_KEY.reverse.label} are steering outcomes, not a verdict on any personality label: tone, correctness and instruction-following need separate, blinded scoring (docs/EVALUATION.md).</p>
    </ChapterFrame>
  )
}

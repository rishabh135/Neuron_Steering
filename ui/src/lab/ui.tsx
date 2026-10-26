import { useId, useState, type ReactNode } from "react"
import { useKit } from "./kit"
import { useLab } from "./store"
import { BRANCH_BY_KEY, type Branch } from "./types"
import { Check, Copy, Download, Upload } from "./icons"

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ")

export function Card({ children, className, as: Tag = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return <Tag className={cx("min-w-0 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-[var(--shadow)] sm:p-6 lg:p-8", className)} {...rest}>{children}</Tag>
}

export const Kicker = ({ children }: { children: ReactNode }) => <p className="text-label font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</p>

/** Branch identity: a symbol and a name; colour is an addition, never the only cue. */
export function BranchTag({ branch, children }: { branch: Branch; children?: ReactNode }) {
  const b = BRANCH_BY_KEY[branch]
  const colour = branch === "baseline" ? "text-baseline" : branch === "forward" ? "text-recipe" : "text-reverse"
  return <span className="inline-flex items-center gap-2 font-semibold"><span aria-hidden className={cx("font-mono text-[0.9em]", colour)}>{b.symbol}</span>{children ?? b.label}</span>
}

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "baseline" | "recipe" | "reverse" | "note" | "ok" | "error"; className?: string }) {
  const tones = { neutral: "border-border text-foreground", baseline: "border-baseline text-foreground bg-baseline-soft", recipe: "border-recipe text-foreground bg-recipe-soft", reverse: "border-reverse text-foreground bg-reverse-soft", note: "border-note text-foreground", ok: "border-ok text-foreground", error: "border-destructive text-foreground" }
  return <span className={cx("inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-0.5 font-mono text-[13px]", tones[tone], className)}>{children}</span>
}

export function Illustration({ children = "Illustration" }: { children?: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-sm border border-dashed border-note px-2 py-0.5 text-meta font-semibold uppercase tracking-wide text-note">⚠ {children}</span>
}

export function Note({ tone = "note", title, children }: { tone?: "note" | "ok" | "error"; title?: string; children: ReactNode }) {
  const c = tone === "note" ? "border-note" : tone === "ok" ? "border-ok" : "border-destructive"
  return <div role={tone === "error" ? "alert" : "note"} className={cx("rounded-md border-l-4 bg-secondary px-4 py-3 text-label", c)}>{title && <p className="font-semibold">{title}</p>}<div className="text-muted-foreground [&_strong]:text-foreground">{children}</div></div>
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const { Button } = useKit()
  const [state, setState] = useState<"idle" | "done" | "fail">("idle")
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setState("done") } catch {
      // clipboard can be blocked in sandboxed previews: fall back to a temporary selection
      try { const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); setState(ok ? "done" : "fail") } catch { setState("fail") }
    }
    setTimeout(() => setState("idle"), 1800)
  }
  return <Button variant="outline" size="sm" onClick={copy} aria-live="polite">{state === "done" ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}{state === "done" ? "Copied" : state === "fail" ? "Select and copy manually" : label}</Button>
}

export function CodeBlock({ code, label, className }: { code: string; label?: string; className?: string }) {
  return (
    <div className={cx("overflow-hidden rounded-md border border-border bg-background", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5"><span className="text-meta text-muted-foreground">{label ?? "shell"}</span><CopyButton text={code} /></div>
      <pre className="overflow-x-auto p-3 font-mono text-[14px] leading-relaxed"><code>{code}</code></pre>
    </div>
  )
}

/** The honest run status shown wherever a result appears. */
export function StatusBadge({ className }: { className?: string }) {
  const { run, stale, pending } = useLab()
  const tone = run.source === "illustrative" ? "note" : run.source === "imported" ? "baseline" : "ok"
  const label = run.source === "illustrative" ? "Illustrative" : run.source === "imported" ? "Imported run" : "Live local run"
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-2", className)}>
      <Chip tone={tone}><span aria-hidden>{run.source === "illustrative" ? "◌" : run.source === "imported" ? "⬒" : "●"}</span>{label}</Chip>
      {pending && <Chip tone="note"><span className="inline-block size-2 animate-pulse rounded-full bg-note" aria-hidden />Waiting for the model</Chip>}
      {stale && <Chip tone="note">Earlier configuration</Chip>}
    </span>
  )
}

export const Prose = ({ children }: { children: ReactNode }) => <div className="prose text-body text-foreground/95">{children}</div>

/** Numeric input that keeps a text draft so typing "0." or "" never fights the controlled value. */
export function NumberField({ id, label, value, min, max, onCommit, hint, suffix }: { id: string; label: string; value: number; min: number; max: number; onCommit(v: number): void; hint?: string; suffix?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)
  const parsed = Number(shown)
  const bad = shown.trim() === "" || !Number.isFinite(parsed) || parsed < min || parsed > max
  const commit = () => {
    if (!bad) onCommit(parsed)
    setDraft(null)
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-label font-semibold">{label}</label>
      <div className="flex items-center gap-2">
        <input id={id} inputMode="decimal" type="text" value={shown} aria-invalid={bad} aria-describedby={`${id}-hint`}
          onChange={(e) => { setDraft(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onCommit(n) }}
          onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setDraft(null) }}
          className={cx("min-h-11 w-28 rounded-md border bg-background px-3 py-2 font-mono text-label", bad ? "border-destructive" : "border-input")} />
        {suffix && <span className="text-label text-muted-foreground">{suffix}</span>}
      </div>
      <p id={`${id}-hint`} className={cx("text-meta", bad ? "text-destructive" : "text-muted-foreground")}>{bad ? `Enter a number from ${min} to ${max}.` : hint ?? `${min} to ${max}`}</p>
    </div>
  )
}

export function downloadText(name: string, text: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    return true
  } catch { return false }
}

/** JSON import (file or pasted) and export. Failed imports never replace the run being viewed. */
export function ImportExport({ compact }: { compact?: boolean }) {
  const lab = useLab()
  const { Button } = useKit()
  const [text, setText] = useState("")
  const [shown, setShown] = useState(false)
  const fileId = useId()
  const json = lab.exportJson()
  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (f.size > 12 * 1024 * 1024) { lab.importText("x".repeat(13 * 1024 * 1024)); return }
    lab.importText(await f.text())
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input id={fileId} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = "" }} />
        <Button variant="outline" onClick={() => document.getElementById(fileId)?.click()}><Upload size={16} aria-hidden />Import run JSON</Button>
        <Button variant="outline" disabled={!json} onClick={() => { if (json) { downloadText(`${lab.run.id}.json`, json); setShown(true) } }}><Download size={16} aria-hidden />Export JSON</Button>
        {json && <CopyButton text={json} label="Copy JSON" />}
      </div>
      {!compact && (
        <details className="rounded-md border border-border px-3">
          <summary className="text-label">Paste JSON instead</summary>
          <div className="flex flex-col gap-2 pb-3">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-label="Run JSON" spellCheck={false} className="w-full rounded-md border border-input bg-background p-3 font-mono text-[13px]" placeholder='{"schema_version":1,"kind":"measured", …}' />
            <div><Button variant="secondary" disabled={!text.trim()} onClick={() => { if (lab.importText(text).kind === "ok") setText("") }}>Load pasted JSON</Button></div>
          </div>
        </details>
      )}
      {shown && json && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${fileId}-json`} className="text-label text-muted-foreground">Some previews block downloads. The same JSON is here to copy:</label>
          <textarea id={`${fileId}-json`} readOnly value={json} rows={6} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-input bg-background p-3 font-mono text-[12px]" />
        </div>
      )}
      {lab.importMessage && <p role={lab.importMessage.kind === "error" ? "alert" : "status"} className={cx("text-label", lab.importMessage.kind === "error" ? "text-destructive" : "text-ok")}>{lab.importMessage.text}</p>}
    </div>
  )
}

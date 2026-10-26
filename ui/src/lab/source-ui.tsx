import { createContext, useContext, useState, type ReactNode } from "react"
import { ExternalLink, FileCode } from "./icons"
import { useKit } from "./kit"
import { source, sourceLabel } from "./sources"
import { CodeBlock, Chip } from "./ui"

const SourceCtx = createContext<(id: string) => void>(() => {})

/** One dialog for every "View implementation" action; focus returns to the button that opened it. */
export function SourceProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null)
  const { Dialog } = useKit()
  const s = id ? source(id) : null
  return (
    <SourceCtx.Provider value={setId}>
      {children}
      <Dialog open={!!s} onOpenChange={(o) => !o && setId(null)} title={s ? sourceLabel(s) : "Source"} description={s?.shows}>
        {s && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Chip tone={s.pinned ? "ok" : "note"}>{s.pinned ? "pinned revision" : "unpinned"}</Chip>
              <Chip>{s.rev.length > 20 ? s.rev.slice(0, 12) : s.rev}</Chip>
              <Chip>sha256 {s.file_sha256.slice(0, 10)}…</Chip>
            </div>
            <p className="text-label text-muted-foreground">
              Verbatim lines {s.lines[0]}–{s.lines[1]} of <code>{s.file}</code>{s.pinned ? " at the revision recorded in docs/SOURCE_AUDIT.json" : ""}. The prose around it on this page is an inferred explanation of this code, not part of it.
            </p>
            <CodeBlock code={s.snippet} label={`${s.file} · L${s.lines[0]}–${s.lines[1]}`} />
            {s.url ? <a className="inline-flex min-h-11 items-center gap-2 text-label" href={s.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden />Open upstream at line {s.lines[0]} (needs network)</a>
              : <p className="text-label text-muted-foreground">{s.note ?? "Local file."} Open <code>{s.file}</code> in this checkout{s.repo === "transformers" ? " (cache/vendor/neuron-explorer/.venv/…/site-packages/)" : ""}.</p>}
          </div>
        )}
      </Dialog>
    </SourceCtx.Provider>
  )
}

export function ViewImplementation({ id, label = "View implementation" }: { id: string; label?: string }) {
  const { Button } = useKit()
  const open = useContext(SourceCtx)
  const s = source(id)
  return <Button variant="outline" size="sm" className="h-auto min-h-11 max-w-full flex-wrap justify-start whitespace-normal py-2 text-left" onClick={() => open(id)} aria-label={`${label}: ${sourceLabel(s)}`}><FileCode size={16} aria-hidden />{label}<span className="break-all font-mono text-meta text-muted-foreground">{sourceLabel(s)}</span></Button>
}

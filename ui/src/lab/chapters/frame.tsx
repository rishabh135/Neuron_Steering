import type { ReactNode } from "react"
import { Kicker, StatusBadge } from "../ui"

/** Common chapter header: number, title, one-sentence purpose, and the honest run status. */
export function ChapterFrame({ n, title, lead, children, status = true }: { n: number; title: string; lead: ReactNode; children: ReactNode; status?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><Kicker>Chapter {n} of 8</Kicker>{status && <StatusBadge />}</div>
        <h2 tabIndex={-1} data-chapter-title className="outline-none">{title}</h2>
        <div className="prose text-body text-muted-foreground">{lead}</div>
      </header>
      {children}
    </div>
  )
}

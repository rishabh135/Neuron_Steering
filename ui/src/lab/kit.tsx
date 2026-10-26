import { createContext, useContext, useEffect, useId, useRef, type ButtonHTMLAttributes, type ComponentType, type KeyboardEvent, type ReactNode } from "react"

/**
 * Interaction primitives the shared chapters need. The portable artifact uses the plain implementations below
 * (native elements, no dependencies). The local app swaps in shadcn/ui, beUI and Motion versions through KitProvider,
 * so both experiences share one set of chapters, tokens and data semantics.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline"
  size?: "md" | "sm" | "icon"
}
export interface SliderProps { value: number; min: number; max: number; step: number; onChange(v: number): void; label: string; disabled?: boolean; id?: string }
export interface TabItem { value: string; label: ReactNode; ariaLabel?: string }
export interface TabsProps { value: string; onChange(v: string): void; items: TabItem[]; label: string; className?: string }
export interface DialogProps { open: boolean; onOpenChange(o: boolean): void; title: string; description?: string; children: ReactNode; side?: boolean }
export interface Selection { layer: number; neuron: number | null }
export interface LayerView3DProps { selected: Selection | null; onSelect(s: Selection | null): void }
export interface Kit {
  /** Optional lazy 3D layer view; only the local app provides it. The 2D map is always complete without it. */
  LayerView3D?: ComponentType<LayerView3DProps>
  Button: ComponentType<ButtonProps>
  Slider: ComponentType<SliderProps>
  Tabs: ComponentType<TabsProps>
  Dialog: ComponentType<DialogProps>
  Tooltip: ComponentType<{ content: ReactNode; children: ReactNode }>
  Number: ComponentType<{ value: number; format?: (n: number) => string }>
}

const btn = {
  base: "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium select-none transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-label",
  primary: "bg-primary text-primary-foreground hover:brightness-110 active:brightness-95",
  secondary: "bg-secondary text-secondary-foreground border border-input hover:bg-accent",
  outline: "border border-input bg-transparent text-foreground hover:bg-accent",
  ghost: "bg-transparent text-foreground hover:bg-accent",
  md: "min-h-11 px-4 py-2", sm: "min-h-11 px-3 py-1.5", icon: "size-11",
}
export function DefaultButton({ variant = "secondary", size = "md", className = "", type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={`${btn.base} ${btn[variant]} ${btn[size]} ${className}`} {...rest} />
}

export function DefaultSlider({ value, min, max, step, onChange, label, disabled, id }: SliderProps) {
  return <input id={id} type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
}

export function DefaultTabs({ value, onChange, items, label, className = "" }: TabsProps) {
  const ids = useId()
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.value === value)
    const k = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "Home" ? "first" : e.key === "End" ? "last" : 0
    if (!k) return
    e.preventDefault()
    const next = k === "first" ? 0 : k === "last" ? items.length - 1 : (i + k + items.length) % items.length
    onChange(items[next].value)
    requestAnimationFrame(() => document.getElementById(`${ids}-${items[next].value}`)?.focus())
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={move} className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((t) => (
        <button key={t.value} id={`${ids}-${t.value}`} role="tab" type="button" aria-selected={t.value === value} aria-label={t.ariaLabel} tabIndex={t.value === value ? 0 : -1} onClick={() => onChange(t.value)}
          className={`min-h-11 rounded-md border px-3 py-2 text-label font-medium transition-colors duration-200 ${t.value === value ? "border-primary bg-recipe-soft text-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** Native <dialog>: modal focus trap, Escape to close, and focus returns to the opener on close. */
export function DefaultDialog({ open, onOpenChange, title, description, children, side }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={() => onOpenChange(false)} onClick={(e) => { if (e.target === ref.current) onOpenChange(false) }}
      className={`m-auto max-h-[88dvh] w-[min(100%-32px,56rem)] overflow-auto rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-[var(--shadow)] backdrop:bg-black/60 ${side ? "ml-auto mr-0 h-dvh max-h-dvh w-[min(100%,34rem)] rounded-none rounded-l-xl" : ""}`}>
      {open && (
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0"><h2 id={titleId} className="text-xl">{title}</h2>{description && <p className="mt-1 text-label text-muted-foreground">{description}</p>}</div>
            <DefaultButton variant="ghost" size="icon" aria-label="Close" onClick={() => onOpenChange(false)}>✕</DefaultButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function DefaultTooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <span className="group relative inline-flex" aria-describedby={id}>
      {children}
      <span id={id} role="tooltip" className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-64 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-label text-popover-foreground opacity-0 shadow-[var(--shadow)] transition-opacity duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">{content}</span>
    </span>
  )
}

export const DefaultNumber = ({ value, format = (n: number) => String(n) }: { value: number; format?: (n: number) => string }) => <span className="tabular-nums">{format(value)}</span>

export const DEFAULT_KIT: Kit = { Button: DefaultButton, Slider: DefaultSlider, Tabs: DefaultTabs, Dialog: DefaultDialog, Tooltip: DefaultTooltip, Number: DefaultNumber }
const KitCtx = createContext<Kit>(DEFAULT_KIT)
export const KitProvider = ({ kit, children }: { kit: Partial<Kit>; children: ReactNode }) => <KitCtx.Provider value={{ ...DEFAULT_KIT, ...kit }}>{children}</KitCtx.Provider>
export const useKit = () => useContext(KitCtx)

import { lazy, Suspense, useEffect, useRef } from "react"
import { Button as ShButton } from "@/components/ui/button"
import { Slider as ShSlider } from "@/components/ui/slider"
import { Tabs as ShTabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog as ShDialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip as ShTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AnimatedNumber } from "@/components/motion/animated-number"
import type { ButtonProps, Kit, LayerView3DProps } from "@lab/kit"

const variants = { primary: "default", secondary: "secondary", ghost: "ghost", outline: "outline" } as const
const sizes = { md: "default", sm: "sm", icon: "icon" } as const

const Button = ({ variant = "secondary", size = "md", ...rest }: ButtonProps) => <ShButton variant={variants[variant]} size={sizes[size]} {...rest} />

const Slider: Kit["Slider"] = ({ value, min, max, step, onChange, label, disabled, id }) => (
  <ShSlider id={id} aria-label={label} value={[value]} min={min} max={max} step={step} disabled={disabled} onValueChange={([v]) => onChange(v)} />
)

const Tabs: Kit["Tabs"] = ({ value, onChange, items, label, className }) => (
  <ShTabs value={value} onValueChange={onChange} className={className}>
    <TabsList aria-label={label} className="h-auto flex-wrap justify-start gap-1 bg-secondary p-1">
      {items.map((t) => <TabsTrigger key={t.value} value={t.value} aria-label={t.ariaLabel} className="min-h-11 px-3 text-label data-[state=active]:bg-recipe-soft data-[state=active]:text-foreground">{t.label}</TabsTrigger>)}
    </TabsList>
    {items.map((t) => <TabsContent key={t.value} value={t.value} className="sr-only" tabIndex={-1} />)}
  </ShTabs>
)

/** Radix only refocuses a <Trigger>; these dialogs open from arbitrary buttons, so remember and restore the opener. */
function useRestoreFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => { if (open && document.activeElement instanceof HTMLElement && !document.activeElement.closest("[role=dialog]")) opener.current = document.activeElement }, [open])
  return (e: Event) => { e.preventDefault(); opener.current?.focus() }
}

const Dialog: Kit["Dialog"] = ({ open, onOpenChange, title, description, children, side }) => {
  const restore = useRestoreFocus(open)
  return side ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" onCloseAutoFocus={restore} className="w-full overflow-y-auto bg-popover p-4 sm:max-w-xl sm:p-6">
        <SheetHeader className="p-0 pr-8"><SheetTitle className="text-xl">{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  ) : (
    <ShDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={restore} className="max-h-[88dvh] overflow-y-auto bg-popover p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader className="pr-8"><DialogTitle className="text-xl">{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {children}
      </DialogContent>
    </ShDialog>
  )
}

const Tooltip: Kit["Tooltip"] = ({ content, children }) => (
  <ShTooltip><TooltipTrigger asChild><span className="inline-flex">{children}</span></TooltipTrigger><TooltipContent className="max-w-64 text-label">{content}</TooltipContent></ShTooltip>
)

const Number: Kit["Number"] = ({ value, format }) => <AnimatedNumber value={value} format={format} duration={0.5} startOnView={false} />

// three.js loads only when the 3D tab is opened; the 2D map never depends on it.
const Lazy3D = lazy(() => import("./LayerView3D"))
const LayerView3D = (p: LayerView3DProps) => <Suspense fallback={<p className="p-6 text-label text-muted-foreground" role="status">Loading the 3D view…</p>}><Lazy3D {...p} /></Suspense>

export const APP_KIT: Partial<Kit> = { Button, Slider, Tabs, Dialog, Tooltip, Number, LayerView3D }

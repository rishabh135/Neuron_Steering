import { useEffect, useState } from "react"
import { BookOpen, Layers, Play, Presentation, Sparkles } from "lucide-react"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { CHAPTERS } from "@lab/chapters"
import { LAYER_KINDS, N_LAYERS, kindShort } from "@lab/model"
import { PRESETS, PRESET_IDS, neuronsFor } from "@lab/presets"
import { useLab } from "@lab/store"
import { signed } from "@lab/types"

/** Command search: chapters, layers, recipe neurons, recipes and a few actions. Opens with Ctrl/Cmd+K. */
export function Search({ open, setOpen, go }: { open: boolean; setOpen(o: boolean): void; go(i: number): void }) {
  const lab = useLab()
  const [q, setQ] = useState("")
  useEffect(() => { if (!open) setQ("") }, [open])
  const run = (f: () => void) => { setOpen(false); setTimeout(f, 0) }
  const ns = neuronsFor(lab.controls.preset, lab.controls.component)
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Jump to a chapter, layer, neuron or recipe">
      <CommandInput placeholder="Search chapters, layers (L15), neurons (3920), recipes…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>Nothing matches “{q}”.</CommandEmpty>
        <CommandGroup heading="Chapters">
          {CHAPTERS.map((c, i) => <CommandItem key={c.id} value={`chapter ${i + 1} ${c.title}`} onSelect={() => run(() => go(i))}><BookOpen />{i + 1} · {c.title}</CommandItem>)}
        </CommandGroup>
        <CommandGroup heading="Recipe neurons">
          {ns.map((n) => <CommandItem key={`${n.layer}-${n.neuron}`} value={`neuron L${n.layer} N${n.neuron} ${n.neuron} layer ${n.layer}`} onSelect={() => run(() => { go(1); lab.setInspect({ layer: n.layer, neuron: n.neuron }) })}><Sparkles />L{n.layer} N{n.neuron} · dose {signed(n.dose)}</CommandItem>)}
        </CommandGroup>
        <CommandGroup heading="Recipes">
          {PRESET_IDS.map((id) => <CommandItem key={id} value={`recipe ${id} ${PRESETS[id].name}`} onSelect={() => run(() => { lab.setControls({ preset: id }); go(0) })}><Sparkles />{PRESETS[id].name}</CommandItem>)}
        </CommandGroup>
        <CommandGroup heading="Layers">
          {Array.from({ length: N_LAYERS }, (_, i) => <CommandItem key={i} value={`layer L${i} ${i} ${LAYER_KINDS[i]}`} onSelect={() => run(() => { go(1); lab.setInspect({ layer: i, neuron: null }) })}><Layers />Layer {i} · {kindShort(LAYER_KINDS[i])} attention</CommandItem>)}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem value="run comparison" disabled={!lab.canRun} onSelect={() => run(() => { go(0); lab.runComparison() })}><Play />Run comparison</CommandItem>
          <CommandItem value="presentation mode" onSelect={() => run(() => lab.setPresentation(!lab.presentation))}><Presentation />Toggle presentation mode</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

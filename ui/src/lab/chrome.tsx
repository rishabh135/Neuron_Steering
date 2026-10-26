import { Monitor, Moon, Sun } from "./icons"
import { useKit } from "./kit"
import { useLab, type MotionPref, type ThemePref } from "./store"
import { cx } from "./ui"

/** Visible light / dark / system preference. Radio semantics: one choice, arrow keys move it. */
export function ThemeSwitch() {
  const { prefs, setPrefs } = useLab()
  const opts: { v: ThemePref; label: string; Icon: typeof Sun }[] = [{ v: "system", label: "System", Icon: Monitor }, { v: "light", label: "Light", Icon: Sun }, { v: "dark", label: "Dark", Icon: Moon }]
  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex rounded-md border border-border bg-card p-0.5">
      {opts.map(({ v, label, Icon }) => (
        <label key={v} className={cx("inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] px-2.5 text-label transition-colors duration-200 focus-within:outline focus-within:outline-[3px] focus-within:outline-ring", prefs.theme === v ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
          <input type="radio" name="theme" value={v} checked={prefs.theme === v} onChange={() => setPrefs({ theme: v })} className="sr-only" />
          <Icon size={16} aria-hidden /><span className="hidden sm:inline">{label}</span><span className="sr-only sm:hidden">{label}</span>
        </label>
      ))}
    </div>
  )
}

export function MotionSwitch() {
  const { setPrefs, reducedMotion } = useLab()
  const { Button } = useKit()
  const next: MotionPref = reducedMotion ? "full" : "reduce"
  return <Button variant="outline" size="sm" aria-pressed={reducedMotion} onClick={() => setPrefs({ motion: next })}>{reducedMotion ? "Reduced motion on" : "Reduce motion"}</Button>
}

export function ProgressBar({ index, total }: { index: number; total: number }) {
  return (
    <div role="progressbar" aria-label="Reading progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-valuetext={`Chapter ${index + 1} of ${total}`} className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((index + 1) / total) * 100}%` }} />
    </div>
  )
}

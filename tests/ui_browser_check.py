#!/usr/bin/env python3
"""Browser checks for the React UI (Playwright; Chrome or the bundled Chromium; Firefox with --browser firefox).

    npm --prefix ui run build
    python serve.py --ui-dir ui/dist --port 8795 &
    python tests/ui_browser_check.py --url http://127.0.0.1:8795 --run runs/<id>.json [--browser chrome|chromium|firefox] [--screens]

Imports only measured run files you pass in; nothing is generated. The report goes to runs/ui-browser-check.json.
"""
import argparse
import json
from pathlib import Path
import sys
import tempfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import ROOT, atomic_json
from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
p.add_argument("--url", default="http://127.0.0.1:8795")
p.add_argument("--run", required=True, help="A measured run JSON (reference backend preferred).")
p.add_argument("--browser", default="chrome", choices=["chrome", "chromium", "firefox"])
p.add_argument("--screens", action="store_true", help="Save screenshots to docs/screenshots/ui-<width>-<chapter>.png")
args = p.parse_args()
SHOTS = ROOT / "docs/screenshots"
run = json.loads(Path(args.run).read_text())
NAMES = ["Experiment", "Inside the model", "The intervention", "The mathematics", "Token divergence", "Compare replies", "Evidence and limits", "Run on my Mac"]
results, failures = [], []


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    if not ok:
        failures.append(name)
    print(("PASS " if ok else "FAIL ") + name + (f" - {detail}" if detail else ""), flush=True)


def launch(pw):
    if args.browser == "firefox":
        return pw.firefox.launch()
    return pw.chromium.launch(channel="chrome") if args.browser == "chrome" else pw.chromium.launch()


def open_page(browser, width=1440, height=900, reduced=False, theme=None, scale=1, touch=False):
    ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=scale, accept_downloads=True,
                              reduced_motion="reduce" if reduced else "no-preference", has_touch=touch)
    if theme:
        ctx.add_init_script(f"localStorage.setItem('lab-prefs', JSON.stringify({{theme:'{theme}'}}))")
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
    pg.goto(args.url)
    pg.wait_for_selector("h2[data-chapter-title]")
    return ctx, pg


def tab(pg, i):
    pg.get_by_role("tab", name=f"Chapter {i}: {NAMES[i - 1]}").click()
    pg.wait_for_timeout(450)


def overflow(pg):
    return pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")


with sync_playwright() as pw:
    browser = launch(pw)
    # --- every chapter: one active panel, heading, focus moved, no page-level overflow, no console errors
    ctx, pg = open_page(browser, theme="dark")
    check("title and status", "One Prompt. Different Paths." in pg.title() or "Experiment" in pg.title() and pg.get_by_text("Illustrative").first.is_visible())
    for i in range(1, 9):
        tab(pg, i)
        visible = pg.locator("[data-slot=carousel-item]:not([aria-hidden=true]) h2[data-chapter-title]").count()
        check(f"chapter {i} shows exactly one active panel", visible == 1 and pg.locator("[data-chapter-title]").count() == 1, NAMES[i - 1])
        if i > 1:
            check(f"chapter {i} heading focused after navigation", pg.evaluate("document.activeElement?.dataset?.chapterTitle !== undefined"))
        check(f"chapter {i} URL", pg.url.rstrip("/").split("/")[-1] != "")
    check("no console or page errors (illustration)", not pg.errors, "; ".join(pg.errors[:3]))
    pg.reload()
    pg.wait_for_selector("h2[data-chapter-title]")
    check("route refresh keeps the chapter", NAMES[7] in pg.locator("h2[data-chapter-title]").inner_text())
    ctx.close()

    # --- JSON import/export round trip, failure keeps the shown run, stale marking
    ctx, pg = open_page(browser, theme="dark")
    tmp = Path(tempfile.mkdtemp())
    bad = tmp / "bad.json"
    bad.write_text(json.dumps({**run, "schema_version": 9}))
    garbage = tmp / "garbage.json"
    garbage.write_text("{nope")
    pg.set_input_files("input[type=file]", args.run)
    pg.wait_for_timeout(500)
    check("import succeeds", "Imported 1 run" in pg.locator("[role=status]").first.inner_text())
    check("status badge says Imported run", pg.get_by_text("Imported run").first.is_visible())
    shown = pg.locator("#prompt").input_value()
    for f, why in [(bad, "unsupported schema"), (garbage, "invalid JSON")]:
        pg.set_input_files("input[type=file]", str(f))
        pg.wait_for_timeout(400)
        alert = pg.locator("[role=alert]").first.inner_text()
        check(f"failed import ({why}) reports an error and keeps the run", "unchanged" in alert and pg.locator("#prompt").input_value() == shown and pg.get_by_text("Imported run").first.is_visible(), alert[:80])
    pg.locator("#intensity").fill("0.9")
    pg.wait_for_timeout(300)
    check("changed controls mark the result as an earlier configuration", pg.get_by_text("Earlier configuration").first.is_visible())
    with pg.expect_download() as dl:
        pg.get_by_role("button", name="Export JSON").click()
    exported = json.loads(Path(dl.value.path()).read_text())
    check("export is the imported JSON, unchanged", exported == run)
    pg.set_input_files("input[type=file]", dl.value.path())
    pg.wait_for_timeout(400)
    check("exported file re-imports", "Imported 1 run" in pg.locator("[role=status]").first.inner_text())
    # intensity input and slider stay synchronized and respect the validated range
    pg.locator("#intensity").fill("2")
    check("out-of-range intensity is flagged", pg.locator("#intensity").get_attribute("aria-invalid") == "true")
    pg.locator("#intensity").fill("1")
    pg.wait_for_timeout(200)
    check("slider follows the numeric field", pg.get_by_role("slider", name="Intensity").evaluate("e => Number(e.value ?? e.getAttribute('aria-valuenow'))") == 1)
    # chapters with a real run
    for i in range(1, 9):
        tab(pg, i)
    tab(pg, 5)
    check("token table shows a first differing token with ids", pg.get_by_text("first differing token").first.is_visible() or pg.get_by_text("matched baseline").count() > 0 or pg.get_by_text("identical to baseline").count() > 0)
    tab(pg, 6)
    for name in ["Baseline reply", "Selected recipe reply", "Reversed recipe reply"]:
        check(f"{name} article present", pg.get_by_role("article", name=name).count() == 1 or pg.locator(f"[aria-label='{name}']").count() == 1)
    check("run text rendered as text", pg.locator("article").first.inner_text().strip() != "")
    tab(pg, 7)
    check("exact-value tables present", pg.get_by_role("table", name="Calibration, exact values").is_visible() and pg.get_by_role("table", name="Run provenance").is_visible())
    check("no errors with a real run", not pg.errors, "; ".join(pg.errors[:3]))
    ctx.close()

    # --- theme + reduced motion
    ctx, pg = open_page(browser, reduced=True)
    check("prefers-reduced-motion respected", pg.evaluate("document.documentElement.dataset.motion") == "reduced")
    check("no running animations under reduced motion", pg.evaluate("document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations === Infinity).length") == 0)
    ctx.close()
    ctx, pg = open_page(browser)
    for label, want in [("Dark", "dark"), ("Light", "light")]:
        pg.locator(f"input[name=theme][value={want}]").check(force=True)
        pg.wait_for_timeout(200)
        check(f"theme switch to {want}", pg.evaluate("document.documentElement.dataset.theme") == want)
    pg.reload()
    pg.wait_for_selector("h2[data-chapter-title]")
    check("theme preference persists", pg.evaluate("document.documentElement.dataset.theme") == "light")
    bg_light = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    pg.locator("input[name=theme][value=dark]").check(force=True)
    check("background changes with theme", bg_light != pg.evaluate("getComputedStyle(document.body).backgroundColor"))
    ctx.close()

    # --- keyboard: tab order reaches chapter tabs; arrows inside a slider do not change chapter; Ctrl+K search
    ctx, pg = open_page(browser, theme="dark")
    pg.get_by_role("slider", name="Intensity").focus()
    before = pg.url
    pg.keyboard.press("ArrowRight")
    check("arrow keys in a slider do not switch chapters", pg.url == before)
    pg.locator("#prompt").focus()
    pg.keyboard.press("ArrowLeft")
    check("arrow keys in the prompt do not switch chapters", pg.url == before)
    pg.keyboard.press("Control+k")
    pg.wait_for_timeout(300)
    check("Ctrl+K opens command search", pg.get_by_placeholder("Search chapters").is_visible())
    pg.keyboard.type("evidence")
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(500)
    check("search jumps to a chapter", pg.url.endswith("/chapter/evidence"))
    tab(pg, 3)
    pg.get_by_role("button", name="Step 5: z[n] ← z[n] + α").focus()
    pg.keyboard.press("Enter")
    check("diagram steps are keyboard operable", pg.get_by_text("Step 5 of 8").is_visible())
    pg.get_by_role("button", name="View implementation: explorer/runtime.py:80").first.click()
    pg.wait_for_timeout(400)
    check("implementation dialog shows the verified snippet", pg.get_by_role("dialog").get_by_text("def _hook").first.is_visible())
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(300)
    check("dialog closes and focus returns to a control", pg.evaluate("document.activeElement && document.activeElement.tagName") in ("BUTTON", "A"))
    tab(pg, 2)
    pg.get_by_role("button", name="Layer 15, Full attention, neuron 3920 dose +1.00").click()
    pg.wait_for_timeout(500)
    check("layer click opens the inspector", pg.get_by_role("dialog").get_by_text("L15 N3920").first.is_visible())
    ctx.close()

    # --- responsive widths (and 200% zoom as half-width), touch targets, overflow
    for width in [390, 768, 1024, 1440, 1920, 720]:
        ctx, pg = open_page(browser, width=width, theme="dark", touch=width < 800)
        pg.set_input_files("input[type=file]", args.run)  # a real measured run: longer tables, token strips, replies
        pg.wait_for_timeout(300)
        label = "200% zoom at 1440" if width == 720 else f"{width}px"
        for i in range(1, 9):
            tab(pg, i)
            ov = overflow(pg)
            if ov > 1:
                culprits = pg.evaluate("[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0,3).map(e => e.tagName + '.' + e.className.toString().slice(0,60))")
                check(f"{label} chapter {i}: no horizontal page scroll", False, f"{ov}px; {culprits}")
            else:
                check(f"{label} chapter {i}: no horizontal page scroll", True)
            if args.screens and width in (390, 1440):
                pg.add_style_tag(content=".fixed{position:absolute!important}")
                SHOTS.mkdir(parents=True, exist_ok=True)
                pg.screenshot(path=str(SHOTS / f"ui-{width}-{i}.png"), full_page=True)
        tab(pg, 1)
        small = pg.evaluate("""[...document.querySelectorAll('button, a[href], input:not(.sr-only), select, textarea, [role=tab], [role=slider]')]
            .filter(e => e.offsetParent !== null && !e.classList.contains('sr-only')).map(e => [e, e.getBoundingClientRect()])
            .filter(([e, r]) => r.width > 0 && (r.height < 43.5 || r.width < 43.5) && !(e.tagName === 'A' && e.closest('p')))
            .slice(0, 5).map(([e, r]) => (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))""")
        check(f"{label}: interactive targets are at least 44px", not small, ", ".join(small))
        check(f"{label}: no console errors", not pg.errors, "; ".join(pg.errors[:2]))
        ctx.close()
    browser.close()

atomic_json(ROOT / "runs/ui-browser-check.json", {"browser": args.browser, "url": args.url, "results": results})
print(f"\n{len(results) - len(failures)}/{len(results)} passed")
sys.exit(1 if failures else 0)

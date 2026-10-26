#!/usr/bin/env python3
"""Browser checks for web/index.html (needs Playwright + installed Chrome; not part of unittest discovery).

    python tests/browser_check.py --url http://127.0.0.1:8793 --run runs/<id>.json [--gguf-run runs/<id>.json]

Serve the page with `python serve.py --port 8793` (illustration mode still lists saved runs). Screenshots go to
docs/screenshots/, the report to runs/browser-check.json.
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
p.add_argument("--url", default="http://127.0.0.1:8793")
p.add_argument("--run", required=True, help="A measured reference run JSON.")
p.add_argument("--gguf-run", help="A measured llama backend run JSON (optional).")
p.add_argument("--no-screenshots", action="store_true")
args = p.parse_args()
SHOTS = ROOT / "docs/screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)
run = json.loads(Path(args.run).read_text())
results, failures = [], []


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    if not ok:
        failures.append(name)
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


def page_for(browser, width, height=900, scale=1, reduced=False):
    ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=scale,
                              reduced_motion="reduce" if reduced else "no-preference", accept_downloads=True)
    pg = ctx.new_page()
    pg.errors = []
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.goto(args.url + "/")
    pg.wait_for_function("document.querySelectorAll('#tabs button').length === 5")
    return pg


def stage_sweep(pg, label, shots=()):
    for i in range(5):
        pg.click(f"#tabs button >> nth={i}")
        pg.wait_for_timeout(250)
        visible = pg.evaluate("[...document.querySelectorAll('.stage')].filter(s => !s.hidden).length")
        overflow = pg.evaluate("document.scrollingElement.scrollWidth - innerWidth")
        clipped = pg.evaluate("""[...document.querySelectorAll('.stage:not([hidden]) .card')]
            .filter(c => c.scrollWidth > c.clientWidth + 1).length""")
        check(f"{label} stage {i + 1}: one panel, no page/card overflow", visible == 1 and overflow <= 0 and clipped == 0,
              f"visible={visible} overflow={overflow}px clipped_cards={clipped}")
        if i + 1 in shots and not args.no_screenshots:
            pg.screenshot(path=str(SHOTS / f"{label}-stage{i + 1}.png"), full_page=True)
    check(f"{label}: boundary buttons", pg.is_disabled("#next") and not pg.is_disabled("#prev"))
    pg.click("#tabs button >> nth=0")
    check(f"{label}: previous disabled on first stage", pg.is_disabled("#prev") and not pg.is_disabled("#next"))


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome")

    # widths, illustration mode then a measured run
    for width in (390, 768, 1440):
        pg = page_for(browser, width)
        check(f"{width}px illustration badge", "Illustration" in pg.inner_text("#badge"))
        stage_sweep(pg, f"illustration-{width}", shots=(1, 4) if width in (390, 1440) else ())
        pg.set_input_files("#import-file", args.run)
        pg.wait_for_function("document.querySelector('#badge').textContent.startsWith('Measured')")
        stage_sweep(pg, f"measured-{width}", shots=(1, 2, 3, 4, 5) if width != 768 else (2, 4))
        check(f"{width}px no console errors", not pg.errors, "; ".join(pg.errors))
        pg.context.close()

    # 200 % zoom of a 1440 px window = 720 CSS px at device scale 2
    pg = page_for(browser, 720, 900, scale=2)
    pg.set_input_files("#import-file", args.run)
    pg.wait_for_timeout(200)
    stage_sweep(pg, "zoom200", shots=(2,))
    pg.context.close()

    pg = page_for(browser, 1440)
    # keyboard: arrows switch stages from the page, never from the slider or text inputs
    pg.focus("#next")
    pg.keyboard.press("ArrowRight")
    check("ArrowRight on a button moves to stage 2", "Stage 2 of 5" in pg.inner_text("#counter"))
    pg.keyboard.press("ArrowLeft")
    before = pg.input_value("#intensity")
    pg.focus("#intensity")
    pg.keyboard.press("ArrowRight")
    check("ArrowRight on the slider changes intensity, not the stage",
          "Stage 1 of 5" in pg.inner_text("#counter") and float(pg.input_value("#intensity")) > float(before),
          f"{before} -> {pg.input_value('#intensity')}")
    pg.click("#tabs button >> nth=3")
    pg.focus("#prompt")
    pg.keyboard.press("ArrowLeft")
    check("ArrowLeft in the prompt textarea does not change stage", "Stage 4 of 5" in pg.inner_text("#counter"))
    pg.click("#tabs button >> nth=0")
    pg.keyboard.press("Tab")  # focus enters the page
    for _ in range(6):
        pg.keyboard.press("Tab")
    outline = pg.evaluate("getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth")
    check("keyboard focus is visibly outlined", outline.startswith("solid") and not outline.endswith(" 0px"), outline)
    pg.focus("#next")
    pg.keyboard.press("Enter")
    check("Enter on Next advances", "Stage 2 of 5" in pg.inner_text("#counter"))

    # mechanism controls: step, play, pause; leaving the stage stops playback
    pg.click("#mech-reset")
    for _ in range(4):
        pg.click("#mech-step")
    check("mechanism steps to 5 of 5", pg.inner_text("#mech-count") == "Step 5 of 5")
    pg.click("#mech-play")
    pg.wait_for_timeout(2200)
    playing = pg.inner_text("#mech-count")
    pg.click("#mech-play")
    paused = pg.inner_text("#mech-count")
    pg.wait_for_timeout(2200)
    check("play advances and pause holds", playing == "Step 2 of 5" and pg.inner_text("#mech-count") == paused,
          f"playing={playing} paused={paused} later={pg.inner_text('#mech-count')}")
    pg.click("#mech-play")
    pg.click("#tabs button >> nth=0")
    check("leaving the stage stops playback", pg.inner_text("#mech-play") == "Play")
    check("no autoplay on load", pg.evaluate("!document.querySelector('#mech-play').textContent.includes('Pause')"))

    # empty states before any run
    pg.click("#tabs button >> nth=1")
    check("activation panel empty state without a run", pg.locator("#act-body .empty").count() == 1)
    pg.click("#tabs button >> nth=2")
    pg.click("[data-dist=forward]")
    check("fork distribution empty state without a run", pg.locator("#dist-bars .empty").count() == 1)
    check("illustration labels present", "Authored illustration" in pg.text_content("#fork-kind")
          and pg.text_content("#dist-kind") == "Toy values")

    # invalid import is an error, not a silent change
    with tempfile.NamedTemporaryFile("w", suffix=".json", dir=ROOT / "cache/tmp", delete=False) as f:
        json.dump({"kind": "authored", "baseline": "x"}, f)
    pg.set_input_files("#import-file", f.name)
    pg.wait_for_timeout(200)
    check("invalid import shows an error", "Import failed" in pg.inner_text("#status")
          and "error" in pg.get_attribute("#status", "class") and "Illustration" in pg.inner_text("#badge"))

    # measured import: every panel switches to measured data
    pg.set_input_files("#import-file", args.run)
    pg.wait_for_timeout(200)
    texts = [pg.inner_text(f"#replies .reply.{k} .text") for k in ("baseline", "forward", "reverse")]
    check("measured replies are the run's text", [t.replace("identical to baseline", "").replace("differs →", "")
                                                  for t in texts] == [run["baseline"], run["forward"], run["reverse"]])
    pg.click("#tabs button >> nth=1")
    check("measured activation chart drawn", pg.locator("#act-body svg circle").count() > 0)
    pg.click("#tabs button >> nth=2")
    pg.click("[data-dist=prompt]")
    check("measured fork and distribution labels", pg.text_content("#fork-kind").startswith("Measured")
          and pg.text_content("#dist-kind").startswith("Measured"))
    pg.click("#fork-play")
    pg.wait_for_timeout(1300)
    rows_mid = pg.locator("#fork-table tbody tr:not(.hidden-row)").count()
    pg.click("#fork-all")
    check("token fork plays row by row", 0 < rows_mid < pg.locator("#fork-table tbody tr").count(), f"{rows_mid} rows mid-play")
    with pg.expect_download() as dl:
        pg.click("#export-btn")
    exported = json.loads(Path(dl.value.path()).read_text())
    check("export returns the identical run JSON", exported == run)

    # bundle import fills the picker; picker loads a run
    with tempfile.NamedTemporaryFile("w", suffix=".json", dir=ROOT / "cache/tmp", delete=False) as f:
        json.dump({"kind": "bundle", "runs": [run, {**run, "run_id": "b" * 32}]}, f)
    pg.set_input_files("#import-file", f.name)
    pg.wait_for_timeout(200)
    check("bundle import lists its runs", pg.locator("#picker option").count() == 3)
    pg.context.close()

    # server-listed runs
    pg = page_for(browser, 1440)
    pg.wait_for_timeout(500)
    pg.click("#tabs button >> nth=3")
    n = pg.locator("#picker option").count()
    if n > 1:
        pg.select_option("#picker", index=1)
        pg.wait_for_function("document.querySelector('#badge').textContent.startsWith('Measured')")
    check("saved-run picker loads a run from /api/runs", n > 1 and "Measured" in pg.inner_text("#badge"), f"{n - 1} runs listed")
    check("live run disabled in illustration mode", pg.is_disabled("#run"))
    pg.context.close()

    # reduced motion: OS setting and the in-page toggle
    pg = page_for(browser, 1440, reduced=True)
    check("OS reduced motion selects reduced mode", pg.get_attribute("html", "data-motion") == "reduced"
          and pg.get_attribute("#motion-btn", "aria-pressed") == "true")
    dur = pg.evaluate("getComputedStyle(document.querySelector('#nl-push')).transitionDuration")
    check("reduced motion removes transitions", dur in ("0s", "0s, 0s"), dur)
    pg.context.close()
    pg = page_for(browser, 1440)
    pg.click("#motion-btn")
    dur = pg.evaluate("getComputedStyle(document.querySelector('#nl-push')).transitionDuration")
    check("in-page toggle reduces motion", pg.get_attribute("html", "data-motion") == "reduced" and dur.startswith("0s"), dur)
    pg.context.close()

    # GGUF run: no invented activations or full distributions
    if args.gguf_run:
        pg = page_for(browser, 1440)
        pg.set_input_files("#import-file", args.gguf_run)
        pg.wait_for_timeout(200)
        pg.click("#tabs button >> nth=1")
        check("GGUF run: activation panel says it cannot observe neurons", "cannot observe" in pg.inner_text("#act-body"))
        pg.click("#tabs button >> nth=2")
        check("GGUF run: top-10 label, no KL", "top-10" in pg.text_content("#dist-kind") and pg.inner_text("#dist-kl") == "")
        if not args.no_screenshots:
            pg.screenshot(path=str(SHOTS / "gguf-1440-stage3.png"), full_page=True)
            pg.click("#tabs button >> nth=3")
            pg.screenshot(path=str(SHOTS / "gguf-1440-stage4.png"), full_page=True)
        check("GGUF run: no console errors", not pg.errors, "; ".join(pg.errors))
        pg.context.close()

    # opened directly from disk: no server, illustration mode
    pg = browser.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto((ROOT / "web/index.html").as_uri())
    pg.wait_for_timeout(300)
    check("file:// open renders without errors", not errs and "Illustration" in pg.inner_text("#badge"), "; ".join(errs))
    browser.close()

atomic_json(ROOT / "runs/browser-check.json", {"url": args.url, "run": args.run, "gguf_run": args.gguf_run,
                                               "passed": len(results) - len(failures), "failed": failures, "results": results})
print(f"\n{len(results) - len(failures)}/{len(results)} checks passed")
sys.exit(1 if failures else 0)

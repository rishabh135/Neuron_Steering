#!/usr/bin/env python3
"""Browser checks for artifacts/dist/neuron-steering.html (built from the pasteable .tsx by scripts/build_artifact.mjs).

    cache/tools-venv/bin/python tests/artifact_browser_check.py --run runs/<id>.json [--browser chrome|firefox]

This proves the generated component works in a local browser. It does not prove the Claude.ai preview accepts it.
"""
import argparse
import json
from pathlib import Path
import re
import sys
import tempfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import ROOT
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--run", required=True)
ap.add_argument("--browser", default="chrome", choices=["chrome", "chromium", "firefox"])
args = ap.parse_args()
failures = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" - {detail}" if detail else ""), flush=True)
    if not ok:
        failures.append(name)


tsx = (ROOT / "artifacts/NeuronSteeringArtifact.tsx").read_text()
imports = set(re.findall(r'^import .*? from "([^"]+)"', tsx, re.M))
check("the pasteable component imports only react", imports == {"react"}, str(imports))
check("exactly one default export", len(re.findall(r"as default", tsx)) == 1)
check("no network API calls in the component (commands in chapter 8 are text only)", not re.search(r"\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource", tsx))
bad = Path(tempfile.mkdtemp()) / "bad.json"
bad.write_text(json.dumps({**json.loads(Path(args.run).read_text()), "schema_version": 3}))
page_url = (ROOT / "artifacts/dist/neuron-steering.html").as_uri()
with sync_playwright() as pw:
    b = pw.firefox.launch() if args.browser == "firefox" else (pw.chromium.launch(channel="chrome") if args.browser == "chrome" else pw.chromium.launch())
    for width in (390, 1440):
        ctx = b.new_context(viewport={"width": width, "height": 900}, accept_downloads=True)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.goto(page_url)
        pg.wait_for_selector("h2[data-chapter-title]")
        check(f"{width}px renders the Illustrative status", pg.get_by_text("Illustrative").first.is_visible())
        for i, name in enumerate(["Experiment", "Inside the model", "The intervention", "The mathematics", "Token divergence", "Compare replies", "Evidence and limits", "Run on my Mac"], 1):
            pg.get_by_role("tab", name=f"Chapter {i}: {name}").click()
            pg.wait_for_timeout(250)
            ok = pg.locator("h2[data-chapter-title]").count() == 1 and name in pg.locator("h2[data-chapter-title]").inner_text()
            ov = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f"{width}px chapter {i} one panel, no horizontal scroll", ok and ov <= 1, f"overflow {ov}")
        pg.get_by_role("tab", name="Chapter 1: Experiment").click()
        pg.set_input_files("input[type=file]", args.run)
        pg.wait_for_timeout(400)
        check(f"{width}px import works", pg.get_by_text("Imported run").first.is_visible())
        pg.set_input_files("input[type=file]", str(bad))
        pg.wait_for_timeout(300)
        check(f"{width}px bad import reports an error and keeps the run", "unchanged" in pg.locator("[role=alert]").first.inner_text() and pg.get_by_text("Imported run").first.is_visible())
        pg.get_by_role("tab", name="Chapter 6: Compare replies").click()
        check(f"{width}px compare shows a reply", pg.get_by_role("article").count() >= 1)
        pg.get_by_role("tab", name="Chapter 2: Inside the model").click()
        pg.get_by_role("tab", name="3D view").click()
        check(f"{width}px 3D tab explains it is local-app only", pg.get_by_text("3D view unavailable here").is_visible())
        check(f"{width}px no console errors", not errors, "; ".join(errors[:2]))
        ctx.close()
    b.close()
print(f"{'FAILED: ' + ', '.join(failures) if failures else 'all passed'}")
sys.exit(1 if failures else 0)

#!/usr/bin/env python3
"""Run a fixed benign prompt battery through the local comparison API."""
import argparse
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import ROOT, atomic_json, presets

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--preset", choices=list(presets()), default="sarcasm")
p.add_argument("--component", type=int, help="Run only this zero-based neuron of the preset, at its listed dose.")
p.add_argument("--doses", default="0,0.25,0.5,1")
p.add_argument("--repeat", type=int, default=2)
p.add_argument("--cases", help="Comma-separated prompt ids from evaluation_prompts.json; default all 12.")
p.add_argument("--tag", help="Index file name under runs/; default derived from the condition.")
p.add_argument("--url", default="http://127.0.0.1:8792")
p.add_argument("--max-new", type=int, default=160)
p.add_argument("--backend-label", help="Name stored with each row and in the index file, e.g. llama-Q8_0.")
args = p.parse_args()
prompts = json.loads((ROOT / "evaluation_prompts.json").read_text())
if args.cases:
    wanted = args.cases.split(",")
    prompts = [item for item in prompts if item["id"] in wanted]
    if len(prompts) != len(wanted):
        p.error("Unknown case id in --cases.")
tag = args.tag or args.preset + ("" if args.component is None else f".c{args.component}")
backend = args.backend_label or json.load(urllib.request.urlopen(args.url + "/api/status", timeout=10))["backend"]
all_runs = []
for item in prompts:
    for intensity in map(float, args.doses.split(",")):
        for repeat in range(args.repeat):
            body = {"prompt": item["prompt"], "preset": args.preset, "intensity": intensity, "max_new": args.max_new}
            if args.component is not None:
                body["component"] = args.component
            req = urllib.request.Request(args.url + "/api/compare", json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=1800) as response:
                    run = json.load(response)
            except urllib.error.HTTPError as e:
                raise SystemExit(f"{item['id']} {intensity}: HTTP {e.code} {e.read().decode()}")
            all_runs.append({"case": item["id"], "category": item["category"], "repeat": repeat,
                             "intensity": intensity, "preset": args.preset, "component": args.component,
                             "backend": backend, "run_id": run["run_id"], "baseline": run["baseline"],
                             "forward": run["forward"], "reverse": run["reverse"]})
            print(item["id"], intensity, repeat, run["run_id"], flush=True)
atomic_json(ROOT / "runs" / f"index-{backend}-{tag}.json", all_runs)
inconsistent = []
for item in prompts:
    rows = [r for r in all_runs if r["case"] == item["id"]]
    if len({r["baseline"] for r in rows}) > 1:
        inconsistent.append(item["id"])
sham_mismatch = [r["case"] for r in all_runs if r["intensity"] == 0 and not r["baseline"] == r["forward"] == r["reverse"]]
print("Baseline text inconsistencies:", inconsistent)
print("Zero-dose branches that differ:", sham_mismatch)
print("Manually score blinded outputs with docs/EVALUATION.md; no personality score is inferred from text difference.")

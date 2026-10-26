#!/usr/bin/env python3
"""Collect saved measured runs into one JSON bundle that web/index.html can import offline (picker included)."""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import ROOT, atomic_json

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--cases", default="positive_a,false_a,format_a", help="prompt ids to include")
p.add_argument("--intensities", default="0,0.5,1")
p.add_argument("--backends", default="reference,llama-Q8_0,llama-Q4_K_M")
p.add_argument("--out", type=Path, default=ROOT / "runs/bundle.json")
args = p.parse_args()
cases, doses, backends = args.cases.split(","), set(map(float, args.intensities.split(","))), args.backends.split(",")
runs, seen = [], set()
for f in sorted((ROOT / "runs").glob("index-*.json")):
    for row in json.loads(f.read_text()):
        if (row["case"] in cases and row["intensity"] in doses and row["backend"] in backends and not row.get("control")
                and row["repeat"] == 0 and row["run_id"] not in seen):
            seen.add(row["run_id"])
            runs.append(json.loads((ROOT / "runs" / (row["run_id"] + ".json")).read_text()))
atomic_json(args.out, {"kind": "bundle", "note": "Measured runs exported from runs/; see each run's provenance.", "runs": runs})
print(f"{len(runs)} runs -> {args.out}")

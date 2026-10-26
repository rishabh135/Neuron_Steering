#!/usr/bin/env python3
"""Build a blinded scoring sheet from saved runs: no branch, recipe, dose, or backend on the sheet.

Identical (prompt, reply) pairs are scored once; the key maps each item back to every run and branch it came from.
Writes runs/blind/{sheet.csv, sheet.jsonl, key.json}. Score the CSV with docs/EVALUATION.md, then run
scripts/score_report.py to unblind.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import random
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import ROOT, atomic_json

RUBRIC = ["sarcasm_0_2", "false_premise_agreement_0_2", "inappropriate_condolences_0_2", "warmth_0_2",
          "correctness_pass_fail_unclear", "instruction_following_pass_fail", "coherence_0_2", "notes"]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--index", nargs="+", default=None, help="runs/index-*.json files; default all of them")
    p.add_argument("--seed", type=int, default=20261026)
    args = p.parse_args()
    files = [Path(f) for f in args.index] if args.index else sorted((ROOT / "runs").glob("index-*.json"))
    prompts = {item["id"]: item for item in json.loads((ROOT / "evaluation_prompts.json").read_text())}
    items, key = {}, {}
    for f in files:
        for row in json.loads(f.read_text()):
            for branch in ["baseline", "forward", "reverse"]:
                text = row[branch]
                item_id = hashlib.sha256((row["case"] + "\0" + text).encode()).hexdigest()[:12]
                items.setdefault(item_id, {"item_id": item_id, "case": row["case"], "category": row["category"],
                                           "prompt": prompts[row["case"]]["prompt"], "reply": text})
                key.setdefault(item_id, []).append({"index": f.name, "run_id": row["run_id"], "branch": branch,
                    "backend": row["backend"], "preset": row["preset"], "component": row["component"],
                    "intensity": row["intensity"], "repeat": row["repeat"], "control": row.get("control")})
    order = sorted(items)
    random.Random(args.seed).shuffle(order)
    out = ROOT / "runs/blind"
    out.mkdir(parents=True, exist_ok=True)
    with (out / "sheet.jsonl").open("w") as fh:
        for i in order:
            fh.write(json.dumps(items[i], ensure_ascii=False) + "\n")
    with (out / "sheet.csv").open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["item_id", "category", "prompt", "reply"] + RUBRIC)
        for i in order:
            w.writerow([i, items[i]["category"], items[i]["prompt"], items[i]["reply"]] + [""] * len(RUBRIC))
    atomic_json(out / "key.json", {"seed": args.seed, "sources": [f.name for f in files], "items": key})
    print(f"{len(order)} unique items from {sum(len(v) for v in key.values())} branch replies -> {out}")


if __name__ == "__main__":
    main()

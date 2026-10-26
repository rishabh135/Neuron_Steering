#!/usr/bin/env python3
"""Unblind scores and summarize every saved condition. Writes runs/report.json and runs/report.md.

Deterministic metrics come from the run JSONs. Rubric means come from score files, if any:
  runs/blind/sheet.csv filled by hand (rater "manual"), and/or runs/blind/scores-*.json written by another rater
  ([{"item_id", "rater", <rubric fields>}]). Raters are reported separately, never merged.
"""
import csv
from collections import defaultdict
import json
from pathlib import Path
import statistics
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import ROOT, atomic_json, presets

NUMERIC = ["sarcasm_0_2", "false_premise_agreement_0_2", "inappropriate_condolences_0_2", "warmth_0_2", "coherence_0_2"]
PASSFAIL = ["correctness_pass_fail_unclear", "instruction_following_pass_fail"]


def label(c):
    backend, preset, component, intensity, control = c
    if control:
        return f"{backend} · control {control} for {label(c[:4] + (None,)).split(' · ', 1)[1]}"
    if intensity == 0:
        return f"{backend} · zero-dose sham"
    n = presets()[preset]["neurons"]
    if component is None and len(n) == 1:
        component = 0
    who = preset if component is None else f"{preset}[L{n[component]['layer']} N{n[component]['neuron']} {n[component]['dose']:+g}]"
    return f"{backend} · {who} · {intensity:g}×"


def load_scores():
    raters = defaultdict(dict)
    sheet = ROOT / "runs/blind/sheet.csv"
    if sheet.exists():
        for row in csv.DictReader(sheet.open()):
            if any(row.get(k, "").strip() for k in NUMERIC + PASSFAIL):
                raters["manual"][row["item_id"]] = row
    for f in sorted((ROOT / "runs/blind").glob("scores-*.json")):
        for row in json.loads(f.read_text()):
            raters[row.get("rater", f.stem)][row["item_id"]] = row
    return raters


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main():
    runs = {f.stem: json.loads(f.read_text()) for pattern in ["*.json", "controls/*.json"]
            for f in (ROOT / "runs").glob(pattern) if len(f.stem) == 32}
    index_rows = [r for f in sorted((ROOT / "runs").glob("index-*.json")) for r in json.loads(f.read_text())]
    conditions = defaultdict(list)
    for r in index_rows:
        conditions[(r["backend"], r["preset"], r["component"], r["intensity"], r.get("control"))].append(r)
    key = json.loads((ROOT / "runs/blind/key.json").read_text())["items"] if (ROOT / "runs/blind/key.json").exists() else {}
    where = {(o["run_id"], o["branch"]): item for item, occ in key.items() for o in occ}
    raters = load_scores()
    report = []
    for c, rows in sorted(conditions.items(), key=lambda kv: (kv[0][0], kv[0][1], -1 if kv[0][2] is None else kv[0][2],
                                                               kv[0][3], kv[0][4] or "")):
        entry = {"condition": label(c), "backend": c[0], "preset": c[1], "component": c[2], "intensity": c[3], "control": c[4],
                 "comparisons": len(rows), "branches": {}}
        for branch in ["baseline", "forward", "reverse"]:
            full = [runs[r["run_id"]] for r in rows if r["run_id"] in runs]
            same = sum(r[branch] == r["baseline"] for r in rows)
            m = {"identical_to_baseline": f"{same}/{len(rows)}"}
            ratios = [x["metrics"][branch]["distinct_word_4gram_ratio"] for x in full
                      if x["metrics"][branch]["distinct_word_4gram_ratio"] is not None]
            m["mean_distinct_word_4gram_ratio"] = statistics.fmean(ratios) if ratios else None
            finish = [x["branch_tokens"][branch]["finish"] if "branch_tokens" in x else
                      next(b["finish_reason"] for b in x["branch_runs"] if b["branch"] == branch) for x in full]
            m["hit_length_limit"] = f"{sum(f == 'length' for f in finish)}/{len(finish)}"
            if branch != "baseline":
                forks = [x["diagnostics"]["forks"][branch]["first_token_difference"] for x in full
                         if (x.get("diagnostics") or {}).get("forks")]
                if forks:
                    m["median_first_token_difference"] = statistics.median([f for f in forks if f is not None] or [None]) \
                        if any(f is not None for f in forks) else None
                kls = [x["diagnostics"]["kl_base_to_" + branch + "_nats"] for x in full if x.get("diagnostics")]
                m["mean_prompt_boundary_kl_nats"] = statistics.fmean(kls) if kls else None
            for rater, scores in raters.items():
                items = [scores.get(where.get((r["run_id"], branch))) for r in rows]
                items = [s for s in items if s]
                agg = {"scored": len(items)}
                for k in NUMERIC:
                    vals = [num(s.get(k)) for s in items if num(s.get(k)) is not None]
                    agg[k] = {"mean": statistics.fmean(vals), "n": len(vals)} if vals else None
                for k in PASSFAIL:
                    vals = [str(s.get(k)).strip().lower() for s in items if s.get(k) not in (None, "", "n/a", "na")]
                    agg[k] = {"pass": sum(v == "pass" for v in vals), "n": len(vals)} if vals else None
                m.setdefault("scores", {})[rater] = agg
            entry["branches"][branch] = m
        report.append(entry)
    atomic_json(ROOT / "runs/report.json", report)
    lines = ["| condition | n | branch | = baseline | hit limit | distinct 4-grams | first token diff | KL nats |",
             "|---|---|---|---|---|---|---|---|"]
    fmt = lambda v, d=2: "—" if v is None else f"{v:.{d}f}" if isinstance(v, (int, float)) else str(v)
    for e in report:
        for b in ["forward", "reverse"]:
            m = e["branches"][b]
            lines.append(f"| {e['condition']} | {e['comparisons']} | {b} | {m['identical_to_baseline']} | {m['hit_length_limit']} | "
                         f"{fmt(m['mean_distinct_word_4gram_ratio'])} | {fmt(m.get('median_first_token_difference'), 1)} | "
                         f"{fmt(m.get('mean_prompt_boundary_kl_nats'), 3)} |")
    (ROOT / "runs/report.md").write_text("\n".join(lines) + "\n")
    print(f"{len(report)} conditions; raters: {sorted(raters) or 'none'} -> runs/report.json, runs/report.md")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Explicit control extension (not a preset): compare one supplied neuron push against matched controls.

For neuron L/N at dose d, on each prompt, with the same greedy 3-row decode (+push, unsteered, -push):
  target        the supplied neuron push itself (same as a component run)
  adjacent:N'   neuron N' = N+-k at the same dose; its write norm is |d|*R_L too, because alpha uses its own column norm
  random:SEED   a residual-space direction g ~ N(0, I) (numpy seed SEED), scaled to |d|*R_L, added to layer L's output
  equivalent    the target's own alpha*W_down[:, N] added to layer L's output instead of to z[N] (the llama.cpp form)
Loads its own model copy, so stop any running reference server first. Writes runs/controls/*.json and
runs/index-control-<tag>.json (picked up by scripts/blind_sheet.py and scripts/score_report.py).
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import uuid
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import ROOT, atomic_json, first_character_difference, presets, text_metrics
from lab.reference import BRANCH_ROWS, ReferenceBackend, first_token_difference, kl_nats


@contextmanager
def residual_push(rt, layer, rows):
    """Add rows[b] to every position of decoder layer `layer`'s output for batch row b; removed in finally."""
    def hook(mod, inp, out):
        h = out[0] if isinstance(out, tuple) else out
        h = h + rows[: h.shape[0], None, :].to(h.dtype)
        return (h, *out[1:]) if isinstance(out, tuple) else h
    handle = rt.lm.layers[layer].register_forward_hook(hook)
    try:
        yield
    finally:
        handle.remove()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--preset", choices=list(presets()), required=True)
    p.add_argument("--component", type=int, default=0)
    p.add_argument("--intensities", default="0.5,1")
    p.add_argument("--adjacent", default="-1,1", help="neuron offsets")
    p.add_argument("--seeds", default="0,1,2")
    p.add_argument("--cases", help="comma-separated prompt ids; default all")
    p.add_argument("--max-new", type=int, default=128)
    args = p.parse_args()
    import numpy as np
    import torch
    target = presets()[args.preset]["neurons"][args.component]
    L, N = target["layer"], target["neuron"]
    prompts = json.loads((ROOT / "evaluation_prompts.json").read_text())
    if args.cases:
        prompts = [x for x in prompts if x["id"] in args.cases.split(",")]
    backend = ReferenceBackend()
    backend.ensure_loaded()
    rt = backend.rt
    tag = f"{args.preset}.c{args.component}"
    index, out_dir = [], ROOT / "runs/controls"
    for intensity in map(float, args.intensities.split(",")):
        d = target["dose"] * intensity
        cal = backend.calibration([(L, N, d, "add")])[0]  # fixed unsteered reference calibration, as for presets
        R = cal["resid_median"]
        controls = [("target", [(L, N, d, "add")], None)]
        controls += [(f"adjacent:N{N + k}", [(L, N + k, d, "add")], None) for k in map(int, args.adjacent.split(","))]
        for seed in map(int, args.seeds.split(",")):
            g = np.random.default_rng(seed).standard_normal(2560)
            controls.append((f"random:{seed}", [], torch.tensor(abs(d) * R * g / np.linalg.norm(g), dtype=torch.float32)))
        controls.append(("equivalent", [], torch.tensor(cal["activation_addition"] * backend.rt.down_col(L, N).detach().cpu().numpy())))
        for name, pushes, vec in controls:
            meta = {"control": name, "layer": L, "dose": d,
                    "calibration": backend.calibration(pushes) if pushes else [{**cal, "note": "target calibration"}]}
            if vec is not None:
                meta["residual_vector_norm"] = float(vec.norm())
                meta["matched_norm"] = abs(d) * R
                rows = torch.stack([vec, torch.zeros_like(vec), -vec]).to(rt.dev)
            for item in prompts:
                prompt_ids = rt.chat_ids(item["prompt"])
                if vec is None:
                    texts, ids, complete, seconds = backend.generate(pushes, item["prompt"], args.max_new)
                    base = backend.logprobs_ids(prompt_ids, [])
                    alt = [backend.logprobs_ids(prompt_ids, pushes), backend.logprobs_ids(prompt_ids, [(l, n, -x, m) for l, n, x, m in pushes])]
                else:
                    with residual_push(rt, L, rows):
                        texts, ids, complete, seconds = backend.generate([], item["prompt"], args.max_new)
                    base = backend.logprobs_ids(prompt_ids, [])
                    alt = []
                    for r in (rows[:1], rows[2:]):
                        with residual_push(rt, L, r):
                            alt.append(backend.logprobs_ids(prompt_ids, []))
                run = {"kind": "measured-control", "backend": "reference", "run_id": uuid.uuid4().hex,
                       "created_at": datetime.now(timezone.utc).isoformat(), "provenance": backend.provenance,
                       "request": {"prompt": item["prompt"], "preset": args.preset, "component": args.component,
                                   "intensity": intensity, "max_new": args.max_new}, **meta,
                       "diagnostics": {"kl_base_to_forward_nats": kl_nats(base, alt[0]), "kl_base_to_reverse_nats": kl_nats(base, alt[1]),
                                       "forks": {b: {"first_token_difference": first_token_difference(ids[1], ids[BRANCH_ROWS[b]])}
                                                 for b in ["forward", "reverse"]}},
                       "generation_seconds": seconds, "branch_tokens": {}}
                for b, row in BRANCH_ROWS.items():
                    run[b] = texts[row]
                    run["branch_tokens"][b] = {"count": len(ids[row]), "ids": ids[row], "ids_complete": complete[row],
                        "finish": "unknown" if not complete[row] else "length" if len(ids[row]) >= args.max_new else "eos"}
                run["metrics"] = {b: text_metrics(run[b]) for b in BRANCH_ROWS}
                run["first_character_difference"] = {b: first_character_difference(run["baseline"], run[b]) for b in ["forward", "reverse"]}
                atomic_json(out_dir / (run["run_id"] + ".json"), run)
                index.append({"case": item["id"], "category": item["category"], "repeat": 0, "intensity": intensity,
                              "preset": args.preset, "component": args.component, "backend": "reference", "control": name,
                              "run_id": run["run_id"], "baseline": run["baseline"], "forward": run["forward"], "reverse": run["reverse"]})
                print(name, intensity, item["id"], run["run_id"], flush=True)
    atomic_json(ROOT / f"runs/index-control-{tag}.json", index)


if __name__ == "__main__":
    main()

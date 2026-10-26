#!/usr/bin/env python3
"""Regenerate ui/src/lab/generated/{model-facts,sources}.json from the inspected sources.

    python3 scripts/build_lab_data.py [--cache-root PATH] [--check]

Line numbers are found by searching the vendored upstream files for literal anchors, never typed by hand. A missing
anchor or a changed pin stops the script, so a stale reference cannot be generated. --check compares the output with
the committed files instead of writing them (used by tests/test_lab_data.py when the vendor sources are present).
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import EXPLORER_SHA, LLAMA_SHA, MODEL_ID, ROOT  # noqa: E402

OUT = ROOT / "ui/src/lab/generated"
EXPLORER_URL = f"https://github.com/lyramakesmusic/neuron-explorer/blob/{EXPLORER_SHA}/"
LLAMA_URL = f"https://github.com/ggml-org/llama.cpp/blob/{LLAMA_SHA}/"

# id -> (repo, file, first-line anchor, last-line anchor (inclusive; None = first line only), what it shows)
# Anchors are searched from the first match of the start anchor onward.
SOURCES = [
    ("hook-register", "explorer", "explorer/runtime.py", "layer.mlp.down_proj.register_forward_pre_hook(self._hook(i))", None,
     "A forward pre-hook sits on every layer's down_proj."),
    ("hook-add", "explorer", "explorer/runtime.py", "    def _hook(self, i):", "        return hook",
     "The hook receives the down_proj input (the gated activation z) and adds the dose to coordinate n."),
    ("push-unit", "explorer", "explorer/runtime.py", "    def _push_entry(self, layer, n, dose, mode, rows):", "        return (layer, n, mode, torch.tensor(vals, device=self.dev))",
     "alpha = row_sign * dose * R_L / ||W_down[:, n]||, with row signs (+1, 0, -1)."),
    ("resid-median", "explorer", "explorer/runtime.py", "    def layer_resid_p50(self, layer):", "        return v",
     "R_L: median residual norm of one fixed, unsteered reference passage."),
    ("resid-skip-first", "explorer", "explorer/runtime.py", "    def _resid_hook(self, i):", "        return hook",
     "The calibration measurement keeps positions >= 1 (h[0, 1:]); position 0 is still in the forward pass."),
    ("reference-text", "explorer", "explorer/runtime.py", "REFERENCE_TEXT = (", None,
     "The fixed calibration passage."),
    ("down-column", "explorer", "explorer/runtime.py", "    def down_col(self, layer, n):", "        return self.lm.layers[layer].mlp.down_proj.weight[:, n].float()",
     "w = W_down[L][:, n], the neuron's output direction."),
    ("chat-template", "explorer", "explorer/runtime.py", "    def messages_ids(self, messages):", "        return list(enc[",
     "One user turn, generation prompt added, thinking disabled."),
    ("steer-rows", "explorer", "explorer/runtime.py", "    def steer_multi(self, pushes, rows_messages, max_new=200, cancel=None):", "            push = [self._push_entry(layer, n, dose, mode, (1, 0, -1))",
     "Three batch rows: +dose, unsteered, -dose, from one call."),
    ("greedy-step", "explorer", "explorer/runtime.py", "                        nxt = out.logits[:, -1].argmax(-1)", None,
     "Greedy decoding: the next token is the argmax of the logits."),
    ("next-logprobs", "explorer", "explorer/runtime.py", "    def next_logprobs(self, text, chat=True, prefix=\"\", pushes=None, heads=None):", "        return base, run(push, list(heads) if heads else None)",
     "Next-token log-probabilities on an identical prompt, with and without the push."),
    ("read-activation", "explorer", "explorer/runtime.py", "    def read(self, layer, n, text, chat=True, pushes=None, heads=None):", "        return {\"units\": units}",
     "Reads z[n] at the down_proj pre-hook, before that hook adds anything."),
    ("lab-pushes", "lab", "lab/core.py", "def pushes_for(request):", "    return [(p[\"layer\"]",
     "Signed preset dose times intensity; intensity 1.00 is the exact preset."),
    ("lab-validate", "lab", "lab/core.py", "def validate_request(body):", "    return request",
     "The validated request: preset, intensity range, max_new, optional component."),
    ("lab-calibration", "lab", "lab/reference.py", "    def calibration(self, pushes):", "        return rows",
     "Calibrates before any hook is active and records R_L, ||w||, alpha and the write norm."),
    ("lab-compare-reference", "lab", "lab/reference.py", "    def compare(self, request):", "        return result",
     "The reference comparison: generation, first-token diagnostics, forks, activation reads."),
    ("lab-llama-command", "lab", "lab/llama_backend.py", "            scale = sign * request[\"intensity\"]", "                            \"--control-vector-layer-range\", \"1\", \"31\"]",
     "The llama backend scales the exported vector by sign x intensity, layers 1 to 31."),
    ("lab-server-compare", "lab", "serve.py", "    def compare(self, body):", "            return result",
     "The API handler: validate, run one backend, save the run JSON."),
    ("llama-cvec-call", "llama", "src/models/qwen35.cpp", "        cur = ggml_add(ctx0, cur, ffn_residual);", "        cb(cur, \"l_out\", il);",
     "llama.cpp adds the control vector after the FFN residual addition of layer il."),
    ("llama-cvec-apply", "llama", "src/llama-adapter.cpp", "ggml_tensor * llama_adapter_cvec::apply_to(", "    return cur;",
     "A direction is added to the layer output with ggml_add."),
    ("llama-cvec-layer-start", "llama", "common/common.cpp", "        if (params.control_vector_layer_start <= 0) params.control_vector_layer_start = 1;", None,
     "The default start layer is 1; layer 0 is never steered."),
    ("llama-cvec-parse", "llama", "common/common.cpp", "        if (dotpos != std::string::npos && name.substr(0, dotpos) == \"direction\") {", "            COM_ERR(\"invalid (zero) direction tensor layer index in %s\\n\", load_info.fname.c_str());",
     "direction.L maps to layer L (zero-based); direction.0 is rejected."),
    ("hf-decoder-layer", "transformers", "models/qwen3_5/modeling_qwen3_5.py", "class Qwen3_5DecoderLayer(GradientCheckpointingLayer):", "        return hidden_states",
     "Per layer: RMSNorm, token mixer (full or linear attention), residual, RMSNorm, MLP, residual."),
    ("hf-mlp", "transformers", "models/qwen3_5/modeling_qwen3_5.py", "class Qwen3_5MLP(nn.Module):", "        return down_proj",
     "MLP: down_proj(act_fn(gate_proj(x)) * up_proj(x)). The activation z is the input of down_proj."),
]


def find_block(lines, start, end):
    """1-based inclusive (first, last) line numbers of the first `start` match through the next `end` match.
    Anchors are matched as stripped substrings so indentation in this table cannot cause a miss."""
    for i, line in enumerate(lines):
        if start.strip() in line:
            break
    else:
        raise SystemExit(f"anchor not found: {start!r}")
    if end is None:
        return i + 1, i + 1
    for j in range(i + 1, len(lines)):
        if end.strip() in lines[j]:
            return i + 1, j + 1
    raise SystemExit(f"end anchor not found after {start!r}: {end!r}")


def build(cache_root):
    vendor = cache_root / "vendor"
    roots = {"explorer": vendor / "neuron-explorer", "llama": vendor / "llama.cpp", "lab": ROOT}
    env = vendor / "neuron-explorer/.venv/lib/python3.12/site-packages/transformers"
    roots["transformers"] = env
    import subprocess
    for key, sha in [("explorer", EXPLORER_SHA), ("llama", LLAMA_SHA)]:
        head = subprocess.check_output(["git", "-C", str(roots[key]), "rev-parse", "HEAD"], text=True).strip()
        if head != sha:
            raise SystemExit(f"{key} checkout is {head}, but the project pins {sha}; refusing to generate references.")
    sources = {}
    for sid, repo, rel, start, end, shows in SOURCES:
        path = roots[repo] / rel
        if not path.is_file():
            raise SystemExit(f"missing source file {path}")
        text = path.read_text()
        lines = text.splitlines()
        a, b = find_block(lines, start, end)
        b = min(b, a + 39)
        entry = {"id": sid, "repo": repo, "file": rel if repo != "transformers" else "transformers/" + rel,
                 "lines": [a, b], "shows": shows, "snippet": "\n".join(lines[a - 1:b]),
                 "file_sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        if repo == "explorer":
            entry.update(rev=EXPLORER_SHA, url=f"{EXPLORER_URL}{rel}#L{a}-L{b}", pinned=True)
        elif repo == "llama":
            entry.update(rev=LLAMA_SHA, url=f"{LLAMA_URL}{rel}#L{a}-L{b}", pinned=True)
        elif repo == "lab":
            entry.update(rev="this repository", url=None, pinned=False, note="Line numbers are for the working tree; run this script again after editing.")
        else:
            entry.update(rev="transformers 5.20.1 (installed in the pinned uv environment)", url=None, pinned=False,
                         note="From the installed package; no GitHub revision was pinned for it.")
        sources[sid] = entry
    return sources


def model_facts(cache_root):
    lock = json.loads((cache_root / "models/sources.lock.json").read_text())
    snap = Path(lock["snapshot_path"])
    if not snap.exists():  # lock written on another checkout; rebuild the path from this cache root
        snap = cache_root / "huggingface/hub/models--Qwen--Qwen3.5-4B/snapshots" / lock["revision"]
    cfg_path = snap / "config.json"
    cfg = json.loads(cfg_path.read_text())
    t = cfg.get("text_config", cfg)
    kinds = t["layer_types"]
    assert len(kinds) == t["num_hidden_layers"] == 32
    return {"model_id": MODEL_ID, "revision": lock["revision"], "config_sha256": hashlib.sha256(cfg_path.read_bytes()).hexdigest(),
            "architectures": cfg.get("architectures"), "model_type": t["model_type"],
            "num_hidden_layers": t["num_hidden_layers"], "hidden_size": t["hidden_size"],
            "intermediate_size": t["intermediate_size"], "hidden_act": t["hidden_act"],
            "full_attention_interval": t["full_attention_interval"], "layer_types": kinds,
            "num_attention_heads": t["num_attention_heads"], "num_key_value_heads": t["num_key_value_heads"],
            "head_dim": t["head_dim"], "linear_num_key_heads": t["linear_num_key_heads"],
            "linear_num_value_heads": t["linear_num_value_heads"], "linear_key_head_dim": t["linear_key_head_dim"],
            "linear_value_head_dim": t["linear_value_head_dim"], "vocab_size": t["vocab_size"],
            "rms_norm_eps": t["rms_norm_eps"], "dtype": t["dtype"],
            "note": "Derived from the pinned snapshot's config.json; layer indices are zero-based."}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cache-root", type=Path, default=ROOT / "cache")
    p.add_argument("--check", action="store_true")
    args = p.parse_args()
    outputs = {"model-facts.json": model_facts(args.cache_root), "sources.json": build(args.cache_root)}
    OUT.mkdir(parents=True, exist_ok=True)
    stale = []
    for name, value in outputs.items():
        text = json.dumps(value, indent=1, ensure_ascii=False) + "\n"
        target = OUT / name
        if args.check:
            if not target.exists() or target.read_text() != text:
                stale.append(name)
        else:
            target.write_text(text)
            print(f"wrote {target.relative_to(ROOT)}")
    if stale:
        raise SystemExit("stale generated files: " + ", ".join(stale))


if __name__ == "__main__":
    main()

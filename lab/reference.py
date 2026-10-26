"""Thin adapter to the pinned upstream Runtime; no upstream source is copied."""
import hashlib
import importlib.util
import json
import math
import os
import platform
import subprocess
import time
from pathlib import Path
from .core import ROOT, MODELS, VENDOR, MODEL_ID, EXPLORER_SHA, file_sha, pushes_for

BRANCH_ROWS = {"forward": 0, "baseline": 1, "reverse": 2}  # upstream steer_multi rows: +dose, unsteered, -dose


class TokenRecorder:
    """Stands in for the runtime tokenizer during steer_multi and remembers the exact ids of the last decode call.
    steer_multi decodes row r's full id list right before yielding (r, delta), so the consumer can attribute it."""

    def __init__(self, tok):
        self.tok, self.last = tok, None

    def decode(self, ids, *args, **kwargs):
        self.last = list(ids)
        return self.tok.decode(ids, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self.tok, name)


def first_token_difference(a, b):
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return i
    return min(len(a), len(b)) if len(a) != len(b) else None


def kl_nats(p_log, q_log):
    """KL(p || q) over the full vocabulary from two log-probability tensors."""
    return float((p_log.exp() * (p_log - q_log)).sum())


class ReferenceBackend:
    name = "reference"

    def __init__(self, explorer_root=None):
        self.root = Path(explorer_root or VENDOR / "neuron-explorer").resolve()
        self.rt = None
        self.provenance = None
        self.load_seconds = None

    def ensure_loaded(self):
        if self.rt is not None:
            return
        source = self.root / "explorer/runtime.py"
        if not source.exists():
            raise RuntimeError("Run scripts/setup_reference.py first.")
        sha = subprocess.check_output(["git", "-C", str(self.root), "rev-parse", "HEAD"], text=True).strip()
        if sha != EXPLORER_SHA:
            raise RuntimeError("Explorer commit differs from the audited commit; use the setup script.")
        dirty = subprocess.check_output(["git", "-C", str(self.root), "status", "--porcelain", "--", "explorer/runtime.py"], text=True)
        if dirty.strip():
            raise RuntimeError("Upstream runtime.py has local changes. Review them before changing this guard.")
        lockfile = MODELS / "sources.lock.json"
        if not lockfile.exists():
            raise RuntimeError("Model snapshot lock missing. Run scripts/setup_reference.py.")
        lock = json.loads(lockfile.read_text())
        model_path = Path(lock["snapshot_path"])
        if not model_path.exists():
            raise RuntimeError("Snapshot path no longer exists. Rerun setup_reference.py.")
        os.environ["EXPLORER_MODEL"] = str(model_path)
        os.environ.pop("EXPLORER_NO_MODEL", None)
        started = time.monotonic()
        spec = importlib.util.spec_from_file_location("qwen_lab_upstream_runtime", source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        rt = module.Runtime(str(ROOT / "calibration_stats"))
        rt.ensure_loaded()
        if rt.dev != "mps":
            print(f"WARNING: upstream Runtime selected {rt.dev!r}, not MPS. Do not report this as an MPS run.", flush=True)
        cfg = rt.model.config.get_text_config()
        if (cfg.num_hidden_layers, cfg.hidden_size, cfg.intermediate_size) != (32, 2560, 9216):
            raise RuntimeError("This adapter requires the exact Qwen3.5-4B architecture.")
        self.load_seconds = time.monotonic() - started
        self.rt, self.torch = rt, module.torch
        self.provenance = {"model_id": MODEL_ID, "model_revision": lock["revision"],
            "model_class": type(rt.model).__name__,
            "snapshot_path": str(model_path), "explorer_commit": sha,
            "runtime_sha256": file_sha(source), "device": str(rt.dev),
            "dtype": str(rt.model.dtype), "python": platform.python_version(), "machine": platform.machine(),
            "torch": module.torch.__version__, "transformers": __import__("transformers").__version__,
            "chat_template_sha256": hashlib.sha256(str(rt.tok.chat_template).encode()).hexdigest(),
            "thinking": False, "sampling": "greedy argmax", "seed": None,
            "prompt_settings": {"messages": "one user turn, no system prompt", "add_generation_prompt": True,
                                "enable_thinking": False, "batch": "3 identical rows (forward, baseline, reverse)"},
            "intervention": "add at down_proj input on every prefill/decode position",
            "calibration": "upstream stats if present; otherwise REFERENCE_TEXT, raw tokenization, positions >= 1; unsteered and fixed",
            "calibration_text_sha256": hashlib.sha256(module.REFERENCE_TEXT.encode()).hexdigest(),
            "model_load_seconds": self.load_seconds}

    def calibration(self, pushes):
        self.ensure_loaded()
        rows = []
        with self.rt.lock:  # serialize with every other runtime user; calibration must see no active hooks
            if self.rt._push is not None or self.rt._heads is not None:
                raise RuntimeError("A steering hook is active; refusing to calibrate on a steered model.")
            for layer, neuron, dose, _ in pushes:
                r = float(self.rt.layer_resid_p50(layer))
                norm = float(self.rt.down_col(layer, neuron).detach().norm())
                if not math.isfinite(norm) or norm <= 1e-12 or not math.isfinite(r) or r <= 0:
                    raise RuntimeError("Invalid down-projection column norm or residual median.")
                stats = ROOT / "calibration_stats" / f"q35-4b_L{layer}.npz"
                rows.append({"layer": layer, "neuron": neuron, "dose": dose, "resid_median": r,
                             "calibration_source": ("stats:" + file_sha(stats)) if stats.exists() else "REFERENCE_TEXT",
                             "down_column_norm": norm, "activation_addition": dose * r / norm,
                             "individual_write_norm": abs(dose) * r})
        return rows

    def logprobs_ids(self, ids, pushes):
        """next_logprobs for an exact token-id prefix (upstream only accepts text, which can re-tokenize differently).
        Mirrors Runtime.next_logprobs: one row, no cache, the runtime's own hook, state restored in finally."""
        rt, torch = self.rt, self.torch
        push = [rt._push_entry(l, n, d, m, (1,)) for l, n, d, m in pushes] or None
        with rt.lock:
            rt._push, rt._heads = push, None
            try:
                with torch.inference_mode():
                    out = rt.model(input_ids=torch.tensor([ids], device=rt.dev), use_cache=False, logits_to_keep=1)
            finally:
                rt._push = rt._heads = None
        return torch.log_softmax(out.logits[0, -1].float(), -1).cpu()

    def generate(self, pushes, prompt, max_new):
        """Upstream steer_multi (rows: +pushes, unsteered, -pushes) with the exact generated token ids recorded."""
        texts, ids = ["", "", ""], [[], [], []]
        recorder = TokenRecorder(self.rt.tok)
        started = time.monotonic()
        self.rt.tok = recorder
        try:
            for row, delta in self.rt.steer_multi(pushes, [[{"role": "user", "content": prompt}]] * 3, max_new):
                if row is not None:
                    texts[row] += delta
                    ids[row] = recorder.last
        finally:
            self.rt.tok = recorder.tok
        # steer_multi stops a row at <|im_end|> (not decoded) or after max_new tokens; a trailing partial UTF-8 piece
        # is never yielded, so check that the recorded ids reproduce the streamed text.
        complete = [self.rt.tok.decode(i, skip_special_tokens=True) == t for i, t in zip(ids, texts)]
        return texts, ids, complete, time.monotonic() - started

    def token_rows(self, distributions, k=5, limit=12):
        ids = set(t for lp in distributions for t in lp.topk(k).indices.tolist())
        ids = sorted(ids, key=lambda t: max(float(lp[t].exp()) for lp in distributions), reverse=True)[:limit]
        return [{"id": t, "text": self.rt.tok.decode([t]), "p": [float(lp[t].exp()) for lp in distributions]} for t in ids]

    def compare(self, request):
        loading = self.rt is None
        self.ensure_loaded()
        pushes = pushes_for(request)
        reverse_pushes = [(l, n, -d, m) for l, n, d, m in pushes]
        calibration = self.calibration(pushes)  # always calibrate before enabling any steering
        timings = {"model_load_seconds_this_request": self.load_seconds if loading else 0.0}
        texts, ids, complete, timings["generation_seconds"] = self.generate(pushes, request["prompt"], request["max_new"])
        tok = self.rt.tok
        prompt_ids = self.rt.chat_ids(request["prompt"])
        eos = tok.convert_tokens_to_ids("<|im_end|>")
        at = lambda seq, k: seq[k] if k < len(seq) else eos  # a row shorter than max_new stopped with <|im_end|>

        started = time.monotonic()
        base, forward = self.rt.next_logprobs(request["prompt"], pushes=pushes)
        _, reverse = self.rt.next_logprobs(request["prompt"], pushes=reverse_pushes)
        # Probabilities use the exact same prompt prefix, before any reply token diverges.
        diagnostics = {"scope": "first reply token; identical full prompt prefix",
                       "tokens": self.token_rows([base, forward, reverse]),
                       "kl_base_to_forward_nats": kl_nats(base, forward),
                       "kl_base_to_reverse_nats": kl_nats(base, reverse)}
        # The fork: the first generated position where a branch's greedy token differs from baseline. Both
        # distributions there are measured on the identical teacher-forced prefix prompt + common tokens.
        forks = {}
        for name, alt_pushes in [("forward", pushes), ("reverse", reverse_pushes)]:
            alt = ids[BRANCH_ROWS[name]]
            k = first_token_difference(ids[1], alt)
            fork = {"first_token_difference": k}
            if k is not None and all(complete):
                prefix = prompt_ids + ids[1][:k]
                lp_base, lp_alt = self.logprobs_ids(prefix, []), self.logprobs_ids(prefix, alt_pushes)
                fork.update({"common_prefix_tokens": k,
                             "common_prefix_text": tok.decode(ids[1][:k], skip_special_tokens=True),
                             "baseline_token": tok.decode([at(ids[1], k)]), "branch_token": tok.decode([at(alt, k)]),
                             "tokens": self.token_rows([lp_base, lp_alt]),
                             "kl_base_to_branch_nats": kl_nats(lp_base, lp_alt),
                             "single_row_argmax_matches_batch": [int(lp_base.argmax()) == at(ids[1], k),
                                                                 int(lp_alt.argmax()) == at(alt, k)]})
            forks[name] = fork
        diagnostics["forks"] = forks
        timings["diagnostics_seconds"] = time.monotonic() - started

        # Measured activations at aligned prompt positions. Runtime.read captures z[n] at the down_proj pre-hook
        # BEFORE that hook adds anything: upstream-layer pushes are already in it, the neuron's own push is not.
        started = time.monotonic()
        activations = []
        for (layer, neuron, _, _), cal in zip(pushes, calibration):
            reads = {name: self.rt.read(layer, neuron, request["prompt"], chat=True, pushes=p)["units"]
                     for name, p in [("baseline", None), ("forward", pushes), ("reverse", reverse_pushes)]}
            activations.append({"layer": layer, "neuron": neuron, "capture": "down_proj pre-hook read, before this "
                                "hook's own addition; upstream pushes included", "added_by_hook_forward": cal["activation_addition"],
                                "added_by_hook_reverse": -cal["activation_addition"],
                                "units": [{"text": b["text"], "baseline": b["act"], "forward_pre_hook": f["act"],
                                           "reverse_pre_hook": r["act"]}
                                          for b, f, r in zip(reads["baseline"], reads["forward"], reads["reverse"])]})
        timings["activation_read_seconds"] = time.monotonic() - started

        result = {"kind": "measured", "backend": self.name, "calibration": calibration, "provenance": self.provenance,
                  "diagnostics": diagnostics, "activations": activations, "timings": timings,
                  "prompt_tokens": len(prompt_ids),
                  "prompt_ids_sha256": hashlib.sha256(json.dumps(prompt_ids).encode()).hexdigest(),
                  "finish": "per branch in branch_tokens"}
        result["branch_tokens"] = {}
        for name, row in BRANCH_ROWS.items():
            result[name] = texts[row]
            result["branch_tokens"][name] = {"count": len(ids[row]), "ids_complete": complete[row],
                                             "finish": "unknown" if not complete[row] else
                                                       "length" if len(ids[row]) >= request["max_new"] else "eos",
                                             "pieces": [tok.decode([t]) for t in ids[row]], "ids": ids[row]}
        return result

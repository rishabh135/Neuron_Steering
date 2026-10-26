# Qwen Neuron Lab

A reproducible local investigation of a set of user-supplied neuron recipes for **Qwen/Qwen3.5-4B**: does adding a constant to a few named MLP neurons change how the model answers the same prompt, and does that change survive a port to quantized llama.cpp models?

> **Not abliteration.** Despite the repository name, this project does *activation steering*: a constant is added to chosen MLP activations at inference time. No weights are edited and no direction is projected out. Every recipe name (sarcasm, sycophancy, "evil", ...) is the supplier's hypothesis, not a finding.

Each comparison runs one identical user prompt three ways, with greedy decoding and thinking disabled:

| Branch | What changes |
| --- | --- |
| Baseline | nothing (hooks installed, zero added) |
| Recipe | each listed signed dose × intensity added to its neuron |
| Reverse | the same recipe with every sign flipped |

## Status (26 October 2026)

**Verified on an M4 Pro MacBook Pro (48 GB, macOS 26.7.1):**

- **Source audit.** neuron-explorer `f79b2196` adds the dose at the `down_proj` forward pre-hook on every prefill and decode position (`Runtime.steer_multi`, rows +dose / 0 / −dose), calibrates on a fixed reference passage excluding only position 0's measurement (`layer_resid_p50`), decodes greedily with `enable_thinking=False`. llama.cpp `d854d98` applies `build_cvec` right after the FFN residual addition in `src/models/qwen35.cpp`; `common_control_vector_load` maps `direction.L` to zero-based layer L and rejects `direction.0`. The explorer pin is no longer reachable from upstream `main` (history was rewritten); it is still fetched by SHA, and its `runtime.py`/`server.py` are byte-identical to upstream `31aae16`.
- **Environment.** Upstream `uv.lock` unchanged: Python 3.12.15 (arm64), torch 2.14.1, transformers 5.20.1; MPS available, BF16 matmul OK, `Qwen3_5ForConditionalGeneration` present. Model `Qwen/Qwen3.5-4B@851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`, safetensors sha256-verified. Runs on `mps`, `torch.bfloat16`.
- **Zero-dose sham.** 24/24 comparisons (12 prompts × 2 repeats): all three branches token-identical, baselines identical across repeats, KL = 0.
- **Speed (BF16, MPS).** Model load 10–14 s; generation ~15.7 decode steps/s for the 3-row batch.
- **Vectors.** 7 float32 control-vector files, `direction.1..31`, shape (2560,); unselected layers exactly zero; each layer's norm equals |dose|·R_L (relative error ≤ 1.1e-7).
- **llama.cpp.** Built with Metal; `-ngl 99` offloads 33/33 layers to MTL0. Q8_0 (`unsloth/Qwen3.5-4B-GGUF@e87f1764`, 4.48 GB) and Q4_K_M (2.74 GB) sha256-verified. Plain unsteered Q8_0 chat: 44.8 tok/s, same 24 prompt tokens as the reference template, reply first differs from BF16 at character 42, so quantized output is not assumed token-identical.
- **Numerics caveat.** In the first 146 steered runs, in 22 of 238 measured forks a single-row teacher-forced argmax disagreed with the batched greedy token; in every case the two candidate logits differ by exactly one BF16 step (0.125) or tie. Greedy BF16 decoding can therefore depend on batch size near ties.

**In progress:** the full BF16 battery (9 neurons alone at 0.25/0.5/1.0, then the three multi-neuron recipes, 12 prompts each), adjacent-neuron and norm-matched random-direction controls, the Q8_0 and Q4_K_M batteries, and blinded scoring. An evidence table of which supplied claims reproduced will be added here when scoring is complete; nothing is claimed before that.

### Calibration actually used

Fixed unsteered calibration on upstream's reference passage (raw tokenization, positions ≥ 1). α is the constant added to the activation; the residual write has norm |dose|·R_L.

| Neuron | Supplied doses | R_L (median residual norm) | ‖W_down[:, n]‖ | α per unit dose = R_L/‖w‖ |
|---|---|---|---|---|
| L10 N6295 | +1 (condolences), +0.4 (mixed) | 9.242 | 0.4433 | 20.85 |
| L11 N6261 | +0.4 (chill_friend) | 9.133 | 0.4335 | 21.07 |
| L12 N2920 | −1 (sycophancy_a), −0.5 (mixed) | 9.273 | 0.4566 | 20.31 |
| L13 N7956 | −1 (evil_pair) | 9.747 | 0.4183 | 23.30 |
| L14 N8949 | +1 (evil_pair) | 10.343 | 0.4647 | 22.26 |
| L15 N3920 | +1 (sarcasm), +0.6 (mixed) | 10.642 | 0.4629 | 22.99 |
| L16 N8168 | −1 (sycophancy_b), −0.3 (mixed) | 10.954 | 0.4189 | 26.15 |
| L17 N7870 | −0.4 (chill_friend) | 11.841 | 0.4118 | 28.75 |
| L18 N5796 | +0.6 (mixed) | 13.911 | 0.4707 | 29.56 |

For scale, the measured pre-hook activation of L15 N3920 at the last prompt token of one prompt was 0.061; the dose-1 push adds 22.99.

## Quick start (no model needed)

```bash
python3 serve.py              # illustration mode, standard library only
open http://127.0.0.1:8792    # or open web/index.html directly from disk
```

`web/index.html` is a single offline file (no CDNs, system fonts) with five stages: the experiment, the MLP mechanism, the token fork, the three replies, and provenance. Panels say "Measured" only when they show a real run; otherwise they are labelled toy or authored illustration. Import a run JSON, or a bundle from `scripts/make_bundle.py`, to present real results offline.

## Reproduce on an Apple Silicon Mac

Everything downloaded, cached, built or exported goes under `./cache`, and measured runs under `./runs`; both are git-ignored. `source env.sh` points every tool's cache and `TMPDIR` there, and every Python entry point does the same on import (`lab/core.py`).

Prerequisites: Xcode command line tools, [`uv`](https://docs.astral.sh/uv/), and a Python with `huggingface_hub` for the setup scripts.

```bash
source env.sh

# 1. Sources and models (pinned explorer, pinned llama.cpp, revision-locked weights, sha256-checked GGUFs)
python3 scripts/setup_reference.py                                   # ~9.3 GB BF16 snapshot
PATH="$(uvx --from cmake python -c 'import cmake;print(cmake.CMAKE_BIN_DIR)'):$PATH" \
  python3 scripts/setup_llama.py --quant Q8_0                        # Metal build + 4.48 GB GGUF
python3 scripts/setup_llama.py --quant Q4_K_M --skip-build           # 2.74 GB GGUF

# 2. The upstream locked environment, plus gguf from the pinned llama.cpp
(cd cache/vendor/neuron-explorer && UV_PYTHON_PREFERENCE=only-managed uv sync --locked --python 3.12)
PY=cache/vendor/neuron-explorer/.venv/bin/python
uv pip install --python $PY ./cache/vendor/llama.cpp/gguf-py
$PY scripts/doctor.py                                                # arm64, MPS, BF16, Qwen3_5 class

# 3. Reference backend: the literal neuron hook, BF16 on MPS
$PY serve.py --backend reference                                     # http://127.0.0.1:8792

# 4. llama.cpp port: export once (the exporter loads BF16, writes vectors, exits), then serve a GGUF
$PY scripts/export_vectors.py --all && $PY scripts/verify_vectors.py
$PY serve.py --backend llama --gguf cache/models/gguf/Qwen3.5-4B-Q8_0.gguf --port 8794
```

`brew install cmake` also works; the `uvx` form keeps cmake inside `./cache`. A later plain `uv sync` removes the added `gguf`; use `uv sync --locked --inexact`. The exact environment used is in `docs/environment/reference-freeze.txt`.

The llama backend starts a fresh `llama-server` (port 8081) for each branch, one at a time, so no KV or recurrent state is shared. Plain chat without steering, to check the model first:

```bash
cache/vendor/llama.cpp/build/bin/llama-server -m cache/models/gguf/Qwen3.5-4B-Q4_K_M.gguf \
  --host 127.0.0.1 --port 8080 -ngl 99 -c 4096 --parallel 1 --jinja --reasoning off
```

### Experiments, blinding, report

```bash
scripts/run_battery.sh 128                                  # sham, 9 neurons x {0.25,0.5,1}, mixtures (reference)
$PY scripts/run_controls.py --preset sarcasm                # adjacent / random / residual-equivalent controls
URL=http://127.0.0.1:8794 BACKEND_LABEL=llama-Q8_0 scripts/run_battery.sh 128 sham presets
python3 scripts/blind_sheet.py                              # runs/blind/sheet.csv; key kept in key.json
python3 scripts/score_report.py                             # runs/report.json, runs/report.md
$PY -m unittest discover -s tests -v                        # 32 tests
cache/tools-venv/bin/python tests/browser_check.py --run runs/<run_id>.json   # Playwright + Chrome
```

## How the intervention works

For neuron n in layer L with dose d:

```
alpha = d * R_L / ||W_down[:, n]||     R_L: median L2 norm of the unsteered residual leaving layer L
z[n] <- z[n] + alpha                    at the down_proj input, every prompt and decode position
=> residual write  alpha * W_down[:, n],  norm |d| * R_L
```

A negative dose subtracts a constant; it is not ablation. Because `W_down` is linear, the same write can be added to the layer output, which is where llama.cpp applies control vectors. The exported vectors use BF16 columns and BF16 calibration, so on a quantized GGUF they are a residual-vector **port**, not a measurement of that model's neurons. See `docs/INVESTIGATION.md` for the derivation and `docs/WORKFLOW.md` for diagrams.

## Repository map

| Path | Purpose |
| --- | --- |
| `web/index.html` | Offline five-stage page; JSON/bundle import and export |
| `serve.py` | Standard-library server: `/api/compare`, `/api/status`, `/api/runs`; local origin only |
| `lab/reference.py` | Adapter around upstream `Runtime.steer_multi`: calibration, exact token ids, fork distributions, activation reads |
| `lab/llama_backend.py` | Three fresh `llama-server` processes per comparison; top-10 first-token log-probabilities |
| `lab/core.py` | Validation, presets, cache redirection |
| `presets.json` | Supplied recipes with exact signs and zero-based indices (authoritative) |
| `scripts/` | Setup, export/verify vectors, battery, controls, blinding, report, bundle |
| `tests/` | Unit and integration tests; `browser_check.py` for the page |
| `docs/` | Method (`INVESTIGATION.md`), diagrams, rubric (`EVALUATION.md`), rater protocol, validation record |

## Licensing and sources

MIT for this project's own code and documentation. Upstream sources and model weights are not redistributed: [neuron-explorer](https://github.com/lyramakesmusic/neuron-explorer) (no license file found in the audited tree), [llama.cpp](https://github.com/ggml-org/llama.cpp), [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B), [unsloth/Qwen3.5-4B-GGUF](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF).

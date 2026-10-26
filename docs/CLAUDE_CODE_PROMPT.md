# Claude Code implementation and investigation prompt

You are working in this repository on my Apple M4 Pro MacBook Pro with 48 GB unified memory. Complete a reproducible local Qwen3.5-4B neuron-steering investigation and improve the existing animation. Read README.md, CLAUDE.md, docs/INVESTIGATION.md, docs/WORKFLOW.md, and docs/VALIDATION.md first.

## Goal and boundaries

Show how an identical user prompt changes under three conditions: no intervention, a selected signed recipe, and reversal of every sign. Use the actual model for measured outputs. This is activation steering, not automatically abliteration or proof of a personality change. Do not replace the internal intervention with a system-prompt persona.

Use the existing Python server and single HTML frontend unless evidence justifies a change. Keep the project local and model files outside git. Preserve the original artifact for offline use and JSON import. Do not publish a service or upload runs automatically.

## Source verification

Inspect the pinned neuron-explorer commit f79b2196e29aacbad89684938baac8d97b172fd1, especially explorer/runtime.py and explorer/server.py. Confirm Runtime.steer_multi, down_proj pre-hooks, layer_resid_p50, next_logprobs, greedy decoding, and enable_thinking=False before changing the wrapper.

Inspect the pinned llama.cpp commit d854d98bae598388ecea1ed84396587e5edc326d, especially src/models/qwen35.cpp, src/llama-adapter.cpp, and common/common.cpp. Confirm build_cvec occurs after the MLP residual addition. Confirm direction.L maps to zero-based model layer L and that layer 0 is excluded. Do not shift layer numbers by one. If a source pin must change, explain the compatibility difference and add a targeted test.

The model must be Qwen/Qwen3.5-4B, the post-trained checkpoint. Do not substitute Qwen3-4B, Qwen3.5-4B-Base, another size, or a fine-tune while retaining these neuron IDs. Preserve the full model revision in the generated lock.

## Reproduce the supplied recipes

Treat presets.json as authoritative. Intensity 1.00 means the exact supplied doses:
- L14 N8949 +1 and L13 N7956 -1.
- Sarcasm hypothesis: L15 N3920 +1.
- Sycophancy hypotheses: L12 N2920 -1 or L16 N8168 -1.
- Condolences hypothesis: L10 N6295 +1.
- Chill friend hypothesis: L11 N6261 +0.4 and L17 N7870 -0.4.
- Mixture: L18 N5796 +0.6, L15 N3920 +0.6, L12 N2920 -0.5, L10 N6295 +0.4, L16 N8168 -0.3.

First run a zero-dose sham, then individual components at intensities 0.25, 0.5, and 1.0. Run mixtures later. Reverse all signs for the reverse branch. A negative dose is additive subtraction, not multiplication or clamping.

## Preserve the intervention

For each selected neuron, compute alpha = dose * R_L / norm(W_down[:,n]), using a fixed unsteered reference calibration. Add alpha to the gated activation immediately before down_proj at all input positions, including prefill and every decode input. R_L is the median L2 residual norm leaving the decoder layer on calibration positions >= 1. Do not delete the first input token; keep it in the forward pass and exclude only its measurement.

Calibrate before enabling steering. Record the calibration source, text hash, median, column norm, alpha, model revision, dtype, device, and prompt settings. Preserve weight tensors. Restore all active hook state in finally blocks and serialize access to shared runtime state.

For llama.cpp, export the per-layer sum of dose * R_L * column / column_norm as float32 direction tensors. Include zero directions for unselected supported layers. The exporter bakes intensity 1.0; the server applies the UI intensity exactly once. Reject non-additive modes and layer 0. Label the result a BF16-derived residual-vector port on the quantized model.

## Mac execution

Run scripts/doctor.py. Confirm ARM64 Python, MPS availability, BF16 support, and the Qwen3_5 model class. Use a recent compatible PyTorch/Transformers environment; prefer the upstream uv.lock when reproducing its environment. Do not silently move to CPU and report MPS performance.

Set up and run the reference backend. Start with a short prompt and 96–160 output tokens. Save the real outputs; never fill missing results with authored examples. Measure load time and generation time separately if adding performance reporting.

Export the vector files and let the exporter process exit. Build the pinned llama.cpp source with Metal. Start Q8_0 first if precise comparison is the priority, then Q4_K_M for the requested basic quantization. Verify plain llama-server chat before debugging steering. The managed comparison runner must start fresh backend state for each branch.

## Animation design

Improve web/index.html into a clean five-stage presentation: experiment, MLP mechanism, autoregressive divergence, measured replies, evidence/setup. One active stage, no partial neighboring slide, no autoplay. Keep system fonts or bundle a licensed font locally. Use 16–18 px body text, 24–32 px card padding, clear margins, readable diagrams, and explicit focus states.

Use CSS and inline SVG for the existing small diagrams. If converting to React, verify the target runtime before installing dependencies and provide a complete offline build. Keep the code self-contained for Claude artifacts; a local React build does not prove Claude.ai compatibility.

Use motion to explain the scalar intervention, vector addition, or token fork. Never animate arbitrary signal sizes as if measured. Provide pause, step, reduced motion, and keyboard navigation that does not steal slider/text-input keys. Keep the geometry labelled toy when reduced to two dimensions.

Add a measured neuron-activation view only if you actually capture baseline and intervened activations at aligned token positions. Name the capture point: upstream reads happen before its steering mutation at that same hook. Do not call the before-hook capture the altered activation. Do not turn logit-lens similarities or weight-space neighbors into proven circuit edges.

## Evaluation and delivery

Run the supplied prompt battery, preserve every output, and blind branch labels for manual scoring. Report sarcasm, false-premise agreement, inappropriate condolences, warmth, correctness, instruction following, and coherence separately. Text difference and KL are not personality scores.

Use common-prefix next-token distributions for causal comparisons. Do not compare late free-running distributions as though the histories were identical. Add norm-matched random directions and adjacent-neuron controls only as explicit extensions, with saved seeds and matched norms.

Verify Python unit/integration tests, GGUF tensor names/shapes/checksums, HTTP errors, frontend JavaScript syntax, and the live zero-dose identity check. In a browser, test 390, 768, and 1440 px widths, keyboard focus, 200% zoom, long replies, import/export, all stages, empty/error states, and reduced motion. Keep a clear list of checks that could not run.

Return an updated README with exact working commands, real run JSONs, a concise evidence table showing which supplied claims reproduced, screenshots, runtime/version details, and remaining limitations. Do not claim the “evil” label was proved, do not describe quantized behavior as token-identical without measurements, and do not replace missing evidence with polished demonstrations.

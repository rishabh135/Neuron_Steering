# Validation record

> **Update, 26 October 2026.** The record below is from the original authoring environment, where no model could
> run. Since then the reference backend, vector export and llama.cpp builds have run on the target M4 Pro; the
> verified items are listed under "Status" in README.md, and this file will be rewritten when the evaluation is
> complete.

Prepared 25 October 2026 (user timezone).

## Completed

- **21 Python tests passed** in 4.202 seconds in the authoring environment.
- Recipe signs, intensity application, neuron bounds, invalid requests, non-finite values, text metrics, and character differences were checked.
- Synthetic-array tests verified the equality between a pre-down-projection additive push and its residual-vector form, including multiple neurons in one layer and cancellation.
- Control-vector GGUF files were written and read with the official llama.cpp Python GGUF writer/reader at the audited source revision. All 31 tensor names and vectors matched, and direction.0 was absent.
- A synthetic executable exercised the real three-process llama-server orchestration, HTTP transport, positive/negative vector scales, process cleanup, and finish-reason collection. This was a process test, not model inference.
- Local HTTP tests checked saved results, invalid requests, busy handling, exception cleanup, local-origin checks, and restricted paths.
- A separate real static-server smoke check confirmed that the served HTML exactly matched web/index.html, and that the status endpoint returned illustration mode and seven presets.
- Python compilation and Node.js JavaScript syntax checks passed.
- The HTML had 52 unique IDs, no duplicate IDs, and no external rendering assets.
- The 20-page PDF was rendered to PNG, visually reviewed, checked for text outside page bounds, and checked for replacement glyphs. Fonts are embedded.

The GGUF package was not available through the environment's package index, so the reader/writer used for QA was fetched from the audited official llama.cpp repository into a separate temporary QA directory. Those upstream files are not redistributed in the project.

## Not performed

- No Qwen3.5-4B model was downloaded or executed.
- No Apple MPS device was available.
- The upstream PyTorch Runtime adapter was source-reviewed but not exercised with real weights.
- No real llama.cpp binary was built or run against a model.
- No personality, sycophancy, refusal, or accuracy result is claimed.
- No M4 latency or peak-memory result is claimed.
- The browser runtime was not available; its binary download was denied by the environment's network policy.
- No actual browser screenshot, responsive-layout, keyboard, 200% zoom, reduced-motion, or Claude.ai preview test was completed.

## Commands used

```bash
python3 -m unittest discover -s tests -v
python3 -m compileall -q qwen-neuron-lab
node --check tmp/artifact-script.js
python3 scripts/build_pdf.py --out /absolute/path/Qwen_Neuron_Steering_Guide.pdf
pdftoppm -scale-to 1000 -png /absolute/path/Qwen_Neuron_Steering_Guide.pdf /tmp/page
```

The test invocation additionally placed the temporary official GGUF package on PYTHONPATH. Normal users can install gguf from requirements-model.txt.

## Target-Mac acceptance checklist

1. Run doctor.py and confirm MPS plus the Qwen3_5 model class.
2. Run a live zero-dose comparison and require identical branch text.
3. Compare one neuron at intensity 0.25, 0.50, and 1.00.
4. Save actual outputs, provenance, and the model revision.
5. Repeat with the exported recipe under Q8_0 and Q4_K_M.
6. Inspect the frontend at 390, 768, and 1440 px, including long replies and horizontal diagram scrolling.
7. Test all stages, boundary buttons, focus, reduced motion, JSON import/export, and error messages.
8. Use the blinded scoring rubric in EVALUATION.md before claiming reproduction.

The local software checks establish implementation properties. They do not establish that the supplied behavioral claims reproduce.

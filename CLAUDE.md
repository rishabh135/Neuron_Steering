# Project instructions

Read README.md, docs/INVESTIGATION.md, docs/VALIDATION.md, and docs/WORKFLOW.md before changing inference behavior.

- This project studies activation steering, not a proved personality switch or an abliteration result.
- Preserve every signed recipe and zero-based index in presets.json.
- Keep the original prompt identical across all three branches.
- Default to greedy decoding and thinking disabled for comparisons.
- Calibrate on an unsteered fixed reference before activating any hooks.
- Upstream source and llama.cpp commits are pinned. Never change their pins silently.
- The audited llama.cpp loader maps direction.L to zero-based model layer L; it excludes layer 0. Never add one to this index.
- GGUF ports use BF16-derived residual vectors. Label quantized results separately.
- Never invent model responses, probabilities, activation measurements, timing, or benchmark results.
- Keep authored examples clearly labelled and separate from measured JSON.
- The browser must render without external CDNs or paid libraries.
- Use one active carousel panel, readable system fonts, reduced motion, and keyboard-accessible controls.
- Do not put model weights, vendor clones, run outputs, or credentials in git.
- Test changed mathematical and API behavior; document unavailable hardware checks accurately.

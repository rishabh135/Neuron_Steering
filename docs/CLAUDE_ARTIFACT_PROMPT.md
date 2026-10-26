Create a polished, self-contained Claude artifact named “One prompt. Different paths.” Use the supplied web/index.html as the starting artifact and docs/INVESTIGATION.md as the technical source.

The audience is a first-year undergraduate. Explain how the same prompt can produce different continuations when selected Qwen3.5-4B MLP activations change. All layer and neuron indices are zero-based.

Deliver one complete HTML artifact, or one default-exported React component with inline CSS and SVG if the actual preview supports React. Do not assume additional npm packages, CDN access, a localhost connection, or model inference in the artifact sandbox. Preserve JSON upload so measured local runs can be inspected without a network connection.

Use a dark navy background, white text, cyan for baseline, violet for the selected recipe, and warm orange for reversal. Use an available system sans font, 16–18 px body text, generous 24–32 px card padding, clear labels, and one active carousel panel. Provide named stage buttons, Previous/Next, a stage counter, visible keyboard focus, and reduced motion. Do not autoplay.

Build five stages:
1. Shared prompt and the 32-layer architecture; highlight the real recipe layers and show the exact signed neuron coordinates.
2. Animate the actual operation: residual after attention, normalization, gated MLP, additive intervention before down_proj, down projection, residual addition. Show a separate toy 2D vector with an explicit toy label.
3. Explain next-token probability changes and autoregressive feedback. Use measured common-prefix probabilities only when imported; otherwise label every probability as toy data.
4. Show baseline, selected recipe, and all-signs-reversed replies from the same prompt. Keep full text readable. Preserve the source backend and run identifier.
5. Show calibration, provenance, limitations, and the local setup commands.

Explain the formula using plain labels:
alpha = dose * fixed median residual norm / down-column norm
delta residual = alpha * down column
individual write norm = abs(dose) * median residual norm

Exclude position 0 only when measuring the calibration median. Apply the additive push at all prompt and decode positions. Explain that a negative additive dose does not zero a neuron, that a recipe name is a hypothesis, and that this operation is different from abliteration.

Never present an authored sample reply as a measured Qwen result. Never invent neuron activation heatmaps, probability changes, circuit connections, speeds, or dose-response curves. Keep the illustration badge until a measured local JSON run is imported. Animation timing must be identified as explanatory.

Verify narrow, tablet, and desktop layouts; button boundaries; every stage; import failures; long outputs; keyboard use; and reduced motion. If the actual Claude preview cannot be tested, state that limitation. Return the complete artifact with no omitted helper files.

> Superseded for the React rebuild by `docs/CLAUDE_ARTIFACT.md` and `docs/UI_DESIGN.md`; the five-stage brief above still describes `web/index.html`.

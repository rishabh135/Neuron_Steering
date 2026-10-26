# Using the portable artifact in Claude.ai

`artifacts/NeuronSteeringArtifact.tsx` is one file: one default-exported React component, its CSS inlined as a string, helpers inline, **imports `react` only**. It makes no network request, never contacts your laptop, and cannot run the model. It shows the authored illustration, and any measured run you import (JSON exported by this project, `schema_version` 1, or a bundle from `scripts/make_bundle.py`).

## Rebuild

```bash
npm --prefix ui ci
node scripts/build_artifact.mjs      # writes artifacts/NeuronSteeringArtifact.tsx and artifacts/dist/neuron-steering.html
```

The script compiles the shared Tailwind tokens, bundles `ui/src/artifact/entry.tsx` and `ui/src/lab/*`, fails if any import other than `react` survives, then builds the HTML page from the generated `.tsx` itself, so the page you can open locally is the code you paste. Never edit the generated file; edit `ui/src/lab` or `ui/src/artifact` and rebuild.

## Paste it into Claude.ai

1. Open claude.ai in a new chat and ask Claude to create a React artifact. A short prompt works: *"Create a React artifact. Use exactly the code I paste next; do not change it."*
2. Paste the full contents of `artifacts/NeuronSteeringArtifact.tsx` (about 260 KB) and send. If the chat input refuses a message that large, attach the file instead and ask Claude to use the file's text verbatim as the artifact.
3. Open the artifact's preview and run the checks below. If the preview shows an import error, the sandbox does not offer something this build assumes; report the exact message, because this project only verified the build, not that preview.

### What to check in the real preview

- The page renders, the theme switch changes colours, and Previous/Next move through all eight chapters.
- Import: choose a run JSON (the file picker and the paste box). A corrupt file must show an error and keep the current view.
- Copy buttons: the preview may block the clipboard; the page falls back and then says "Select and copy manually".
- Export: downloads may be blocked in the sandbox; use **Copy JSON**.
- Preferences use `localStorage` inside `try/catch`; if the preview blocks it, the page still works but forgets your theme.
- Chapter 8 shows commands only; nothing in the preview can reach `127.0.0.1`.

## What was and was not verified

Verified: the generated file bundles with only `react` external (`build_artifact.mjs` asserts it); the same code, built as `artifacts/dist/neuron-steering.html`, rendered in Chrome and Firefox at phone width and desktop width, imported a measured run, and rejected a corrupt file without losing the view.

**Not verified: the actual Claude.ai preview.** Its React version, module list, CSP and storage rules are not documented authoritatively here, and a local browser success does not prove compatibility. Third-party descriptions of the artifact runtime disagree with each other; this build deliberately depends on nothing beyond `react`.

## Hosting as an HTML Artifact

`artifacts/dist/neuron-steering.html` is self-contained (inline JS and CSS, system fonts, no external script or stylesheet), so it can also be published as an HTML artifact. It differs from the pasted component only in the mount code.

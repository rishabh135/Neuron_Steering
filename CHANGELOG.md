# Change log

## 2026-10-26 - React lab "One Prompt. Different Paths."

Added
- `ui/`: React 19 + TypeScript + Vite 8 + Tailwind 4 app with eight chapters, shadcn/ui primitives, beUI tabs and number transition, Motion transitions, Embla carousel (one mounted panel), command search (Ctrl/Cmd+K), presentation mode, light/dark/system theme, reduced-motion switch, lazy three.js layer view with a complete 2D fallback.
- `ui/src/lab/`: shared data layer and chapters: run validation (`schema_version` 1, bundles, finite-value and size limits), steering formulas, model facts derived from the snapshot's config (hybrid 24 linear + 8 full attention layers), verified source index with pinned upstream links, illustration data, contrast-tested theme tokens.
- `artifacts/NeuronSteeringArtifact.tsx` and `scripts/build_artifact.mjs`: pasteable single-file component (imports `react` only) generated from the same sources, plus a self-contained HTML build.
- `scripts/dev.py`: one-command launcher for Vite and the API with port-conflict handling, ready-URL reporting and clean shutdown.
- `serve.py`: `--ui-dir` serves a built app (assets, immutable caching for hashed files, route refresh, CSP, traversal/dotfile/symlink protection); the original page moves to `/legacy` in that mode and stays at `/` otherwise. `/api/status` publishes `limits`, `generates`, `components`, `diagnostics`, `model_file`, `ui`. `/api/runs` skips unreadable files instead of failing.
- `lab/core.py`: `LIMITS` is the single source of the validated ranges.
- `scripts/build_lab_data.py`, `scripts/build_icons.mjs` generators; tests: `tests/test_static_ui.py`, `test_dev_launcher.py`, `test_lab_data.py`, `ui/src/lab/lab.test.ts`, `tests/ui_browser_check.py`, `tests/artifact_browser_check.py`.
- Docs: `docs/UI_DESIGN.md`, `docs/CLAUDE_ARTIFACT.md`, `docs/PERFORMANCE.md`, `THIRD_PARTY_LICENSES.md`.

Changed
- README: React lab section, repository map, commands.

Unchanged on purpose
- `presets.json`, every dose and index, source pins (neuron-explorer `f79b2196`, llama.cpp `d854d98`), the API request/response shape (`schema_version` 1), `web/index.html`.

Found and fixed while testing
- Vite inlined small fonts as `data:` URLs, which the production CSP (`font-src 'self'`) blocks: inlining disabled.
- Radix dialogs opened from plain buttons dropped focus to `<body>` on close: opener is now restored.
- The shadcn carousel handled arrow keys from inside sliders and inputs: restricted to the focused carousel.
- Dark `--input` border contrast was 2.8:1: raised.

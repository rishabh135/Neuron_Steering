# React lab: design, components and data semantics

"One Prompt. Different Paths." is two experiences built from one set of chapters:

| | Local app (`ui/`) | Portable artifact (`artifacts/NeuronSteeringArtifact.tsx`) |
| --- | --- | --- |
| Purpose | Live inference against `serve.py`, saved runs, full interaction | Offline explanation, imported measured runs |
| Shell | Embla carousel (shadcn), beUI animated tabs, Motion transitions, command search, lazy three.js view | Plain tablist, CSS reveal, no search, 2D only |
| Primitives | shadcn/ui (Button, Slider, Tabs, Dialog, Sheet, Tooltip, Command, Carousel), beUI | Native elements (`<dialog>`, `<input type=range>`) |
| Network | Same-origin `/api/status`, `/api/compare`, `/api/runs` only | None |
| Imports | npm packages | `react` only |

Shared code lives in `ui/src/lab/`: types, run validation, steering formulas, model facts, source index, state (`store.tsx`), the eight chapters, and `theme.css`. The shells inject interaction primitives through `KitProvider` (`lab/kit.tsx`), so the chapters never import shadcn or Motion. `scripts/build_artifact.mjs` bundles `ui/src/artifact/entry.tsx` plus the shared modules and the compiled Tailwind CSS into the single pasteable file, so the two versions cannot drift apart.

## Data semantics (both experiences)

- `presets.json` is imported directly; no recipe, sign or zero-based index is copied by hand.
- Layer count, widths and block types come from the pinned snapshot's `config.json` (`scripts/build_lab_data.py` → `ui/src/lab/generated/model-facts.json`): 32 layers, hidden 2,560, MLP width 9,216, **hybrid**: 24 Gated DeltaNet linear-attention layers and 8 full-attention layers (indices 3, 7, …, 31). The MLP, where the hook sits, is identical in both block types.
- Source references (`generated/sources.json`) are produced by searching the vendored upstream files for literal anchors at the pinned revisions (neuron-explorer `f79b2196`, llama.cpp `d854d98`); the script refuses to run if the checkout is not the pinned commit. `tests/test_lab_data.py` fails if the committed JSON is stale. The raw files at both pinned revisions were fetched from GitHub and return 200; the neuron-explorer `runtime.py` at the pin is byte-identical to upstream `31aae16`. Installed-`transformers` lines are labelled unpinned, and the prose next to a snippet is labelled "inferred".
- A run is validated (`schema_version` 1 only, `kind: "measured"`, finite numbers, ≤ 12 MB, ≤ 400k values, documented request ranges) and mapped to a `ViewRun`. `forward` is always "Selected recipe" and `reverse` always "Reversed recipe". Strings are rendered as React text only. A failed import leaves the viewed run untouched. Bundles (`{kind:"bundle", runs:[…]}`) import member by member.
- Every result carries its own parameter snapshot. If the controls change afterwards the result is badged **Earlier configuration**; it is never recomputed or silently replaced. A pending live request is held apart from imported runs and is added to the run list only when it finishes and validates.
- Status is one of **Illustrative**, **Imported run**, **Live local run**. The illustration contains only authored text and toy probabilities (labelled) plus the calibration constants recorded in README.md (checked against the README table by a test).
- `diagnostics = null` (llama backend) is handled explicitly: first-token top-10 from llama-server is shown when present; KL, forks and token ids are reported as unavailable, and the first difference is described as a **text** difference, not a token claim. A first differing **token** is highlighted only when ids were recorded (reference backend).
- No measured activation heatmaps are drawn: the reference backend records `down_proj` pre-hook reads at prompt positions only (before the hook's own addition), which the inspector shows as a table with its capture point. Weight similarity, logit lenses and proximity are never presented as circuit evidence.
- The server returns completed JSON. The UI shows an indeterminate "waiting" bar with elapsed time; token replay is labelled a replay. Streaming would need a server protocol and tests; none was added.

## Chapters

1 Experiment · 2 Inside the model (2D map, optional lazy 3D, inspector) · 3 The intervention (numbered, selectable SVG block diagram with zoom/annotation toggle; the 8th step is the llama.cpp port) · 4 The mathematics (seven equations, play/pause/step/replay/scrub, per-symbol worked example for any recipe neuron, 2-D toy labelled Illustration) · 5 Token divergence · 6 Compare replies (three columns ≥ 1024 px, tabs below; copy buttons; optional boxed synchronized scrolling) · 7 Evidence and limits (exact-value tables) · 8 Run on my Mac.

Exactly one chapter panel is mounted at a time; navigation moves focus to the new chapter's heading; chapters have routes (`/chapter/<id>`) that survive refresh in dev and production.

## Design system

- Tokens (`ui/src/lab/theme.css`): background `#080B12`, panel `#111827`, raised `#182235`, text `#F3F6FC`, secondary `#B8C2D6`, baseline cyan `#67E8F9`, recipe violet `#C4B5FD`, reversed amber `#FCD34D`, error red `#F87171`. Light theme tokens are tuned separately (cyan `#0E7490`, violet `#6D28D9`, amber-brown `#92400E`). Branches always carry a symbol (● baseline, ◆ recipe, ■ reversed) and a line/bar pattern (solid, dashed/striped, dotted) in addition to colour.
- Contrast is tested, not assumed (`ui/src/lab/lab.test.ts` parses `theme.css`): foreground ≥ 7:1 and secondary text ≥ 4.5:1 on every surface, branch colours and focus ring ≥ 4.5:1 on panels, control borders ≥ 3:1, in both themes. One value was raised after the test failed (`--input`, 2.8 → ≥ 3:1).
- Type: Inter Variable (bundled) for UI, JetBrains Mono Variable (bundled) for equations and identifiers, system fallbacks; body 17 px / 1.6, diagram and control labels 14–16 px, 12 px only for secondary metadata, tabular numerals; prose capped at 68ch.
- Spacing is the Tailwind 4 px grid used at 8/12/16/24/32/48; card padding 16 px (phone), 24 px, 32 px (desktop); radii 8/12/16 px.
- Motion: 200–240 ms interface transitions, 400 ms reveals; the playback speed (0.25×–2×) scales them. `prefers-reduced-motion` or the visible "Reduce motion" toggle removes animation and leaves the full static state. Only the active chapter exists in the DOM, so nothing animates offscreen. One quiet gradient sits behind the layer map; equations, controls and replies sit on solid surfaces.
- Theme: System / Light / Dark radio group in the header, persisted in `localStorage` (guarded; works without storage), applied before first paint by `public/theme-init.js`.
- Touch targets ≥ 44 px (checked by `tests/ui_browser_check.py` at every width).

## Component decisions

| Need | Choice | Why |
| --- | --- | --- |
| Buttons, dialogs, sheets, tooltips, slider, tabs, command search, carousel | shadcn/ui primitives (Radix), copied with the CLI | Accessible primitives, MIT; local edits listed in `THIRD_PARTY_LICENSES.md` |
| Chapter tabs | beUI `tabs` (pill) | Animated indicator with overflow chevrons; free MIT registry item |
| Number transition | beUI `animated-number` | Used for the effective-dose readout |
| Theme control | Own 3-way radio group | beUI's toggle needs `next-themes` (Next-oriented); three tokens and a 20-line hook are lighter |
| Command search | shadcn `command` (cmdk) | Chapters, layers, recipe neurons, recipes, actions; beUI `command-palette` would add a second implementation |
| Main animation | Motion (`motion/react`) | Chapter transition, tab indicator, number tween; CSS handles the data-flow dashes |
| Precise diagrams | Inline SVG | Exact coordinates, labels ≥ 14 px, anchored leader lines; no graph library |
| Pan/zoom graph | React Flow: **not used** | The block diagram is fixed and small; zoom buttons and scrolling suffice |
| Icons | lucide (app shell) and 21 generated inline icons (shared code) | The portable artifact may import only `react` |

## Animation and graphics library decisions

Versions are the npm latest checked on 26 Oct 2026; none of the "no" rows is in `ui/package.json`.

| Library | Intended role | Used? | Reason |
| --- | --- | --- | --- |
| Remotion 4.0.x | Optional React video export | No | Not OSI open source. Free for individuals, non-profits and for-profit organisations with up to 3 employees; larger for-profit organisations need a paid company licence (remotion.dev/docs/license/pricing). Eligibility depends on who runs it, so it is kept out of the dependency tree. MP4 export, if wanted, is a separate adapter that reads a run JSON; none is implemented. |
| HyperFrames 0.8.x | HTML-to-video alternative | No (CLI only if wanted) | Apache-2.0; local rendering needs Node ≥ 22, FFmpeg and Chrome. Fits as an external `npx hyperframes render` over an exported static page, never as a browser dependency. Not wired up. |
| Anime.js 4.x | Seekable SVG/maths choreography | No | The equation player is state-driven (`step`), which already gives play, step, replay and scrub. |
| React Spring 10.x | Spring animation | No | Motion already provides springs and layout animation. |
| PixiJS 8.x | Dense 2D neuron rendering | No | One GPU renderer only; instanced three.js covers the 9,216-point view. |
| p5.js 2.x | Illustrative generative sketches | No | LGPL-2.1 and no teaching need. |
| Paper.js | Advanced vector paths | No | SVG is enough. |
| Matter.js | 2-D physics illustration | No | Physics would be decoration, not measured behaviour. If ever used it must be labelled "Illustration". |
| **three.js 0.186** | Optional explorable 3D layer view | **Yes, lazy** | The chosen single GPU renderer: `LayerView3D` is a separate 559 kB (139 kB gzip) chunk loaded only when the 3D tab opens. Instanced meshes (32 layer slabs, 9,216 neuron cubes in one draw call), pixel ratio capped at 2, render on demand, paused offscreen/hidden, all geometry, materials and the WebGL context disposed on unmount. WebGL failure falls back to the complete 2D map. Layout and colours carry no measured meaning; this is stated in the view. |
| Rapier | Real collision simulation | No | No collision physics belongs in this explanation. |
| OGL | Lightweight shader alternative | No | Would duplicate three.js. |

No frame rate is claimed: it was not measured.

## Not implemented (by design)

Editable per-neuron doses or decoding settings (no backend path or validation exists; the fixed settings are shown instead), streaming, measured activation heatmaps, MP4 export, a 3D view inside the portable artifact.

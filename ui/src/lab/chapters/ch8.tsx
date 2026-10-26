import { useState } from "react"
import { useKit } from "../kit"
import { MODEL } from "../model"
import { ViewImplementation } from "../source-ui"
import { useLab } from "../store"
import { Card, CodeBlock, Note } from "../ui"
import { ChapterFrame } from "./frame"

type Backend = "illustration" | "reference" | "llama"
const GGUF = "models/gguf/Qwen3.5-4B-Q4_K_M.gguf"

export function Chapter8() {
  const { Tabs } = useKit()
  const lab = useLab()
  const [b, setB] = useState<Backend>("illustration")
  const dev = b === "llama" ? `python3 scripts/dev.py --backend llama --gguf ${GGUF}` : `python3 scripts/dev.py --backend ${b}`
  const stages = [
    ["1 · Experiment", "serve.py", "lab-validate", "POST /api/compare validates preset, intensity 0–1.25, max_new 1–512."],
    ["2 · Inside the model", "docs/SOURCE_AUDIT.json", "hf-decoder-layer", "Layer and block types come from the snapshot's config.json."],
    ["3 · The intervention", "lab/reference.py", "hook-add", "The down_proj pre-hook that adds α."],
    ["4 · The mathematics", "lab/core.py", "push-unit", "Dose × R_L ÷ ‖w‖ and the row signs."],
    ["5 · Token divergence", "lab/reference.py", "lab-compare-reference", "First-token and fork diagnostics at identical prefixes."],
    ["6 · Compare replies", "serve.py", "lab-server-compare", "Three branches, saved to runs/<run_id>.json."],
    ["7 · Evidence", "lab/reference.py", "lab-calibration", "Calibration before any hook is active."],
    ["8 · llama.cpp port", "lab/llama_backend.py", "lab-llama-command", "Scaled control vector, layers 1–31."],
  ] as const
  return (
    <ChapterFrame n={8} title="Run on my Mac" lead={<p>The portable page cannot reach your laptop. The local app can: it runs the same chapters against <code>serve.py</code>, which runs the model. Pick a backend to see the exact command.</p>} status={false}>
      <Card className="flex flex-col gap-4">
        <Tabs label="Backend" value={b} onChange={(v) => setB(v as Backend)} items={[{ value: "illustration", label: "Illustration (no model)" }, { value: "reference", label: "Reference · BF16 hook" }, { value: "llama", label: "llama.cpp · Q4_K_M port" }]} />
        <CodeBlock label="Development UI (Vite + API)" code={dev} />
        <CodeBlock label="Production build served by Python" code={`npm --prefix ui run build\npython3 serve.py --ui-dir ui/dist --backend ${b === "illustration" ? "illustration" : b}${b === "llama" ? ` --gguf cache/${GGUF}` : ""}`} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-label">
          <dt className="text-muted-foreground">Development UI</dt><dd className="font-mono">http://127.0.0.1:5173</dd>
          <dt className="text-muted-foreground">API (proxied at /api)</dt><dd className="font-mono">http://127.0.0.1:8792</dd>
          <dt className="text-muted-foreground">Production page</dt><dd className="font-mono">http://127.0.0.1:8792/ (original offline page: /legacy)</dd>
          <dt className="text-muted-foreground">Managed llama-server</dt><dd className="font-mono">127.0.0.1:8081, one process per branch</dd>
        </dl>
        {b === "reference" && <Note title="Use the upstream Python environment">The reference backend needs torch and transformers. If your active Python lacks them, run the launcher with <code>cache/vendor/neuron-explorer/.venv/bin/python</code> (see setup below). The launcher warns when it cannot import them.</Note>}
        {lab.apiStatus && <p className="text-label text-muted-foreground">This page is connected to the <strong className="text-foreground">{lab.apiStatus.backend}</strong> backend{lab.apiStatus.model_file ? ` (${lab.apiStatus.model_file})` : ""}.</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <h3>Model setup, once</h3>
          <CodeBlock label="sources, weights, environment" code={`source env.sh
python3 scripts/setup_reference.py          # pinned explorer + Qwen3.5-4B @ ${MODEL.revision.slice(0, 8)} (~9.3 GB)
(cd cache/vendor/neuron-explorer && UV_PYTHON_PREFERENCE=only-managed uv sync --locked --python 3.12)
PY=cache/vendor/neuron-explorer/.venv/bin/python
$PY scripts/doctor.py                        # arm64, MPS, BF16, Qwen3_5 class`} />
          <CodeBlock label="llama.cpp port (optional)" code={`PATH="$(uvx --from cmake python -c 'import cmake;print(cmake.CMAKE_BIN_DIR)'):$PATH" \\
  python3 scripts/setup_llama.py --quant Q8_0
python3 scripts/setup_llama.py --quant Q4_K_M --skip-build
uv pip install --python $PY ./cache/vendor/llama.cpp/gguf-py
$PY scripts/export_vectors.py --all && $PY scripts/verify_vectors.py`} />
          <p className="text-label text-muted-foreground">Full precision reference steering edits one MLP activation in the BF16 model. The GGUF path instead adds BF16-derived residual vectors to a quantized model: related by linearity, but a separate experiment whose results are labelled separately.</p>
        </Card>
        <Card className="flex flex-col gap-4">
          <h3>Troubleshooting</h3>
          {[
            ["Port already in use", "The launcher names the process and stops. Use --auto-port, or --ui-port / --api-port / --llama-port."],
            ["“Illustration mode does not generate model replies”", "Start with --backend reference or llama. The page still works for import and explanation."],
            ["“A comparison is running” (409)", "The server runs one comparison at a time. Wait, then run again. Stopping the wait does not stop the server."],
            ["“Local origin required” (403)", "Open the page at http://127.0.0.1 or localhost on the printed port, not through another host name or tunnel."],
            ["First reference run is slow", "The model loads on the first comparison; later runs reuse it."],
            ["No GPU / not MPS", "The upstream runtime logs a warning if it did not pick mps. Do not report such a run as an MPS run."],
          ].map(([q, a]) => <details key={q} className="rounded-md border border-border px-3"><summary className="text-label font-semibold">{q}</summary><p className="pb-3 text-label text-muted-foreground">{a}</p></details>)}
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <h3>Where each stage lives</h3>
        <p className="text-label text-muted-foreground">Local file, then the verified lines (with the pinned upstream link where one exists).</p>
        <ul className="grid gap-3 md:grid-cols-2">
          {stages.map(([name, file, id, what]) => (
            <li key={name} className="flex flex-col gap-2 rounded-md border border-border p-3"><p className="font-semibold">{name}</p><p className="text-label text-muted-foreground">{what} <span className="font-mono text-[13px]">{file}</span></p><div><ViewImplementation id={id} /></div></li>
          ))}
        </ul>
      </Card>
    </ChapterFrame>
  )
}

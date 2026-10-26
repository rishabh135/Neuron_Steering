"""The UI's recorded constants and generated files must agree with the repository's own sources."""
import json
from pathlib import Path
import re
import subprocess
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import CACHE, ROOT, presets

GEN = ROOT / "ui/src/lab/generated"


class LabDataTests(unittest.TestCase):
    def test_ts_calibration_matches_readme_table(self):
        readme = (ROOT / "README.md").read_text()
        table = {}
        for m in re.finditer(r"^\| L(\d+) N(\d+) .*?\| ([\d.]+) \| ([\d.]+) \|", readme, re.M):
            table[f"{m[1]}:{m[2]}"] = (float(m[3]), float(m[4]))
        ts = (ROOT / "ui/src/lab/steering.ts").read_text()
        recorded = {f"{m[1]}:{m[2]}": (float(m[3]), float(m[4])) for m in re.finditer(r'"(\d+):(\d+)": \{ residMedian: ([\d.]+), downColumnNorm: ([\d.]+) \}', ts)}
        self.assertEqual(recorded, table)
        used = {f"{n['layer']}:{n['neuron']}" for p in presets().values() for n in p["neurons"]}
        self.assertEqual(used, set(recorded))

    def test_presets_are_usable_by_the_ui(self):
        facts = json.loads((GEN / "model-facts.json").read_text())
        for p in presets().values():
            for n in p["neurons"]:
                self.assertTrue(1 <= n["layer"] < facts["num_hidden_layers"])
                self.assertTrue(0 <= n["neuron"] < facts["intermediate_size"])

    def test_model_facts_describe_the_hybrid(self):
        facts = json.loads((GEN / "model-facts.json").read_text())
        kinds = facts["layer_types"]
        self.assertEqual((len(kinds), facts["hidden_size"], facts["intermediate_size"]), (32, 2560, 9216))
        self.assertEqual([i for i, k in enumerate(kinds) if k == "full_attention"], list(range(3, 32, 4)))

    def test_sources_pinned_and_verbatim(self):
        from lab.core import EXPLORER_SHA, LLAMA_SHA
        sources = json.loads((GEN / "sources.json").read_text())
        for s in sources.values():
            if s["repo"] == "explorer":
                self.assertEqual(s["rev"], EXPLORER_SHA)
            if s["repo"] == "llama":
                self.assertEqual(s["rev"], LLAMA_SHA)
            if s["url"]:
                self.assertIn(f"#L{s['lines'][0]}-L{s['lines'][1]}", s["url"])
        self.assertIn("build_cvec(cur, il)", sources["llama-cvec-call"]["snippet"])
        self.assertIn("register_forward_pre_hook", sources["hook-register"]["snippet"])

    @unittest.skipUnless((CACHE / "vendor/neuron-explorer/explorer/runtime.py").exists(), "vendored upstream sources not present")
    def test_generated_files_are_current(self):
        out = subprocess.run([sys.executable, str(ROOT / "scripts/build_lab_data.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)


if __name__ == "__main__":
    unittest.main()

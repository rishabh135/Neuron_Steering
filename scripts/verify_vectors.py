#!/usr/bin/env python3
"""Check exported control vectors: tensor names, shapes, dtype, checksums, and per-layer write norms."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import ROOT, VECTORS, atomic_json, file_sha, presets


def main():
    import numpy as np
    from gguf import GGUFReader
    report = {}
    for preset, definition in presets().items():
        path = VECTORS / f"{preset}.gguf"
        manifest = json.loads(path.with_suffix(".json").read_text())
        tensors = {t.name: t for t in GGUFReader(str(path)).tensors}
        assert set(tensors) == {f"direction.{l}" for l in range(1, 32)}, "expected direction.1..31 and no direction.0"
        for t in tensors.values():
            assert t.data.dtype == np.float32 and t.data.shape == (2560,), (t.name, t.data.dtype, t.data.shape)
        assert file_sha(path) == manifest["vector_sha256"] and manifest["preset_definition"] == definition
        layers = {row["layer"] for row in definition["neurons"]}
        norms = {l: float(np.linalg.norm(tensors[f"direction.{l}"].data)) for l in range(1, 32)}
        assert all(norms[l] == 0 for l in norms if l not in layers), "unselected layers must be zero"
        rows = []
        for layer in sorted(layers):
            cal = [c for c in manifest["calibration"] if c["layer"] == layer]
            expected = sum(c["individual_write_norm"] for c in cal)  # equal only for one neuron per layer
            rows.append({"layer": layer, "direction_norm": norms[layer], "dose_times_R": expected,
                         "relative_error": abs(norms[layer] - expected) / expected if len(cal) == 1 else None})
        report[preset] = {"sha256": manifest["vector_sha256"], "tensors": len(tensors), "dtype": "float32",
                          "shape": [2560], "nonzero_layers": rows}
    out = ROOT / "runs/vector-verification.json"
    atomic_json(out, report)
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()

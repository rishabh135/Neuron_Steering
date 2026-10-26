#!/usr/bin/env python3
"""Export each additive neuron recipe as 31 float32 llama.cpp direction tensors."""
import argparse
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import VECTORS, atomic_json, file_sha, presets, pushes_for


def layer_directions(columns, medians, pushes, hidden_size=2560, layers=32):
    import numpy as np
    directions = {layer: np.zeros(hidden_size, dtype=np.float32) for layer in range(1, layers)}
    for layer, neuron, dose, mode in pushes:
        if mode != "add" or layer not in directions:
            raise ValueError("The pinned llama.cpp port accepts additive pushes at zero-based layers 1..31.")
        col = np.asarray(columns[(layer, neuron)], dtype=np.float32)
        norm = float(np.linalg.norm(col))
        median = float(medians[layer])
        if col.shape != (hidden_size,) or not np.isfinite(col).all() or not np.isfinite(norm) or norm <= 1e-12 or not np.isfinite(dose):
            raise ValueError("Invalid source column.")
        if not np.isfinite(median) or median <= 0:
            raise ValueError("Invalid calibration median.")
        directions[layer] += np.float32(dose * median / norm) * col
    return directions


def write_vectors(path, directions):
    from gguf import GGUFWriter
    writer = GGUFWriter(str(path), "controlvector")
    writer.add_string("controlvector.model_hint", "Qwen3.5-4B")
    writer.add_uint32("controlvector.layer_count", len(directions))
    for layer, vector in sorted(directions.items()):
        # IMPORTANT: direction.14 is zero-based model layer 14 in the audited loader.
        # Do not shift to direction.15. Layer 0 is unsupported by that loader.
        writer.add_tensor(f"direction.{layer}", vector)
    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--preset", choices=list(presets()), default="sarcasm")
    p.add_argument("--all", action="store_true")
    p.add_argument("--out", type=Path, default=VECTORS)
    args = p.parse_args()
    from lab.reference import ReferenceBackend
    backend = ReferenceBackend()
    backend.ensure_loaded()
    args.out.mkdir(parents=True, exist_ok=True)
    for preset in presets() if args.all else [args.preset]:
        request = {"preset": preset, "intensity": 1.0}
        pushes = pushes_for(request)
        calibration = backend.calibration(pushes)
        cols = {(l, n): backend.rt.down_col(l, n).detach().cpu().numpy() for l, n, _, _ in pushes}
        medians = {l: backend.rt.layer_resid_p50(l) for l, _, _, _ in pushes}
        directions = layer_directions(cols, medians, pushes)
        path = args.out / (preset + ".gguf")
        write_vectors(path, directions)
        atomic_json(path.with_suffix(".json"), {"schema_version": 1, "preset": preset,
            "preset_definition": presets()[preset], "baked_intensity": 1.0,
            "provenance": backend.provenance, "calibration": calibration,
            "vector_sha256": file_sha(path), "tensor_indexing": "zero-based model layers 1..31; layer 0 omitted",
            "interpretation": "BF16-derived additive residual directions; experimental port to quantized GGUF"})
        print(path)


if __name__ == "__main__":
    main()

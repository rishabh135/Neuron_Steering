#!/usr/bin/env python3
"""Check local Apple Silicon support without downloading weights."""
import importlib
import json
from pathlib import Path
import platform
import shutil
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lab.core  # noqa: F401  (redirects caches into ./cache before torch/transformers import)

result = {"python": platform.python_version(), "machine": platform.machine(), "system": platform.system(),
          "git": shutil.which("git"), "cmake": shutil.which("cmake"), "packages": {}}
for name in ["torch", "transformers", "numpy", "safetensors", "huggingface_hub", "gguf"]:
    try:
        module = importlib.import_module(name)
        result["packages"][name] = getattr(module, "__version__", "installed")
    except ImportError as e:
        result["packages"][name] = f"missing: {e}"
try:
    import torch
    result["mps_available"] = torch.backends.mps.is_available()
    if result["mps_available"]:
        x = torch.ones((8, 8), device="mps", dtype=torch.bfloat16)
        result["mps_bfloat16_matmul"] = float((x @ x)[0, 0]) == 8.0
    from transformers import Qwen3_5ForConditionalGeneration
    result["qwen35_class"] = True
except Exception as e:
    result["model_runtime_error"] = f"{type(e).__name__}: {e}"
print(json.dumps(result, indent=2))
if "model_runtime_error" in result:
    sys.exit(1)

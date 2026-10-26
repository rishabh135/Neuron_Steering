"""Validation, provenance, and metrics; Python standard library only."""
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
# Every download, cache, temporary file, source clone, model, build and exported vector lives under ./cache.
CACHE = ROOT / "cache"
VENDOR = CACHE / "vendor"
MODELS = CACHE / "models"
VECTORS = CACHE / "vectors"
# Overrides the user's global cache locations for this process and its children (llama-server, git, uv).
# Keep in sync with env.sh, which does the same for shell commands; tests/test_core.py checks the two match.
CACHE_ENV = {"HF_HOME": "huggingface", "XDG_CACHE_HOME": "xdg", "TORCH_HOME": "torch", "UV_CACHE_DIR": "uv",
             "UV_PYTHON_INSTALL_DIR": "uv-python", "UV_TOOL_DIR": "uv-tools", "PIP_CACHE_DIR": "pip",
             "npm_config_cache": "npm", "MPLCONFIGDIR": "matplotlib", "PYTHONPYCACHEPREFIX": "pycache",
             "TMPDIR": "tmp"}
for _key, _sub in CACHE_ENV.items():
    os.environ[_key] = str(CACHE / _sub)
    (CACHE / _sub).mkdir(parents=True, exist_ok=True)
sys.pycache_prefix = os.environ["PYTHONPYCACHEPREFIX"]
tempfile.tempdir = None  # re-read TMPDIR on next use
MODEL_ID = "Qwen/Qwen3.5-4B"
EXPLORER_SHA = "f79b2196e29aacbad89684938baac8d97b172fd1"
LLAMA_SHA = "d854d98bae598388ecea1ed84396587e5edc326d"
# Validated request limits; /api/status publishes them so the UI never hard-codes a second copy.
LIMITS = {"prompt_chars": 4000, "intensity_min": 0.0, "intensity_max": 1.25, "max_new_min": 1, "max_new_max": 512,
          "max_new_default": 160, "intensity_default": 0.5}


def presets():
    return json.loads((ROOT / "presets.json").read_text())


def validate_request(body):
    if not isinstance(body, dict):
        raise ValueError("Expected a JSON object.")
    prompt = body.get("prompt", "")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > LIMITS["prompt_chars"]:
        raise ValueError("Prompt must contain 1 to 4,000 characters.")
    preset = body.get("preset", "sarcasm")
    if not isinstance(preset, str) or preset not in presets():
        raise ValueError("Unknown preset.")
    intensity = body.get("intensity", LIMITS["intensity_default"])
    if isinstance(intensity, bool) or not isinstance(intensity, (int, float)):
        raise ValueError("Intensity must be a number.")
    if not math.isfinite(intensity) or not LIMITS["intensity_min"] <= intensity <= LIMITS["intensity_max"]:
        raise ValueError("Intensity must be between 0 and 1.25.")
    max_new = body.get("max_new", LIMITS["max_new_default"])
    if isinstance(max_new, bool) or not isinstance(max_new, int) or not LIMITS["max_new_min"] <= max_new <= LIMITS["max_new_max"]:
        raise ValueError("max_new must be an integer between 1 and 512.")
    request = {"prompt": prompt, "preset": preset, "intensity": float(intensity), "max_new": max_new}
    # Optional: run one neuron of a preset alone, with its signed dose exactly as listed in presets.json.
    component = body.get("component")
    if component is not None:
        if isinstance(component, bool) or not isinstance(component, int) or \
                not 0 <= component < len(presets()[preset]["neurons"]):
            raise ValueError("component must be a zero-based index into the preset's neurons.")
        request["component"] = component
    return request


def pushes_for(request):
    neurons = presets()[request["preset"]]["neurons"]
    if request.get("component") is not None:
        neurons = [neurons[request["component"]]]
    return [(p["layer"], p["neuron"], p["dose"] * request["intensity"], "add") for p in neurons]


def file_sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def text_metrics(text):
    words = text.split()
    grams = [tuple(words[i:i + 4]) for i in range(max(0, len(words) - 3))]
    return {"characters": len(text), "words": len(words),
            "distinct_word_4gram_ratio": len(set(grams)) / len(grams) if grams else None}


def first_character_difference(a, b):
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return i
    return min(len(a), len(b)) if len(a) != len(b) else None


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    tmp.replace(path)

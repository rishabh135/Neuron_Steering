#!/usr/bin/env python3
"""Build audited llama.cpp and fetch a named Qwen3.5-4B GGUF file."""
import argparse
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import MODELS, VENDOR, LLAMA_SHA, atomic_json, file_sha
from setup_reference import checkout


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--quant", choices=["Q4_K_M", "Q8_0", "BF16"], default="Q4_K_M")
    p.add_argument("--jobs", type=int, default=os.cpu_count())
    p.add_argument("--revision", help="Exact GGUF repository commit; if omitted, reuse saved lock or resolve main once.")
    p.add_argument("--skip-build", action="store_true", help="Only download and verify the GGUF file.")
    args = p.parse_args()
    source = VENDOR / "llama.cpp"
    checkout("https://github.com/ggml-org/llama.cpp.git", source, LLAMA_SHA)
    if not args.skip_build:
        if not shutil.which("cmake"):
            raise SystemExit("cmake not found. Install it (brew install cmake) or put `uvx --from cmake` on PATH; see README.")
        subprocess.run(["cmake", "-S", str(source), "-B", str(source / "build"), "-DCMAKE_BUILD_TYPE=Release",
                        "-DGGML_METAL=" + ("ON" if platform.system() == "Darwin" else "OFF")], check=True)
        subprocess.run(["cmake", "--build", str(source / "build"), "--config", "Release", "-j", str(args.jobs),
                        "--target", "llama-server", "llama-cli", "llama-quantize"], check=True)
    from huggingface_hub import model_info, hf_hub_download
    import json
    repo = "unsloth/Qwen3.5-4B-GGUF"
    lockpath = MODELS / (args.quant + ".lock.json")
    previous = json.loads(lockpath.read_text()) if lockpath.exists() else {}
    revision = args.revision or previous.get("revision") or model_info(repo).sha
    if len(revision) != 40 or any(c not in "0123456789abcdef" for c in revision):
        raise ValueError("Use a full 40-character GGUF repository commit.")
    filename = f"Qwen3.5-4B-{args.quant}.gguf"
    path = hf_hub_download(repo, filename=filename, revision=revision, local_dir=MODELS / "gguf")
    info = model_info(repo, revision=revision, files_metadata=True)
    expected = next(s.lfs.sha256 for s in info.siblings if s.rfilename == filename)
    actual = file_sha(path)
    if actual != expected:
        raise RuntimeError(f"{filename} sha256 {actual} does not match the repository's LFS sha256 {expected}.")
    atomic_json(lockpath, {"repo": repo, "revision": revision, "filename": filename, "local_path": path,
                           "sha256": actual, "sha256_verified_against": "Hugging Face LFS metadata",
                           "llama_commit": LLAMA_SHA})
    print(f"Model: {path}\nsha256: {actual} (verified)\nllama.cpp: {LLAMA_SHA}")


if __name__ == "__main__":
    main()

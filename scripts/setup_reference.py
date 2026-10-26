#!/usr/bin/env python3
"""Fetch the audited explorer commit and a revision-locked Hugging Face snapshot."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import MODELS, VENDOR, MODEL_ID, EXPLORER_SHA, atomic_json


def checkout(url, target, revision):
    if not target.exists():
        # Fetch the exact commit by SHA: the audited explorer pin is not reachable from upstream main after a
        # history rewrite, so a plain clone + checkout fails. GitHub still serves it by SHA.
        subprocess.run(["git", "init", "-q", str(target)], check=True)
        subprocess.run(["git", "-C", str(target), "fetch", "-q", "--depth", "1", url, revision], check=True)
        subprocess.run(["git", "-C", str(target), "checkout", "-q", "--detach", "FETCH_HEAD"], check=True)
    actual = subprocess.check_output(["git", "-C", str(target), "rev-parse", "HEAD"], text=True).strip()
    if actual != revision:
        raise RuntimeError(f"Existing {target} is at {actual}, expected {revision}. Preserve your changes before replacing it.")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--revision", default=None, help="Exact Hugging Face commit; default resolves main once, then reuses the lock.")
    p.add_argument("--source-only", action="store_true")
    args = p.parse_args()
    checkout("https://github.com/lyramakesmusic/neuron-explorer.git", VENDOR / "neuron-explorer", EXPLORER_SHA)
    if args.source_only:
        return
    from huggingface_hub import model_info, snapshot_download
    lockpath = MODELS / "sources.lock.json"
    previous = json.loads(lockpath.read_text()) if lockpath.exists() else {}
    revision = args.revision or previous.get("revision") or model_info(MODEL_ID).sha
    if len(revision) != 40 or any(c not in "0123456789abcdef" for c in revision):
        raise ValueError("Use a full 40-character model commit.")
    path = snapshot_download(MODEL_ID, revision=revision, allow_patterns=[
        "*.json", "*.safetensors", "*.jinja", "tokenizer*", "vocab*", "merges*", "README.md", "LICENSE*"])
    atomic_json(lockpath, {"model_id": MODEL_ID, "revision": revision, "snapshot_path": path,
                          "explorer_commit": EXPLORER_SHA})
    print(f"Locked {MODEL_ID} at {revision}\nSnapshot: {path}")


if __name__ == "__main__":
    main()

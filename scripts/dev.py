#!/usr/bin/env python3
"""Development launcher: the Python API (serve.py) and the Vite dev server, both bound to 127.0.0.1.

    python3 scripts/dev.py --backend illustration
    python3 scripts/dev.py --backend reference
    python3 scripts/dev.py --backend llama --gguf models/gguf/Qwen3.5-4B-Q4_K_M.gguf

The browser talks only to the Vite port; Vite proxies /api to the Python server (ui/vite.config.ts), so browser
code uses relative URLs. Ctrl+C stops both child processes. The ready URL is printed only after both answer.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import ROOT, VENDOR  # noqa: E402  (also redirects every cache, including npm's, into ./cache)

UI = ROOT / "ui"
HOST = "127.0.0.1"


def port_in_use(port, host=HOST):
    with socket.socket() as probe:
        probe.settimeout(0.5)
        return probe.connect_ex((host, port)) == 0


def free_port(start, taken=(), limit=50):
    for port in range(start, start + limit):
        if port not in taken and not port_in_use(port):
            return port
    raise RuntimeError(f"No free port in {start}-{start + limit - 1}.")


def who_uses(port):
    if not shutil.which("lsof"):
        return ""
    out = subprocess.run(["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"], capture_output=True, text=True).stdout
    return "\n".join(out.strip().splitlines()[:3])


def resolve_ports(args):
    """Returns (ui_port, api_port). A busy port is an error unless --auto-port was given; the llama port is only checked."""
    wanted = [("UI", "ui_port", args.ui_port), ("API", "api_port", args.api_port)]
    chosen, problems = {}, []
    for label, key, port in wanted:
        if not port_in_use(port) and port not in chosen.values():
            chosen[key] = port
        elif args.auto_port:
            chosen[key] = free_port(port + 1, chosen.values())
            print(f"{label} port {port} is busy; using {chosen[key]}.", flush=True)
        else:
            problems.append(f"{label} port {port} is already in use.\n{who_uses(port)}".rstrip())
    if args.backend == "llama" and port_in_use(args.llama_port):
        problems.append(f"llama.cpp port {args.llama_port} is already in use; the managed llama-server needs it "
                        "(stop that server or pass --llama-port).\n" + who_uses(args.llama_port))
    if problems:
        raise SystemExit("\n".join(problems) + "\nStop the other process, pass another port, or use --auto-port.")
    return chosen["ui_port"], chosen["api_port"]


def probe(url, timeout=1.0):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status
    except (urllib.error.URLError, OSError, ValueError):
        return None


def wait_ready(url, procs, seconds):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        for name, proc in procs.items():
            if proc.poll() is not None:
                raise RuntimeError(f"{name} exited early with code {proc.returncode}.")
        if probe(url) == 200:
            return
        time.sleep(0.25)
    raise RuntimeError(f"Timed out after {seconds:.0f} s waiting for {url}")


def stop_all(procs):
    for proc in procs.values():
        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)  # each child leads its own process group (npm -> vite -> esbuild)
            except ProcessLookupError:
                pass
    deadline = time.monotonic() + 8
    for proc in procs.values():
        try:
            proc.wait(timeout=max(0.1, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()


def check_reference_python():
    code = "import torch, transformers"
    if subprocess.run([sys.executable, "-c", code], capture_output=True).returncode != 0:
        venv = VENDOR / "neuron-explorer/.venv/bin/python"
        print(f"WARNING: {sys.executable} cannot import torch/transformers, so the reference backend will fail on its "
              f"first comparison.\n         Re-run with the upstream environment: {venv} scripts/dev.py --backend reference",
              flush=True)


def find_gguf(name):
    """Absolute path, or relative to the repository root, or to ./cache (where setup_llama.py puts models/gguf/...)."""
    path = Path(name)
    for candidate in [path] if path.is_absolute() else [ROOT / path, ROOT / "cache" / path]:
        if candidate.is_file():
            return candidate
    return None


def build_parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--backend", choices=["illustration", "reference", "llama"], default="illustration")
    p.add_argument("--gguf", help="GGUF file for --backend llama (relative paths resolve from the repository root, then ./cache).")
    p.add_argument("--ui-port", type=int, default=5173)
    p.add_argument("--api-port", type=int, default=8792)
    p.add_argument("--llama-port", type=int, default=8081, help="Port of the managed llama-server (kept free).")
    p.add_argument("--auto-port", action="store_true", help="Use the next free port instead of failing on a conflict.")
    p.add_argument("--ready-timeout", type=float, default=90.0)
    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    serve_cmd = [sys.executable, str(ROOT / "serve.py"), "--backend", args.backend]
    if args.backend == "llama":
        if not args.gguf:
            parser.error("--gguf is required with --backend llama")
        gguf = find_gguf(args.gguf)
        if gguf is None:
            parser.error(f"GGUF not found: {args.gguf} (looked in the repository root and ./cache).\n"
                         "Download one with scripts/setup_llama.py (see README).")
        serve_cmd += ["--gguf", str(gguf), "--llama-port", str(args.llama_port)]
    if not shutil.which("npm"):
        raise SystemExit("npm was not found. Install Node.js 20+ (https://nodejs.org) and re-run.")
    if args.backend == "reference":
        check_reference_python()
    ui_port, api_port = resolve_ports(args)
    if not (UI / "node_modules").is_dir():
        print("Installing ui/ dependencies (npm ci) ...", flush=True)
        subprocess.run(["npm", "--prefix", str(UI), "ci", "--no-audit", "--no-fund"], check=True)

    env = {**os.environ, "LAB_API_PORT": str(api_port), "LAB_UI_PORT": str(ui_port)}
    procs = {}

    def launch(name, cmd, **kw):
        procs[name] = subprocess.Popen(cmd, cwd=ROOT, env=env, start_new_session=True, **kw)

    def on_signal(signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, on_signal)
    try:
        launch("API", serve_cmd + ["--port", str(api_port)])
        wait_ready(f"http://{HOST}:{api_port}/api/status", procs, args.ready_timeout)
        launch("Vite", ["npm", "--prefix", str(UI), "run", "dev", "--", "--host", HOST, "--port", str(ui_port),
                        "--strictPort"])
        wait_ready(f"http://{HOST}:{ui_port}/api/status", procs, args.ready_timeout)  # through the proxy: both ends work
        status = json.load(urllib.request.urlopen(f"http://{HOST}:{ui_port}/api/status", timeout=3))
        print(f"\nReady: http://{HOST}:{ui_port}   (API http://{HOST}:{api_port}, backend: {status['backend']})", flush=True)
        if args.backend == "reference":
            print("The reference model loads on the first comparison (about 10-15 s on an M4 Pro).", flush=True)
        print("Press Ctrl+C to stop both processes.", flush=True)
        while all(p.poll() is None for p in procs.values()):
            time.sleep(0.5)
        dead = [n for n, p in procs.items() if p.poll() is not None]
        print(f"{', '.join(dead)} stopped unexpectedly; shutting down.", flush=True)
        return 1
    except KeyboardInterrupt:
        print("\nStopping ...", flush=True)
        return 0
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr, flush=True)
        return 1
    finally:
        stop_all(procs)


if __name__ == "__main__":
    sys.exit(main())

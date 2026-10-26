"""Sequential llama-server comparisons: only one GGUF model process at a time."""
import json
import math
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from .core import ROOT, file_sha, presets


class LlamaBackend:
    name = "llama"

    def __init__(self, binary, model, vector_dir, port=8081, context=4096):
        self.binary = Path(binary).resolve()
        self.model = Path(model).resolve()
        self.vectors = Path(vector_dir).resolve()
        self.port, self.context = port, context
        self.model_hash = None
        if not self.binary.is_file() or not self.model.is_file():
            raise ValueError("llama-server binary and GGUF model must exist.")

    def _request(self, path, body=None, timeout=600):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.load(response)

    def compare(self, request):
        if request.get("component") is not None:
            raise ValueError("The llama backend runs whole exported presets; use the reference backend for components.")
        vector = self.vectors / (request["preset"] + ".gguf")
        manifest_path = vector.with_suffix(".json")
        if not vector.exists() or not manifest_path.exists():
            raise RuntimeError("Export this preset first: python scripts/export_vectors.py --all")
        manifest = json.loads(manifest_path.read_text())
        if manifest["preset_definition"] != presets()[request["preset"]] or manifest["baked_intensity"] != 1.0:
            raise RuntimeError("Vector manifest does not match the current preset at unit intensity.")
        if file_sha(vector) != manifest["vector_sha256"]:
            raise RuntimeError("Control-vector checksum mismatch.")
        if self.model_hash is None:
            self.model_hash = file_sha(self.model)
        texts, runs = {}, []
        for label, sign in [("baseline", 0), ("forward", 1), ("reverse", -1)]:
            with socket.socket() as probe:
                if probe.connect_ex(("127.0.0.1", self.port)) == 0:
                    raise RuntimeError(f"Port {self.port} is already in use. Stop that server or choose --llama-port.")
            command = [str(self.binary), "-m", str(self.model), "--alias", "qwen-lab",
                       "--host", "127.0.0.1", "--port", str(self.port), "-ngl", "99",
                       "-c", str(self.context), "--parallel", "1", "--jinja", "--reasoning", "off",
                       "--no-cache-prompt"]
            scale = sign * request["intensity"]
            if scale:
                command += ["--control-vector-scaled", f"{vector}:{scale}",
                            "--control-vector-layer-range", "1", "31"]
            log_dir = ROOT / "runs/server_logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            log_path = log_dir / f"{time.time_ns()}-{label}.log"
            started = time.monotonic()
            with log_path.open("wb") as logfile:
                proc = subprocess.Popen(command, stdout=logfile, stderr=subprocess.STDOUT)
                try:
                    deadline = time.monotonic() + 180
                    while True:
                        if proc.poll() is not None:
                            raise RuntimeError(f"llama-server exited; see {log_path}")
                        try:
                            self._request("/health", timeout=1)
                            break
                        except (urllib.error.URLError, TimeoutError, OSError):
                            if time.monotonic() > deadline:
                                raise RuntimeError(f"Server startup timed out; see {log_path}")
                            time.sleep(0.2)
                    ready = time.monotonic()
                    result = self._request("/v1/chat/completions", {
                        "model": "qwen-lab", "messages": [{"role": "user", "content": request["prompt"]}],
                        "temperature": 0, "seed": 42, "max_tokens": request["max_new"],
                        "cache_prompt": False, "stream": False, "logprobs": True, "top_logprobs": 10})
                    choice = result["choices"][0]
                    texts[label] = choice["message"].get("content") or ""
                    content = (choice.get("logprobs") or {}).get("content") or []
                    runs.append({"branch": label, "command": command, "finish_reason": choice["finish_reason"],
                                 "usage": result.get("usage"), "server_timings": result.get("timings"),
                                 "load_seconds": ready - started, "request_seconds": time.monotonic() - ready,
                                 # top-10 at the identical prompt boundary, as reported by llama-server
                                 "first_token_top_logprobs": content[0].get("top_logprobs") if content else None,
                                 "generated_pieces": [c.get("token") for c in content]})
                finally:
                    proc.terminate()
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait()
        calibration = []
        for row in manifest["calibration"]:
            r = dict(row)
            for key in ["dose", "activation_addition", "individual_write_norm"]:
                r[key] *= request["intensity"]
            calibration.append(r)
        return {"kind": "measured", "backend": self.name, **texts, "calibration": calibration,
                "diagnostics": None, "finish": "see branch_runs",
                "provenance": {"mode": "experimental residual-vector port from BF16 source columns",
                    "model_path": str(self.model), "model_sha256": self.model_hash,
                    "llama_server_sha256": file_sha(self.binary), "vector_sha256": manifest["vector_sha256"],
                    "source": manifest["provenance"], "sampling": "temperature 0; seed 42",
                    "thinking": False, "context": self.context,
                    "calibration_origin": "BF16 reference model, not remeasured in GGUF",
                    "equivalence": "algebraic for identical weights; quantized reproduction must be tested"},
                "branch_runs": runs}

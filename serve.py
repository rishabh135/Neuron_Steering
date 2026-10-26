#!/usr/bin/env python3
"""A single-command local UI. Demo mode has no third-party dependencies."""
import argparse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import threading
import time
import uuid
from urllib.parse import urlparse
from lab.core import ROOT, VECTORS, VENDOR, atomic_json, first_character_difference, presets, text_metrics, validate_request

RUN_ID = re.compile(r"[0-9a-f]{32}")


class App:
    def __init__(self, backend=None):
        self.backend = backend
        self.busy = threading.Lock()

    def compare(self, body):
        request = validate_request(body)
        if self.backend is None:
            raise ValueError("Illustration mode does not generate model replies. Start the reference or llama backend.")
        if not self.busy.acquire(blocking=False):
            raise BlockingIOError("A comparison is running. Please wait for it to finish.")
        try:
            started = time.monotonic()
            result = self.backend.compare(request)
            result.update({"schema_version": 1, "run_id": uuid.uuid4().hex,
                           "created_at": datetime.now(timezone.utc).isoformat(), "request": request,
                           "elapsed_seconds": time.monotonic() - started,
                           "metrics": {k: text_metrics(result[k]) for k in ["baseline", "forward", "reverse"]},
                           "first_character_difference": {k: first_character_difference(result["baseline"], result[k])
                                                          for k in ["forward", "reverse"]}})
            atomic_json(ROOT / "runs" / (result["run_id"] + ".json"), result)
            return result
        finally:
            self.busy.release()


def make_server(app, port=8792):
    class Handler(BaseHTTPRequestHandler):
        def allowed(self):
            allowed = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
            origin = self.headers.get("Origin")
            return (self.headers.get("Host") in allowed and
                    (not origin or urlparse(origin).netloc in allowed) and
                    self.headers.get("Sec-Fetch-Site") not in ("cross-site", "same-site"))

        def send_json(self, value, status=200):
            data = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if not self.allowed():
                return self.send_json({"error": "Local origin required."}, 403)
            path = urlparse(self.path).path
            if path == "/api/status":
                return self.send_json({"backend": app.backend.name if app.backend else "illustration",
                                       "busy": app.busy.locked(), "presets": presets()})
            if path == "/api/runs":  # saved measured comparisons, newest first, without the bulky fields
                rows = []
                for f in sorted((ROOT / "runs").glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True):
                    if not RUN_ID.fullmatch(f.stem):
                        continue
                    run = json.loads(f.read_text())
                    rows.append({"run_id": run["run_id"], "created_at": run["created_at"], "backend": run["backend"],
                                 **{k: run["request"].get(k) for k in ["preset", "component", "intensity", "prompt"]}})
                return self.send_json(rows)
            if path.startswith("/api/runs/"):
                run_id = path[len("/api/runs/"):]
                f = ROOT / "runs" / (run_id + ".json")
                if not RUN_ID.fullmatch(run_id) or not f.is_file():
                    return self.send_json({"error": "Unknown run."}, 404)
                return self.send_json(json.loads(f.read_text()))
            if path not in ("/", "/index.html"):
                return self.send_json({"error": "Not found."}, 404)
            data = (ROOT / "web/index.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            if not self.allowed():
                return self.send_json({"error": "Local origin required."}, 403)
            if self.path != "/api/compare":
                return self.send_json({"error": "Not found."}, 404)
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 32768:
                    raise ValueError("Request body must be 1 to 32,768 bytes.")
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                    raise ValueError("Use application/json.")
                body = json.loads(self.rfile.read(size))
                result = app.compare(body)
                self.send_json(result)
            except (ValueError, TypeError) as e:
                self.send_json({"error": str(e)}, 400)
            except BlockingIOError as e:
                self.send_json({"error": str(e)}, 409)
            except Exception as e:
                self.send_json({"error": f"{type(e).__name__}: {e}"}, 500)

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", choices=["illustration", "reference", "llama"], default="illustration")
    parser.add_argument("--port", type=int, default=8792)
    parser.add_argument("--explorer-root")
    parser.add_argument("--llama-server", default=str(VENDOR / "llama.cpp/build/bin/llama-server"))
    parser.add_argument("--gguf")
    parser.add_argument("--vector-dir", default=str(VECTORS))
    parser.add_argument("--llama-port", type=int, default=8081)
    args = parser.parse_args()
    backend = None
    if args.backend == "reference":
        from lab.reference import ReferenceBackend
        backend = ReferenceBackend(args.explorer_root)
    if args.backend == "llama":
        if not args.gguf:
            parser.error("--gguf is required for the llama backend")
        from lab.llama_backend import LlamaBackend
        backend = LlamaBackend(args.llama_server, args.gguf, args.vector_dir, args.llama_port)
    server = make_server(App(backend), args.port)
    print(f"Qwen neuron lab: http://127.0.0.1:{args.port} ({args.backend})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

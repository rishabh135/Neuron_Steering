"""scripts/dev.py: port handling, path resolution and the full launch when the UI dependencies are installed."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import unittest
import urllib.request
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import dev
from lab.core import ROOT


def busy_socket():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    s.listen()
    return s, s.getsockname()[1]


class Args:
    def __init__(self, **kw):
        self.ui_port, self.api_port, self.llama_port, self.backend, self.auto_port = 5173, 8792, 8081, "illustration", False
        self.__dict__.update(kw)


class PortTests(unittest.TestCase):
    def test_conflict_is_reported_not_ignored(self):
        s, port = busy_socket()
        try:
            with self.assertRaises(SystemExit) as cm:
                dev.resolve_ports(Args(api_port=port, ui_port=port + 1000 if port < 60000 else 20000))
            self.assertIn(f"API port {port} is already in use", str(cm.exception))
        finally:
            s.close()

    def test_auto_port_moves_to_a_free_port(self):
        s, port = busy_socket()
        try:
            ui, api = dev.resolve_ports(Args(api_port=port, ui_port=port + 2000 if port < 60000 else 21000, auto_port=True))
            self.assertNotEqual(api, port)
            self.assertFalse(dev.port_in_use(api))
        finally:
            s.close()

    def test_llama_port_must_stay_free(self):
        s, port = busy_socket()
        try:
            with self.assertRaises(SystemExit) as cm:
                dev.resolve_ports(Args(backend="llama", llama_port=port, ui_port=port + 1 if port < 60000 else 22000, api_port=port + 2 if port < 60000 else 22001))
            self.assertIn("llama.cpp port", str(cm.exception))
        finally:
            s.close()

    def test_gguf_lookup_checks_root_then_cache(self):
        self.assertIsNone(dev.find_gguf("models/gguf/does-not-exist.gguf"))
        self.assertEqual(dev.find_gguf(str(ROOT / "README.md")), ROOT / "README.md")

    def test_defaults_match_the_documented_ports(self):
        a = dev.build_parser().parse_args([])
        self.assertEqual((a.backend, a.ui_port, a.api_port, a.llama_port), ("illustration", 5173, 8792, 8081))


@unittest.skipUnless((ROOT / "ui/node_modules/.bin/vite").exists(), "run `npm --prefix ui ci` first")
class LaunchTests(unittest.TestCase):
    def test_launch_ready_url_proxy_and_clean_shutdown(self):
        ui, api = [dev.free_port(p) for p in (15173, 18792)]
        proc = subprocess.Popen([sys.executable, str(ROOT / "scripts/dev.py"), "--backend", "illustration", "--ui-port", str(ui), "--api-port", str(api)],
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
        try:
            ready = None
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                line = proc.stdout.readline()
                if line.startswith("Ready:"):
                    ready = line
                    break
            self.assertIsNotNone(ready, "launcher never printed a ready URL")
            self.assertIn(f"http://127.0.0.1:{ui}", ready)
            status = json.load(urllib.request.urlopen(f"http://127.0.0.1:{ui}/api/status", timeout=5))
            self.assertEqual(status["backend"], "illustration")
            req = urllib.request.Request(f"http://127.0.0.1:{ui}/api/status", headers={"Origin": "https://evil.example"})
            with self.assertRaises(urllib.error.HTTPError) as cm:
                urllib.request.urlopen(req, timeout=5)
            self.assertEqual(cm.exception.code, 403)
            with urllib.request.urlopen(f"http://127.0.0.1:{ui}/chapter/mathematics", timeout=5) as r:
                self.assertEqual(r.status, 200)
        finally:
            proc.send_signal(signal.SIGINT)
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                self.fail("launcher did not stop on Ctrl+C")
        time.sleep(0.5)
        self.assertFalse(dev.port_in_use(ui), "Vite still running")
        self.assertFalse(dev.port_in_use(api), "API still running")


if __name__ == "__main__":
    unittest.main()

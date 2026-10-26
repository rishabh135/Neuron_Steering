from http.client import HTTPConnection
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import serve


class SyntheticBackend:
    name = "synthetic-test-only"
    def compare(self, request):
        return {"kind": "synthetic-test-only", "backend": self.name, "baseline": "original",
                "forward": "changed", "reverse": "opposite", "provenance": {}, "diagnostics": None}


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = patch.object(serve, "ROOT", Path(self.tmp.name))
        self.root.start()
        self.app = serve.App(SyntheticBackend())
        self.server = serve.make_server(self.app, 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.root.stop()
        self.tmp.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        h = {"Content-Type": "application/json", **(headers or {})}
        connection.request(method, path, body=json.dumps(body) if body is not None else None, headers=h)
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_comparison_persisted_with_provenance(self):
        status, result = self.request("POST", "/api/compare", {"prompt": "hello", "intensity": 0})
        self.assertEqual(status, 200)
        path = Path(self.tmp.name) / "runs" / (result["run_id"] + ".json")
        saved = json.loads(path.read_text())
        self.assertEqual(saved["request"]["prompt"], "hello")
        self.assertEqual(saved["kind"], "synthetic-test-only")
        self.assertIn("first_character_difference", saved)

    def test_cross_origin_rejected(self):
        status, _ = self.request("POST", "/api/compare", {"prompt": "hi"}, {"Origin": "https://example.com"})
        self.assertEqual(status, 403)

    def test_untrusted_host_rejected(self):
        status, _ = self.request("GET", "/api/status", headers={"Host": "example.com"})
        self.assertEqual(status, 403)

    def test_invalid_body_and_busy_errors(self):
        self.assertEqual(self.request("POST", "/api/compare", {"prompt": ""})[0], 400)
        self.app.busy.acquire()
        try:
            self.assertEqual(self.request("POST", "/api/compare", {"prompt": "hello"})[0], 409)
        finally:
            self.app.busy.release()

    def test_lock_released_on_backend_error(self):
        with patch.object(self.app.backend, "compare", side_effect=RuntimeError("test failure")):
            self.assertEqual(self.request("POST", "/api/compare", {"prompt": "hello"})[0], 500)
        self.assertFalse(self.app.busy.locked())

    def test_paths_not_exposed(self):
        self.assertEqual(self.request("GET", "/../presets.json")[0], 404)

    def test_illustration_does_not_generate(self):
        self.app.backend = None
        self.assertEqual(self.request("POST", "/api/compare", {"prompt": "hello"})[0], 400)

    def test_saved_runs_listed_and_fetched(self):
        _, result = self.request("POST", "/api/compare", {"prompt": "hello", "intensity": 0.25, "component": 0})
        status, rows = self.request("GET", "/api/runs")
        self.assertEqual(status, 200)
        self.assertEqual(rows[0]["run_id"], result["run_id"])
        self.assertEqual((rows[0]["component"], rows[0]["intensity"]), (0, 0.25))
        self.assertEqual(self.request("GET", "/api/runs/" + result["run_id"])[1]["forward"], "changed")
        for bad in ["../presets", "x" * 32, result["run_id"][:-1], "0" * 32]:
            self.assertEqual(self.request("GET", "/api/runs/" + bad)[0], 404)

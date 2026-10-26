"""Static serving of the React build: routing, safety, headers, and the original offline page."""
from http.client import HTTPConnection
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import serve


class StaticUiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.ui = Path(cls.tmp.name) / "dist"
        (cls.ui / "assets").mkdir(parents=True)
        (cls.ui / "index.html").write_text("<!doctype html><title>react app</title>")
        (cls.ui / "assets/app-abc123.js").write_text("console.log(1)")
        (cls.ui / "assets/font.woff2").write_bytes(b"wOF2")
        (cls.ui / ".secret").write_text("no")
        (Path(cls.tmp.name) / "outside.txt").write_text("outside")
        (cls.ui / "link.txt").symlink_to(Path(cls.tmp.name) / "outside.txt")
        cls.server = serve.make_server(serve.App(None), 0, cls.ui)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.legacy = serve.make_server(serve.App(None), 0)
        cls.legacy_thread = threading.Thread(target=cls.legacy.serve_forever, daemon=True)
        cls.legacy_thread.start()

    @classmethod
    def tearDownClass(cls):
        for s, t in [(cls.server, cls.thread), (cls.legacy, cls.legacy_thread)]:
            s.shutdown()
            s.server_close()
            t.join()
        cls.tmp.cleanup()

    def get(self, path, server=None, headers=None):
        server = server or self.server
        c = HTTPConnection("127.0.0.1", server.server_port, timeout=5)
        c.request("GET", path, headers=headers or {})
        r = c.getresponse()
        body = r.read()
        c.close()
        return r.status, dict(r.getheaders()), body

    def test_root_and_route_refresh_serve_the_app(self):
        for path in ["/", "/index.html", "/chapter/3", "/runs/abc"]:
            status, headers, body = self.get(path)
            self.assertEqual((status, b"react app" in body), (200, True), path)
            self.assertIn("text/html", headers["Content-Type"])
            self.assertEqual(headers["Cache-Control"], "no-store")

    def test_assets_typed_and_cached(self):
        status, headers, _ = self.get("/assets/app-abc123.js")
        self.assertEqual(status, 200)
        self.assertIn("javascript", headers["Content-Type"])
        self.assertIn("immutable", headers["Cache-Control"])
        self.assertEqual(self.get("/assets/font.woff2")[1]["Content-Type"], "font/woff2")

    def test_missing_files_are_404_not_the_app(self):
        for path in ["/assets/missing.js", "/missing.css", "/api/nope", "/api/runs/zzz"]:
            self.assertEqual(self.get(path)[0], 404, path)

    def test_traversal_dotfiles_and_symlinks_blocked(self):
        for path in ["/.secret", "/assets/../.secret", "/%2e%2e/outside.txt", "/..%2foutside.txt",
                     "/assets/%2e%2e/%2e%2e/outside.txt", "/link.txt", "/%00"]:
            status, _, body = self.get(path)
            self.assertNotIn(b"outside", body, path)
            self.assertNotEqual(body, b"no", path)
            self.assertIn(status, (200, 404), path)  # extension-less odd paths fall back to the SPA shell only
            if "." in path.rsplit("/", 1)[-1]:
                self.assertEqual(status, 404, path)

    def test_csp_and_nosniff_on_app_html(self):
        _, headers, _ = self.get("/")
        self.assertIn("script-src 'self'", headers["Content-Security-Policy"])
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")

    def test_original_page_still_reachable(self):
        legacy_html = (serve.ROOT / "web/index.html").read_bytes()
        for path in ["/legacy", "/legacy/", "/legacy/index.html"]:
            status, headers, body = self.get(path)
            self.assertEqual((status, body), (200, legacy_html), path)
            self.assertNotIn("Content-Security-Policy", headers)

    def test_default_invocation_unchanged(self):
        self.assertEqual(self.get("/", self.legacy)[2], (serve.ROOT / "web/index.html").read_bytes())
        self.assertEqual(self.get("/chapter/3", self.legacy)[0], 404)
        self.assertEqual(self.get("/assets/x.js", self.legacy)[0], 404)

    def test_host_and_origin_checks_apply_to_static_files(self):
        self.assertEqual(self.get("/", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.get("/", headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.get("/assets/app-abc123.js", headers={"Sec-Fetch-Site": "cross-site"})[0], 403)
        port = self.server.server_port
        self.assertEqual(self.get("/", headers={"Host": f"localhost:{port}", "Origin": f"http://localhost:{port}"})[0], 200)

    def test_status_publishes_limits_and_capabilities(self):
        status, _, body = self.get("/api/status")
        data = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(data["backend"], "illustration")
        self.assertEqual((data["limits"]["intensity_max"], data["limits"]["max_new_max"]), (1.25, 512))
        self.assertFalse(data["generates"])
        self.assertEqual(data["ui"], "react")
        self.assertEqual(json.loads(self.get("/api/status", self.legacy)[2])["ui"], "legacy")


if __name__ == "__main__":
    unittest.main()

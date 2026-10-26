from collections import Counter
import json
from pathlib import Path
import re
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import ROOT, presets

HTML = (ROOT / "web/index.html").read_text()


class FrontendTests(unittest.TestCase):
    def test_embedded_presets_match_presets_json(self):
        embedded = json.loads(re.search(r"const PRESETS=(\{.*?\});\n", HTML).group(1))
        self.assertEqual(embedded, presets())

    def test_unique_ids(self):
        ids = Counter(re.findall(r'\bid="([^"]+)"', HTML))
        self.assertEqual([i for i, n in ids.items() if n > 1], [])

    def test_offline_no_external_assets(self):
        self.assertEqual(re.findall(r'<(?:script|link|img|iframe)[^>]+(?:src|href)="https?:', HTML), [])
        self.assertNotIn("@import", HTML)
        self.assertNotIn("url(http", HTML)

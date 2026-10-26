import json
import math
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import first_character_difference, presets, pushes_for, text_metrics, validate_request


class CoreTests(unittest.TestCase):
    def test_exact_pair_signs(self):
        self.assertEqual(pushes_for({"preset": "evil_pair", "intensity": 1}),
                         [(14, 8949, 1.0, "add"), (13, 7956, -1.0, "add")])

    def test_intensity_applied_once(self):
        pushes = pushes_for({"preset": "mixed", "intensity": 0.5})
        self.assertEqual([p[2] for p in pushes], [0.3, 0.3, -0.25, 0.2, -0.15])

    def test_all_coordinates_in_model(self):
        for preset in presets().values():
            for row in preset["neurons"]:
                self.assertIn(row["layer"], range(32))
                self.assertIn(row["neuron"], range(9216))

    def test_nonfinite_and_bool_rejected(self):
        for value in [math.nan, math.inf, -math.inf, True, "0.5", [], {}]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_request({"prompt": "hello", "intensity": value})

    def test_invalid_request_boundaries(self):
        for request in [[], {}, {"prompt": " "}, {"prompt": 5}, {"prompt": "x" * 4001},
                        {"prompt": "a", "max_new": 2.5}, {"prompt": "a", "max_new": True},
                        {"prompt": "a", "max_new": 0}, {"prompt": "a", "preset": []},
                        {"prompt": "a", "intensity": -0.1}, {"prompt": "a", "intensity": 2}]:
            with self.subTest(request=request), self.assertRaises(ValueError):
                validate_request(request)

    def test_valid_zero_and_limits(self):
        self.assertEqual(validate_request({"prompt": "x", "intensity": 0})["intensity"], 0)
        self.assertEqual(validate_request({"prompt": "x", "max_new": 512})["max_new"], 512)

    def test_difference_and_repetition(self):
        self.assertIsNone(first_character_difference("same", "same"))
        self.assertEqual(first_character_difference("abc", "abcd"), 3)
        self.assertEqual(first_character_difference("abc", "axc"), 1)
        self.assertIsNone(text_metrics("short")["distinct_word_4gram_ratio"])
        self.assertLess(text_metrics("a b c d a b c d a b c d")["distinct_word_4gram_ratio"], 1)

    def test_component_runs_one_listed_neuron(self):
        request = validate_request({"prompt": "x", "preset": "mixed", "intensity": 0.5, "component": 2})
        self.assertEqual(pushes_for(request), [(12, 2920, -0.25, "add")])
        self.assertNotIn("component", validate_request({"prompt": "x"}))
        for bad in [-1, 5, 1.0, True, "0"]:
            with self.subTest(component=bad), self.assertRaises(ValueError):
                validate_request({"prompt": "x", "preset": "mixed", "component": bad})

    def test_env_sh_matches_python_cache_redirect(self):
        from lab.core import CACHE, CACHE_ENV, ROOT
        exported = dict(line[len("export "):].split("=", 1) for line in (ROOT / "env.sh").read_text().splitlines()
                        if line.startswith("export "))
        self.assertEqual({k: v.strip('"').replace("$LAB_CACHE/", "") for k, v in exported.items()}, CACHE_ENV)
        import os, tempfile
        self.assertEqual(os.environ["HF_HOME"], str(CACHE / "huggingface"))
        self.assertTrue(Path(tempfile.gettempdir()).resolve().is_relative_to(CACHE.resolve()))

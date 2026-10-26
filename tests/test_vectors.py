from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    import numpy as np
except ImportError:
    np = None
from scripts.export_vectors import layer_directions, write_vectors


@unittest.skipIf(np is None, "numpy not installed")
class VectorTests(unittest.TestCase):
    def test_residual_equivalence_independent_linear_algebra(self):
        rng = np.random.default_rng(42)
        weight = rng.normal(size=(64, 128)).astype(np.float32)
        activation = rng.normal(size=(7, 128)).astype(np.float32)
        pushes = [(14, 37, 0.6, "add"), (14, 91, -0.4, "add")]
        columns = {(14, n): weight[:, n] for n in [37, 91]}
        direction = layer_directions(columns, {14: 8.5}, pushes, hidden_size=64)[14]
        changed = activation.copy()
        for _, n, dose, _ in pushes:
            changed[:, n] += dose * 8.5 / np.linalg.norm(weight[:, n])
        expected = changed @ weight.T
        actual = activation @ weight.T + direction
        np.testing.assert_allclose(actual, expected, atol=1e-5, rtol=1e-5)

    def test_individual_norm_and_index(self):
        col = np.array([1.2, 1.6], dtype=np.float32)
        directions = layer_directions({(14, 2): col}, {14: 10}, [(14, 2, 0.6, "add")], hidden_size=2)
        self.assertEqual(set(directions), set(range(1, 32)))
        self.assertAlmostEqual(float(np.linalg.norm(directions[14])), 6.0, places=5)
        self.assertTrue(np.all(directions[13] == 0))
        self.assertTrue(np.all(directions[15] == 0))

    def test_same_layer_cancellation(self):
        col = np.array([3.0, 4.0], dtype=np.float32)
        result = layer_directions({(14, 2): col, (14, 3): col}, {14: 10},
                                 [(14, 2, 1, "add"), (14, 3, -1, "add")], hidden_size=2)
        np.testing.assert_array_equal(result[14], np.zeros(2))

    def test_unsupported_interventions_fail(self):
        for push in [(0, 1, 1, "add"), (14, 1, 0, "mul")]:
            with self.assertRaises(ValueError):
                layer_directions({}, {}, [push])

    def test_invalid_column_rejected(self):
        for col in [np.zeros(2), np.array([np.nan, 1]), np.ones(3)]:
            with self.assertRaises(ValueError):
                layer_directions({(14, 1): col}, {14: 10}, [(14, 1, 1, "add")], hidden_size=2)

    def test_gguf_official_reader_roundtrip(self):
        try:
            from gguf import GGUFReader
        except ImportError:
            self.skipTest("gguf not installed")
        col = np.array([1.2, 1.6], dtype=np.float32)
        directions = layer_directions({(14, 2): col}, {14: 10}, [(14, 2, .6, "add")], hidden_size=2)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "test.gguf"
            write_vectors(path, directions)
            reader = GGUFReader(str(path))
            self.assertEqual(len(reader.tensors), 31)
            tensors = {t.name: t for t in reader.tensors}
            self.assertNotIn("direction.0", tensors)
            for layer in range(1, 32):
                np.testing.assert_array_equal(tensors[f"direction.{layer}"].data, directions[layer])

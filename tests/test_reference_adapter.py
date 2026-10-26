from pathlib import Path
import sys
import threading
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    import torch
except ImportError:
    torch = None
from lab.reference import ReferenceBackend, TokenRecorder, first_token_difference

EOS, VOCAB = 9, 10


class FakeTok:
    chat_template = "fake"
    pad_token_id = 0

    def decode(self, ids, skip_special_tokens=False):
        return "".join("abcdefghi"[t] for t in ids if t != EOS)

    def convert_tokens_to_ids(self, token):
        return EOS


class FakeModel:
    """Next-token logits depend only on whether a push is active: a test double, not a language model."""

    def __init__(self, rt):
        self.rt = rt

    def __call__(self, input_ids, use_cache=False, logits_to_keep=1):
        logits = torch.zeros(1, 1, VOCAB)
        logits[0, 0, 4 if self.rt._push else 1] = 5.0
        return type("Out", (), {"logits": logits})()


class FakeRuntime:
    """Implements the slice of upstream Runtime that the adapter uses; steer_multi follows its decode/yield order."""

    def __init__(self, scripts):
        self.tok, self.dev, self.lock = FakeTok(), "cpu", threading.Lock()
        self._push = self._heads = None
        self.model, self.scripts, self.seen_tok = FakeModel(self), scripts, []

    def layer_resid_p50(self, layer):
        return 10.0

    def down_col(self, layer, n):
        return torch.tensor([1.2, 1.6])  # norm 2

    def chat_ids(self, prompt):
        return [1, 2, 3]

    def _push_entry(self, layer, n, dose, mode, rows):
        return (layer, n, mode, torch.tensor([r * dose * 5.0 for r in rows]))

    def steer_multi(self, pushes, rows_messages, max_new=200, cancel=None):
        self.seen_tok.append(self.tok)
        with self.lock:
            self._push = pushes
            try:
                out, done = [[], [], []], [False] * 3
                for step in range(max_new):
                    for r in range(3):
                        if done[r]:
                            continue
                        t = self.scripts[r][step] if step < len(self.scripts[r]) else EOS
                        if t == EOS:
                            done[r] = True
                            continue
                        out[r].append(t)
                        text = self.tok.decode(out[r], skip_special_tokens=True)
                        yield r, text[-1]
                    if all(done):
                        break
            finally:
                self._push = None
        yield None, None

    def next_logprobs(self, text, chat=True, prefix="", pushes=None, heads=None):
        lp = torch.log_softmax(self.model(None).logits[0, -1], -1)
        self._push = pushes
        alt = torch.log_softmax(self.model(None).logits[0, -1], -1)
        self._push = None
        return lp, alt

    def read(self, layer, n, text, chat=True, pushes=None, heads=None):
        return {"units": [{"text": "x", "act": 0.5 if pushes else 0.25, "pieces": [0.5]}]}


@unittest.skipIf(torch is None, "torch not installed")
class ReferenceAdapterTests(unittest.TestCase):
    def backend(self, scripts):
        b = ReferenceBackend()
        b.rt, b.torch, b.provenance, b.load_seconds = FakeRuntime(scripts), torch, {}, 0.0
        return b

    def test_rows_tokens_finish_and_fork(self):
        # row 0 = forward, 1 = baseline, 2 = reverse (upstream order); forward diverges at token 2
        b = self.backend([[1, 2, 4, 4], [1, 2, 3, 3], [1, 2, 3, 3]])
        r = b.compare({"prompt": "hi", "preset": "sarcasm", "intensity": 0.5, "max_new": 4})
        self.assertEqual((r["forward"], r["baseline"], r["reverse"]), ("bcee", "bcdd", "bcdd"))
        self.assertEqual(r["branch_tokens"]["baseline"]["ids"], [1, 2, 3, 3])
        self.assertEqual(r["branch_tokens"]["baseline"]["finish"], "length")
        fork = r["diagnostics"]["forks"]["forward"]
        self.assertEqual((fork["first_token_difference"], fork["baseline_token"], fork["branch_token"]), (2, "d", "e"))
        self.assertIsNone(r["diagnostics"]["forks"]["reverse"]["first_token_difference"])
        self.assertIsInstance(b.rt.seen_tok[0], TokenRecorder)  # recorder was installed during generation
        self.assertIsInstance(b.rt.tok, FakeTok)  # and the real tokenizer restored afterwards
        self.assertIsNone(b.rt._push)
        cal = r["calibration"][0]
        self.assertAlmostEqual(cal["activation_addition"], 0.5 * 10.0 / 2.0)
        act = r["activations"][0]
        self.assertEqual(act["units"][0]["baseline"], 0.25)
        self.assertIn("before this hook's own addition", act["capture"])

    def test_early_eos_is_a_fork_and_finish_eos(self):
        b = self.backend([[1, 2], [1, 2, 3, 3], [1, 2, 3, 3]])
        r = b.compare({"prompt": "hi", "preset": "sarcasm", "intensity": 1.0, "max_new": 4})
        self.assertEqual(r["branch_tokens"]["forward"]["finish"], "eos")
        fork = r["diagnostics"]["forks"]["forward"]
        self.assertEqual((fork["first_token_difference"], fork["branch_token"]), (2, ""))  # <|im_end|> decodes empty

    def test_tokenizer_restored_after_generation_error(self):
        b = self.backend([[1], [1], [1]])
        b.rt.steer_multi = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
        with self.assertRaises(RuntimeError):
            b.compare({"prompt": "hi", "preset": "sarcasm", "intensity": 1.0, "max_new": 2})
        self.assertIsInstance(b.rt.tok, FakeTok)

    def test_refuses_to_calibrate_with_active_hook(self):
        b = self.backend([[1], [1], [1]])
        b.rt._push = [("stale",)]
        with self.assertRaises(RuntimeError):
            b.calibration([(15, 3920, 1.0, "add")])

    def test_first_token_difference(self):
        self.assertIsNone(first_token_difference([1, 2], [1, 2]))
        self.assertEqual(first_token_difference([1, 2], [1, 3]), 1)
        self.assertEqual(first_token_difference([1], [1, 2]), 1)

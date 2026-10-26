import json
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab.core import file_sha, presets
from lab.llama_backend import LlamaBackend


class LlamaProcessTests(unittest.TestCase):
    def test_three_fresh_processes_and_signed_scales(self):
        # A synthetic HTTP server checks process/transport behavior, not model behavior.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            binary = root / "fake-llama-server"
            source = '''import sys,json
from http.server import BaseHTTPRequestHandler,HTTPServer
args=sys.argv[1:]
port=int(args[args.index('--port')+1])
scale=args[args.index('--control-vector-scaled')+1].rsplit(':',1)[1] if '--control-vector-scaled' in args else '0'
class H(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200); self.end_headers(); self.wfile.write(b'{"status":"ok"}')
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  assert body['temperature']==0 and body['cache_prompt'] is False and body['logprobs'] is True and body['top_logprobs']==10
  lp={'content':[{'token':'syn','logprob':-0.1,'top_logprobs':[{'token':'syn','logprob':-0.1}]}]}
  data=json.dumps({'choices':[{'message':{'content':'synthetic scale '+scale},'finish_reason':'stop','logprobs':lp}],'usage':{'completion_tokens':3},'timings':{'predicted_n':3}}).encode()
  self.send_response(200); self.end_headers(); self.wfile.write(data)
 def log_message(self,*args):pass
HTTPServer(('127.0.0.1',port),H).serve_forever()
'''
            binary.write_text("#!" + sys.executable + "\n" + source)
            binary.chmod(0o755)
            model = root / "fake.gguf"
            model.write_bytes(b"synthetic model file for transport tests only")
            vectors = root / "vectors"
            vectors.mkdir()
            vector = vectors / "sarcasm.gguf"
            vector.write_bytes(b"synthetic vector")
            vector.with_suffix(".json").write_text(json.dumps({
                "preset_definition": presets()["sarcasm"], "baked_intensity": 1.0,
                "vector_sha256": file_sha(vector), "calibration": [], "provenance": {}}))
            with socket.socket() as s:
                s.bind(("127.0.0.1", 0))
                port = s.getsockname()[1]
            backend = LlamaBackend(binary, model, vectors, port)
            with patch("lab.llama_backend.ROOT", root):
                result = backend.compare({"prompt": "hello", "preset": "sarcasm", "intensity": 0.5, "max_new": 5})
            self.assertEqual(result["baseline"], "synthetic scale 0")
            self.assertEqual(result["forward"], "synthetic scale 0.5")
            self.assertEqual(result["reverse"], "synthetic scale -0.5")
            self.assertEqual(len(list((root / "runs/server_logs").glob("*.log"))), 3)
            for run in result["branch_runs"]:
                self.assertEqual(run["finish_reason"], "stop")
                self.assertEqual(run["first_token_top_logprobs"], [{"token": "syn", "logprob": -0.1}])
                self.assertEqual((run["generated_pieces"], run["server_timings"]), (["syn"], {"predicted_n": 3}))
                self.assertGreaterEqual(run["load_seconds"], 0)
                self.assertGreaterEqual(run["request_seconds"], 0)
            with self.assertRaises(ValueError):
                backend.compare({"prompt": "hello", "preset": "sarcasm", "intensity": 0.5, "max_new": 5, "component": 0})
            with socket.socket() as s:
                self.assertNotEqual(s.connect_ex(("127.0.0.1", port)), 0)

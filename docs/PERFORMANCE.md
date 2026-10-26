# Measured on this Mac (26 October 2026)

Apple M4 Pro, 48 GB unified memory, macOS 26.7.1. Reference backend: BF16 on MPS, torch 2.14.1, transformers 5.20.1, model `Qwen/Qwen3.5-4B@851bf6e8`, prompt "Explain why the sky is blue in three sentences.", sarcasm recipe, intensity 0.5, `max_new` 128, via `POST /api/compare` to `serve.py --backend reference`. Memory is `footprint -p <pid>` (physical footprint, which includes MPS-resident weights; plain RSS is only about 0.3 GB and is not a useful number here).

| | First request | Second request |
| --- | --- | --- |
| Model load inside the request | 23.4 s | 0 s |
| Generation (3 batch rows) | 10.3 s | 9.6 s |
| Decode steps (longest row) | 88 | 88 |
| Decode steps per second (batch of 3) | 8.5 | 9.2 |
| First-token + fork diagnostics | 4.1 s | 3.5 s |
| Activation reads | 1.2 s | 1.1 s |
| Whole request | 41.6 s | 14.2 s |
| Physical footprint of the server process | 9,738 MB (peak 9,740 MB) | 9,737 MB (peak 9,754 MB) |

README.md's earlier "~15.7 decode steps/s" came from a different prompt and session; this run was slower, and the difference was not investigated. A single prompt on one day is a sample, not a benchmark.

llama.cpp Q4_K_M port, same machine, prompt "I finally finished my first marathon. What do you think?", sarcasm at intensity 1.0, `max_new` 96: three fresh `llama-server` processes, server start 0.6-1.0 s each, request 2.3-3.3 s each, 13.1 s in total through the Vite proxy. Memory of the llama-server processes was not measured.

Not measured: UI frame rate, three.js frame time, page load time, Firefox performance.

## Bundle sizes (production build, `npm --prefix ui run build`)

Main chunk 726 kB (231 kB gzip); the lazy 3D chunk 559 kB (139 kB gzip) loads only for the 3D tab; fonts are separate woff2 files; CSS 75 kB (15 kB gzip). The portable artifact is 257 KB of source including 73 KB of inlined CSS.

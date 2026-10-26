#!/usr/bin/env bash
# Full evaluation order against a running `serve.py` backend: zero-dose sham, then every supplied neuron alone at
# 0.25/0.5/1.0, then the multi-neuron recipes. Usage: scripts/run_battery.sh [max_new] [phase...]
# Phases: sham components mixtures (default: all three); presets runs every recipe whole at $DOSES (default 0.5,1),
# the form the llama.cpp backend accepts. Env: URL (default http://127.0.0.1:8792), BACKEND_LABEL (e.g. llama-Q8_0).
set -euo pipefail
cd "$(dirname "$0")/.."
source env.sh
PY=${PY:-cache/vendor/neuron-explorer/.venv/bin/python}
MAX_NEW=${1:-128}; shift || true
PHASES=${*:-sham components mixtures}
run() { "$PY" scripts/run_experiments.py --max-new "$MAX_NEW" --url "${URL:-http://127.0.0.1:8792}" \
          ${BACKEND_LABEL:+--backend-label "$BACKEND_LABEL"} "$@"; }
for phase in $PHASES; do
  case $phase in
    sham) run --preset sarcasm --doses 0 --repeat 2 --tag sham ;;
    components)
      # preset:component pairs covering all nine supplied neurons, each with its listed signed dose
      for pc in sarcasm:0 evil_pair:0 evil_pair:1 sycophancy_a:0 sycophancy_b:0 condolences:0 \
                chill_friend:0 chill_friend:1 mixed:0; do
        run --preset "${pc%:*}" --component "${pc#*:}" --doses 0.25,0.5,1 --repeat 1
      done ;;
    presets)
      for preset in sarcasm evil_pair sycophancy_a sycophancy_b condolences chill_friend mixed; do
        run --preset "$preset" --doses "${DOSES:-0.5,1}" --repeat 1
      done ;;
    mixtures)
      for preset in evil_pair chill_friend mixed; do run --preset "$preset" --doses 0.25,0.5,1 --repeat 1; done ;;
    *) echo "unknown phase $phase" >&2; exit 2 ;;
  esac
done

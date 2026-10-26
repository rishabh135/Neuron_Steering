# Source from the repository root before any shell command for this project:  source env.sh
# Keeps every download, cache, temporary file and build output inside ./cache. Python entry points set the
# same variables themselves (lab/core.py CACHE_ENV); tests/test_core.py checks that the two lists match.
LAB_CACHE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)/cache"
export HF_HOME="$LAB_CACHE/huggingface"
export XDG_CACHE_HOME="$LAB_CACHE/xdg"
export TORCH_HOME="$LAB_CACHE/torch"
export UV_CACHE_DIR="$LAB_CACHE/uv"
export UV_PYTHON_INSTALL_DIR="$LAB_CACHE/uv-python"
export UV_TOOL_DIR="$LAB_CACHE/uv-tools"
export PIP_CACHE_DIR="$LAB_CACHE/pip"
export npm_config_cache="$LAB_CACHE/npm"
export MPLCONFIGDIR="$LAB_CACHE/matplotlib"
export PYTHONPYCACHEPREFIX="$LAB_CACHE/pycache"
export TMPDIR="$LAB_CACHE/tmp"
mkdir -p "$HF_HOME" "$XDG_CACHE_HOME" "$TORCH_HOME" "$UV_CACHE_DIR" "$UV_PYTHON_INSTALL_DIR" "$UV_TOOL_DIR" \
  "$PIP_CACHE_DIR" "$npm_config_cache" "$MPLCONFIGDIR" "$PYTHONPYCACHEPREFIX" "$TMPDIR"

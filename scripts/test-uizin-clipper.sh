#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tool_dir="$repo_root/tools/uizin-clipper"
venv_dir="$tool_dir/.venv"

python_bin="python3"

if ! "$python_bin" - <<'PY' >/dev/null 2>&1
import yaml
PY
then
  if [ ! -x "$venv_dir/bin/python" ]; then
    "$python_bin" -m venv "$venv_dir"
  fi
  "$venv_dir/bin/python" -m pip install -r "$tool_dir/requirements.txt" --quiet
  python_bin="$venv_dir/bin/python"
fi

cd "$tool_dir"
"$python_bin" -m unittest discover -s tests -t .

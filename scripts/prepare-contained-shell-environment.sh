#!/usr/bin/env bash

counterlab_prepare_contained_shell_environment() {
  local root_dir="$1"
  local cache_root="${root_dir}/node_modules/.cache/counterlab-v6.1"

  [[ -f "${root_dir}/COUNTERLAB_REPO_ROOT" ]] || {
    echo "CounterLab repository marker is missing." >&2
    return 2
  }

  export HOME="${cache_root}/home"
  export TMPDIR="${cache_root}/tmp"
  export XDG_CACHE_HOME="${cache_root}/xdg-cache"
  export XDG_CONFIG_HOME="${cache_root}/xdg-config"
  export XDG_DATA_HOME="${cache_root}/xdg-data"
  export PYTHONPYCACHEPREFIX="${cache_root}/pycache"
  export GIT_CONFIG_NOSYSTEM=1
  export GIT_CONFIG_GLOBAL="${cache_root}/gitconfig"

  node "${root_dir}/scripts/assert-contained-path.mjs" \
    "${cache_root}" "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" \
    "${XDG_CONFIG_HOME}" "${XDG_DATA_HOME}" "${PYTHONPYCACHEPREFIX}" \
    "${GIT_CONFIG_GLOBAL}"
  mkdir -p \
    "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" \
    "${XDG_DATA_HOME}" "${PYTHONPYCACHEPREFIX}"
  node "${root_dir}/scripts/assert-contained-path.mjs" \
    "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" \
    "${XDG_DATA_HOME}" "${PYTHONPYCACHEPREFIX}" "${GIT_CONFIG_GLOBAL}"

  [[ "$(git -C "${root_dir}" rev-parse --show-toplevel)" == "${root_dir}" ]] || {
    echo "Command requires the verified CounterLab Git root." >&2
    return 2
  }
}

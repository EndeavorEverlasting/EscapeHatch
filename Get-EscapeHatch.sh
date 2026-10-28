#!/usr/bin/env bash
# Review before running. User-scoped Linux Mint bootstrap; never sudo, reset, or bind to LAN.
set -euo pipefail
umask 077
REPO_URL='https://github.com/EndeavorEverlasting/EscapeHatch.git'
SOURCE="${ESCAPEHATCH_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/escapehatch/source}"
APP="$SOURCE/artifacts/escape-hatch"
RUNTIME="$SOURCE/scripts/linux/escapehatch_runtime.py"

usage() {
  cat <<'EOF'
EscapeHatch on Linux Mint
  bash Get-EscapeHatch.sh --check   # read-only prerequisite / checkout inspection
  bash Get-EscapeHatch.sh --install # confirm clone, dependencies, then open
  bash Get-EscapeHatch.sh --start   # start installed app
  bash Get-EscapeHatch.sh --status  # verified running status
  bash Get-EscapeHatch.sh --stop    # identity-bound graceful stop
  bash Get-EscapeHatch.sh --update  # explicitly fast-forward a clean main checkout

Installation uses your account only. It runs git clone and npm install after your
confirmation. No sudo/apt, force-reset, background auto-update, or phone/LAN bind.
EOF
}

prerequisites() {
  [[ "$(uname -s)" == Linux ]] || { echo 'Linux required.' >&2; exit 2; }
  for cmd in git node npm python3; do
    command -v "$cmd" >/dev/null || { echo "Missing $cmd. Install it through a trusted OS or Node provider before proceeding." >&2; exit 2; }
  done
  node -e 'const v=process.versions.node.split(".").map(Number); process.exit(v[0]>22||(v[0]===22&&v[1]>=16)?0:1)' || {
    echo 'Node.js >=22.16 is required. Upgrade Node.js before proceeding.' >&2; exit 2;
  }
}

verify_source() {
  [[ -d "$SOURCE/.git" && -f "$SOURCE/AGENTS.md" && -f "$SOURCE/artifacts/escape-hatch/package.json" ]] || {
    echo "Not an EscapeHatch checkout: $SOURCE" >&2; exit 2;
  }
  local origin
  origin="$(git -C "$SOURCE" remote get-url origin)"
  case "$origin" in
    "$REPO_URL"|https://github.com/EndeavorEverlasting/EscapeHatch|git@github.com:EndeavorEverlasting/EscapeHatch.git) ;;
    *) echo "Unexpected git origin ($origin); refusing changes" >&2; exit 2 ;;
  esac
}

install_dependencies() {
  [[ -f "$APP/package.json" ]] || { echo 'Missing app package.json' >&2; exit 2; }
  # No app lockfile exists at the observed main baseline; do not create one as installer side effect.
  if [[ -f "$APP/package-lock.json" ]]; then
    (cd "$APP" && npm ci --no-audit --no-fund)
  else
    (cd "$APP" && npm install --no-save --package-lock=false --no-audit --no-fund)
  fi
}

runtime() {
  [[ -f "$RUNTIME" ]] || { echo "Linux runtime script missing: $RUNTIME" >&2; exit 2; }
  python3 "$RUNTIME" "$1"
}

mode="${1:---check}"
case "$mode" in
  --help|-h) usage ;;
  --check)
    echo "Install directory: $SOURCE"
    prerequisites
    if [[ -e "$SOURCE" ]]; then verify_source; echo 'Existing source: verified (no update performed)'; else echo 'No installed source yet'; fi
    echo 'Prerequisites: passed. No files changed.'
    ;;
  --install)
    prerequisites
    echo "EscapeHatch source: $REPO_URL"
    echo "Install location: $SOURCE"
    echo 'This will clone source (if absent), install app npm packages, and launch a local-only service.'
    read -r -p 'Proceed? [y/N] ' answer
    [[ "$answer" == [yY] ]] || { echo 'Installation cancelled.'; exit 0; }
    if [[ -e "$SOURCE" ]]; then
      verify_source
      echo 'Reusing existing checkout without pulling/resetting.'
    else
      mkdir -p "$(dirname "$SOURCE")"
      git clone --depth 1 "$REPO_URL" "$SOURCE"
      verify_source
    fi
    install_dependencies
    runtime start
    ;;
  --start) prerequisites; verify_source; runtime start ;;
  --status) verify_source; runtime status ;;
  --stop) verify_source; runtime stop ;;
  --update)
    prerequisites; verify_source
    status_code=0
    runtime status >/dev/null 2>&1 || status_code=$?
    if [[ "$status_code" == 0 ]]; then
      echo 'Stop the verified running app before updating: bash Get-EscapeHatch.sh --stop' >&2; exit 2
    elif [[ "$status_code" != 1 ]]; then
      echo 'Existing runtime state is unverified; update refused until reconciled.' >&2; exit 2
    fi
    [[ -z "$(git -C "$SOURCE" status --porcelain)" ]] || { echo 'Checkout has local changes; update refused.' >&2; exit 2; }
    [[ "$(git -C "$SOURCE" branch --show-current)" == 'main' ]] || { echo 'Update is supported only on main.' >&2; exit 2; }
    echo "This will fetch and fast-forward $SOURCE from canonical main, then reinstall app dependencies."
    read -r -p 'Proceed? [y/N] ' answer
    [[ "$answer" == [yY] ]] || { echo 'Update cancelled.'; exit 0; }
    git -C "$SOURCE" fetch origin main
    git -C "$SOURCE" merge --ff-only FETCH_HEAD
    install_dependencies
    runtime start
    ;;
  *) usage; exit 2 ;;
esac

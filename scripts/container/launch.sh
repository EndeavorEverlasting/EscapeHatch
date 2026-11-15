#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."

container=escapehatch-desktop
image=escapehatch-desktop:local
volume=escapehatch-desktop-workspace
owner=dev.escapehatch.launcher
port=21030
no_browser=false

fail() { printf '%s\n' "$*" >&2; exit 1; }
show_help() {
  printf '%s\n' 'EscapeHatch: Hey, press me, click me.' \
    'Usage: launch.sh [open | stop | --help] [--no-browser]' \
    'Open builds and starts EscapeHatch, then opens the Journey tutorial.' \
    'Stop closes this launcher’s container and keeps your workspace.'
}

action=open
case "${1:-open}" in
  open|stop) action="$1"; shift ;;
  --no-browser|'') ;;
  --help|-h) show_help; exit 0 ;;
  *) show_help; exit 2 ;;
esac
if [[ "${1:-}" == --no-browser ]]; then no_browser=true; shift; fi
[[ "$#" == 0 ]] || { show_help; exit 2; }

command -v docker >/dev/null || fail 'Install Docker Desktop or Docker Engine, then click this launcher again. https://docs.docker.com/get-docker/'
endpoint=${DOCKER_HOST:-}
if [[ -n "${DOCKER_CONTEXT:-}" || -z "$endpoint" ]]; then
  endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}') || fail 'Choose a local Docker context and try again.'
fi
case "$endpoint" in unix://*) ;; *) fail 'Choose your local Docker socket so EscapeHatch can open on this computer.' ;; esac
[[ "$(docker info --format '{{.OSType}}')" == linux ]] || fail 'Start Docker with Linux containers, then try again.'

inspect() {
  docker container inspect --format '{{index .Config.Labels "dev.escapehatch.launcher"}}|{{.State.Running}}' "$container" 2>/dev/null
}
current=$(inspect || true)
[[ -z "$current" || "$current" == "$owner|"* ]] || fail "Docker already has a different container named $container."
if [[ "$action" == stop ]]; then
  if [[ "$current" == "$owner|true" ]]; then docker stop "$container" >/dev/null; fi
  printf '%s\n' 'EscapeHatch is closed. Your workspace is still here for next time.'
  exit 0
fi

printf '%s\n' 'Hey, press me, click me.' 'Let’s get your escape hatch open.'
if [[ -z "$current" ]]; then
  printf '%s\n' 'Warming up the hatch. The first build may take a few minutes.'
  docker build --tag "$image" . || fail 'The build stopped. Check Docker’s output above, then click again to retry.'
  if ! docker run --detach --init --rm --name "$container" --label "$owner=$owner" \
    --publish "127.0.0.1:$port:$port" --mount "type=volume,source=$volume,target=/workspace" "$image" >/dev/null; then
    [[ "$(inspect || true)" == "$owner|true" ]] || fail "EscapeHatch could not start. Check Docker and whether port $port is already in use."
  fi
fi
printf '%s\n' 'Waiting for your private workspace…'
launch_url=
for ((attempt=0; attempt<60; attempt++)); do
  if launch_url=$(docker exec "$container" node --experimental-strip-types container-server.ts launch-url 2>/dev/null); then break; fi
  [[ "$(inspect || true)" == "$owner|true" ]] || fail 'EscapeHatch stopped during startup. Click again after checking Docker.'
  sleep 1
done
[[ "$launch_url" =~ ^http://localhost:21030/__launch/[a-f0-9]{64}$ ]] || fail 'The workspace did not become ready. Check docker logs escapehatch-desktop.'
if [[ "$no_browser" == true ]]; then
  printf '%s\n' "$launch_url"
elif [[ "$(uname -s)" == Darwin ]] && open "$launch_url"; then
  printf '%s\n' 'Your tutorial is open. Follow the chick.'
elif [[ "$(uname -s)" != Darwin ]] && xdg-open "$launch_url"; then
  printf '%s\n' 'Your tutorial is open. Follow the chick.'
else
  printf 'Open this private link in your browser on this computer:\n%s\n' "$launch_url"
fi

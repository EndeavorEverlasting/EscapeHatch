#!/bin/bash
# Run on a disposable Linux Docker host. Uses the real launcher and its Docker volume.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
launcher=./scripts/container/launch.sh
container=escapehatch-desktop
volume=escapehatch-desktop-workspace
if docker container inspect "$container" >/dev/null 2>&1 || docker volume inspect "$volume" >/dev/null 2>&1; then
  echo 'Smoke test requires a clean, disposable Docker host.' >&2
  exit 1
fi
trap '$launcher stop >/dev/null 2>&1 || true; docker volume rm "$volume" >/dev/null 2>&1 || true' EXIT

read_launch_url() {
  "$launcher" --no-browser | tail -n 1
}
fetch_local() {
  curl --silent --show-error --max-time 10 --noproxy '*' --resolve escapehatch.localhost:21030:127.0.0.1 "$@"
}
origin=http://escapehatch.localhost:21030
url=$(read_launch_url)
[[ "$url" == "$origin"/__launch/* ]]
[[ "$(read_launch_url)" == "$url" ]]
[[ "$(docker exec "$container" id -u)" != 0 ]]
[[ "$(docker port "$container" 21030/tcp)" == '127.0.0.1:21030' ]]
[[ "$(fetch_local -o /dev/null -w '%{http_code}' "$origin/__escapehatch/workspace")" == 401 ]]
[[ "$(fetch_local -o /dev/null -w '%{http_code}' -H 'Host: foreign.example' "$url")" == 403 ]]
[[ "$(fetch_local -o /dev/null -w '%{http_code}' -H 'Sec-Fetch-Site: cross-site' "$url")" == 403 ]]

# Pass the launch link through stdin. The test visits the existing tutorial and saves through the UI.
printf '%s\n' "$url" | node artifacts/escape-hatch/tests/container-launch.browser.mjs
"$launcher" stop
[[ "$(fetch_local -o /dev/null -w '%{http_code}' "$origin" 2>/dev/null || true)" == 000 ]]
new_url=$(read_launch_url)
[[ "$url" != "$new_url" ]]
[[ "$(fetch_local -o /dev/null -w '%{http_code}' "$url")" == 401 ]]
printf '%s\n' "$new_url" | node artifacts/escape-hatch/tests/container-launch.browser.mjs restore

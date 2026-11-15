#!/bin/bash
"$(dirname -- "$0")/scripts/container/launch.sh" "$@"
status=$?
if [[ "$status" != 0 && -t 0 ]]; then
  read -r -p "Press Enter to close this window…"
fi
exit "$status"

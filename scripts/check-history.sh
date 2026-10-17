#!/bin/sh
# Runs check-commit-msg.sh over every commit reachable from HEAD.
set -eu

here=$(dirname "$0")
msg=$(mktemp)
trap 'rm -f "$msg"' EXIT

failed=0
for sha in $(git rev-list HEAD); do
  git log -1 --format=%B "$sha" > "$msg"
  if ! "$here/check-commit-msg.sh" "$msg"; then
    echo "  in commit $sha" >&2
    failed=1
  fi
done
exit "$failed"

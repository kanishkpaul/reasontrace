#!/bin/sh
# Rejects a commit message that credits an AI tool as an author or generator.
# AGENTS.md forbids these lines outright; this script is the enforcement, run
# by .githooks/commit-msg on each new message and by check-history.sh in CI.
#
# Human co-authors are fine. A line is rejected only when it is an author or
# session trailer naming an AI tool, or a "generated with/by" credit to one.
set -eu

msg_file="$1"
tools='claude|anthropic|openai|codex|chatgpt|gpt-|copilot|gemini|cursor|devin|windsurf|[^a-z]ai([^a-z]|$)'
pattern="^(co-authored-by|assisted-by|generated-by):.*($tools)|^claude-session:|generated (with|by) .*($tools)"

# Git strips comment lines before storing a message, so ignore them here too.
if grep -v '^#' "$msg_file" | grep -inE "$pattern" >&2; then
  echo "error: the line(s) above credit an AI tool; remove them (AGENTS.md, rule 1)" >&2
  exit 1
fi

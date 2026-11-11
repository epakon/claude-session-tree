#!/bin/sh
# Fast path: exit unless a pending marker exists for this session.
input=$(cat)
session=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
registry="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/session-tree"
[ -n "$session" ] && [ -e "$registry/pending/$session" ] || exit 0
printf '%s' "$input" | exec node "$(dirname "$0")/log-hook.mjs" UserPromptSubmit

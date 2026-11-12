#!/bin/sh
# Runs on every prompt in every session, so it exits before starting Node unless a result is waiting for this session.
input=$(cat)
session=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
registry="${SESSION_TREE_DIR:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/session-tree}"
[ -n "$session" ] && [ -e "$registry/pending/$session" ] || exit 0
printf '%s' "$input" | exec node "$(dirname "$0")/../scripts/st.mjs" hook-prompt

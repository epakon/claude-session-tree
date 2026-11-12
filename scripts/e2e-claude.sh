#!/bin/sh
# End-to-end check against real Claude Code in headless mode: parent, /fork, fork session, /return, delivery to the parent.
# Uses a temporary registry; costs a few cents with the haiku model. Usage: sh scripts/e2e-claude.sh
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
export SESSION_TREE_DIR="$work/registry"
claude_p() { claude -p --plugin-dir "$repo/plugins/tree" --model haiku --permission-mode default "$@"; }
step() { printf '\n== %s\n' "$1"; }

parent=$(uuidgen | tr 'A-Z' 'a-z')
step "parent session $parent"
claude_p --session-id "$parent" "We are designing the config format for a CLI tool. Decision so far: TOML, not YAML, because comments and types matter. Reply with: ok"

step "/tree:fork"
fork_out=$(claude_p --resume "$parent" "/tree:fork 'Config validation' focus: how to validate the TOML schema --last 1 --print")
echo "$fork_out"
launch=$(printf '%s' "$fork_out" | sed -n "s/.*sh '\([^']*\.sh\)'.*/\1/p" | head -n 1)
[ -n "$launch" ] || { echo "FAIL: no launch script in /fork output"; exit 1; }
child=$(sed -n "s/.*--session-id '\([^']*\)'.*/\1/p" "$launch")
brief=$(sed -n "s/.*\$(cat '\([^']*\)').*/\1/p" "$launch")
echo "child session $child"
echo "--- brief"; cat "$brief"

step "fork session works on the brief"
claude_p --session-id "$child" "$(cat "$brief")

Answer in at most 5 short bullet points." | tail -n 8

step "/tree:return"
claude_p --resume "$child" "/tree:return"

step "parent receives the result with its next prompt"
claude_p --resume "$parent" "In one sentence: what did the Config validation fork conclude? If you have no fork result in context, reply exactly: NO RESULT"

step "registry state"
node "$repo/plugins/tree/scripts/st.mjs" forks --session "$parent"
node "$repo/plugins/tree/scripts/st.mjs" tree
fork_json=$(ls "$SESSION_TREE_DIR"/forks/*.json)
grep -q '"deliveredAt": "20' "$fork_json" && echo "PASS: result delivered to the parent" || { echo "FAIL: result not delivered"; exit 1; }
echo "work dir: $work"

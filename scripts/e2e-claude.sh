#!/bin/sh
# End-to-end check against real Claude Code in headless mode. Uses a temporary registry and the haiku model
# (about 15 short calls, a few cents). Usage: sh scripts/e2e-claude.sh
#
# Scenarios, in one flow:
#   1. parent -> fork -> work in the fork -> /tree:return -> the parent receives the result
#   2. the fork continues and returns again: the new result replaces the old one and reaches the parent
#   3. the fork forks again (a grandchild): the grandchild returns to the fork, the fork returns to the parent
#
# Each fork is told a codeword to put in its result, so the checks can find it in what the next session answers.
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
export SESSION_TREE_DIR="$work/registry"
st="$repo/plugins/tree/scripts/st.mjs"
claude_p() { claude -p --plugin-dir "$repo/plugins/tree" --model haiku --permission-mode default "$@"; }
step() { printf '\n== %s\n' "$1"; }

contains() { printf '%s' "$1" | grep -qi -- "$2"; }
check() { # check "<what is expected>" <command...>
  what=$1; shift
  if "$@"; then echo "PASS: $what"; else echo "FAIL: $what"; exit 1; fi
}
fork_file() { grep -l "\"childSessionId\": \"$1\"" "$SESSION_TREE_DIR"/forks/*.json | head -n 1; }
field() { node -e 'const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]]; console.log(v ?? "")' "$1" "$2"; }
short() { printf '%s' "$1" | cut -c1-8; }

# fork_from <session to fork from> <arguments for /tree:fork>
# Runs /tree:fork with --print and sets $launch, $child and $brief for the new fork.
fork_from() {
  fork_out=$(claude_p --resume "$1" "/tree:fork $2 --print")
  echo "$fork_out"
  launch=$(printf '%s' "$fork_out" | sed -n "s/.*sh '\([^']*\.sh\)'.*/\1/p" | head -n 1)
  [ -n "$launch" ] || { echo "FAIL: no launch script in /tree:fork output"; exit 1; }
  child=$(sed -n "s/.*--session-id '\([^']*\)'.*/\1/p" "$launch")
  brief=$(sed -n "s/.*\$(cat '\([^']*\)').*/\1/p" "$launch")
  echo "child session $child"
  echo "--- brief"; cat "$brief"
}

parent=$(uuidgen | tr 'A-Z' 'a-z')
step "parent session $parent"
claude_p --session-id "$parent" "We are designing the config format for a CLI tool. Decision so far: TOML, not YAML, because comments and types matter. Reply with: ok"

# 1. One fork, one return ----------------------------------------------------------------------------------
step "1. /tree:fork"
fork_from "$parent" "'Config validation' focus: how to validate the TOML schema --last 1"
fork1=$child
f1file=$(fork_file "$fork1")

step "1. fork session works on the brief"
claude_p --session-id "$fork1" "$(cat "$brief")

The codeword for this fork is PLUM-17. Put the codeword in the Outcome of every result you return.
Answer in at most 5 short bullet points." | tail -n 8

step "1. /tree:return"
claude_p --resume "$fork1" "/tree:return"
returned1=$(field "$f1file" returnedAt)
check "the result file holds the codeword" grep -q "PLUM-17" "$SESSION_TREE_DIR/results/$(short "$fork1").md"

step "1. parent receives the result with its next prompt"
answer=$(claude_p --resume "$parent" "What codeword did the Config validation fork result contain? If you have no fork result in context, reply exactly: NO RESULT")
echo "$answer"
check "the parent answers with the first codeword" contains "$answer" "PLUM-17"
check "the fork is marked delivered" test -n "$(field "$f1file" deliveredAt)"

# 2. The same fork returns again ---------------------------------------------------------------------------
step "2. the fork continues and returns a second time"
claude_p --resume "$fork1" "New finding: the codeword is now MANGO-42. Put MANGO-42 in the Outcome of the next result. Reply with: ok"
claude_p --resume "$fork1" "/tree:return"
returned2=$(field "$f1file" returnedAt)
check "returnedAt moved forward" test "$returned1" != "$returned2"
check "deliveredAt was reset until the parent reads it" test -z "$(field "$f1file" deliveredAt)"
check "the result file was replaced" grep -q "MANGO-42" "$SESSION_TREE_DIR/results/$(short "$fork1").md"

step "2. parent receives the second result"
answer=$(claude_p --resume "$parent" "What is the current codeword of the Config validation fork? If you have no fork result in context, reply exactly: NO RESULT")
echo "$answer"
check "the parent answers with the second codeword" contains "$answer" "MANGO-42"
check "the second result is marked delivered" test -n "$(field "$f1file" deliveredAt)"

# 3. A fork inside the fork ----------------------------------------------------------------------------------
step "3. /tree:fork inside the fork (a grandchild)"
fork_from "$fork1" "'Error message format' focus: wording of validation errors"
fork2=$child
f2file=$(fork_file "$fork2")
check "the grandchild's parent is the first fork" test "$(field "$f2file" parentSessionId)" = "$fork1"
check "labels are numbered per parent" test "$(field "$f2file" label)" = "$(field "$f1file" label)"

step "3. grandchild works and returns"
claude_p --session-id "$fork2" "$(cat "$brief")

The codeword for this fork is KIWI-99. Put the codeword in the Outcome of every result you return.
Answer in at most 3 short bullet points." | tail -n 6
claude_p --resume "$fork2" "/tree:return"
check "the grandchild's result waits for the first fork" test -e "$SESSION_TREE_DIR/pending/$fork1"
check "nothing waits for the root yet" test ! -e "$SESSION_TREE_DIR/pending/$parent"

step "3. first fork receives the grandchild's result"
answer=$(claude_p --resume "$fork1" "What codeword did the Error message format fork result contain? If you have no such fork result in context, reply exactly: NO RESULT")
echo "$answer"
check "the first fork answers with the grandchild's codeword" contains "$answer" "KIWI-99"
check "the grandchild is marked delivered" test -n "$(field "$f2file" deliveredAt)"

step "3. first fork returns again, now including the grandchild's outcome"
claude_p --resume "$fork1" "Include the codeword KIWI-99 from the Error message format fork in the Outcome of the next result, together with MANGO-42. Reply with: ok"
claude_p --resume "$fork1" "/tree:return"
answer=$(claude_p --resume "$parent" "What codewords does the latest Config validation fork result contain? If there is no newer fork result in context, reply exactly: NO RESULT")
echo "$answer"
check "the root hears about the grandchild's codeword through the first fork" contains "$answer" "KIWI-99"

# Registry and tree -------------------------------------------------------------------------------------------
step "registry state"
node "$st" list --session "$parent"
node "$st" list --session "$fork1"
node "$st" tree
tree_html="$SESSION_TREE_DIR/tree.html"
check "the tree has two fork arrows" test "$(grep -o '"kind": *"fork"' "$tree_html" | wc -l | tr -d ' ')" = 2
check "the tree has two result arrows" test "$(grep -o '"kind": *"return"' "$tree_html" | wc -l | tr -d ' ')" = 2
echo "work dir: $work"

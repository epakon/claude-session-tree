---
name: forks
description: List this conversation's forks and whether each has returned, or bring a returned result here by hand with "pull <fork>".
argument-hint: "[pull <label|fork ID>]"
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/st.mjs *)
---

Output from the session-tree plugin:

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/st.mjs forks --session ${CLAUDE_SESSION_ID} $ARGUMENTS`

If the output above is a list of forks, show it to the user exactly as it is, with nothing added.

If it is a fork result (it starts with `## Fork`), it has now been delivered to this conversation. Treat it as the outcome of that subtopic, and reply with one line: `Pulled the result of fork <label> "<topic>".`

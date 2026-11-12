---
name: view
description: Open the session tree in the browser, showing conversations, their forks, briefs and returned results.
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/st.mjs *)
---

!`node ${CLAUDE_PLUGIN_ROOT}/scripts/st.mjs tree --open`

Reply with the line above only.

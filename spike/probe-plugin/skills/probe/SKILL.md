---
name: probe
description: Spike probe that reports substituted placeholders and runs a heredoc command.
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/echo.mjs *)
---

Session placeholder: ${CLAUDE_SESSION_ID}
Arguments placeholder: $ARGUMENTS

Injected line: !`node ${CLAUDE_PLUGIN_ROOT}/scripts/echo.mjs inject ${CLAUDE_SESSION_ID} $ARGUMENTS`

Run exactly this Bash command, unchanged:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/echo.mjs heredoc ${CLAUDE_SESSION_ID} <<'EOF'
line one "quoted" $notavar
line two
EOF
```

Then reply with four lines and nothing else:
1. The session placeholder line above, verbatim.
2. The arguments placeholder line above, verbatim.
3. The injected line above, verbatim.
4. The Bash command output verbatim, or the exact error if it failed or was denied.

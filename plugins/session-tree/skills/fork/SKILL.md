---
name: fork
description: Fork a subtopic of this conversation into a new interactive Claude Code session that starts from a short brief. Only the fork's result comes back here.
argument-hint: <topic> [focus: ...; skip: ...] [--last N] [--review] [--print] | go <label>
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/st.mjs *)
---

Arguments: $ARGUMENTS

## If the arguments start with `go`

Start a drafted fork. Run this Bash command, adding `--print` if the arguments contain it:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/st.mjs go <label> --parent ${CLAUDE_SESSION_ID}
```

Reply with the script's output only.

## Otherwise, create a fork

1. Read the arguments:
   - **Topic:** the quoted text, or the words before any flag or `focus:` / `skip:`. If there is no topic, ask the user for one and stop.
   - **Scope:** any `focus: ...` and `skip: ...` text.
   - **Flags:** `--last N`, `--review`, `--print`.
2. Write the brief for a new session that has none of this conversation's context. Keep it under 300 words, in Markdown, with these sections:
   - **Goal:** what the fork should work out.
   - **Context:** the facts and decisions from this conversation that the fork needs.
   - **Constraints:** requirements and things already ruled out.
   - **Expected result:** what the fork should return when it is done.

   Follow the scope: cover what `focus` asks for and leave out what `skip` excludes. If `--last` is given, don't quote recent messages; the script copies them verbatim.
3. Run one Bash command in exactly this form. The brief goes on stdin through the quoted heredoc. Put the topic and scope in single quotes, replacing any `'` inside them with `’`. Include `--scope`, `--last`, `--review` and `--print` only when given.

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/st.mjs fork --parent ${CLAUDE_SESSION_ID} --topic '<topic>' --scope '<scope>' --last <N> --review --print <<'BRIEF'
   <brief>
   BRIEF
   ```

4. Reply with the script's output only. Don't repeat the brief.

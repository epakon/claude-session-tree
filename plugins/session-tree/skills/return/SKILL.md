---
name: return
description: Finish this fork and send its result back to the parent conversation. The parent receives only the result, with the user's next message there.
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/st.mjs *)
---

1. Write the result for the parent conversation. It is the only thing the parent will see of this fork, so make it self-contained. Base it on this whole conversation and on the expected result named in the brief. Keep it under 4000 characters (about 600 words), in Markdown, with these sections:
   - **Outcome:** the answer or decision first, in one or two sentences.
   - **Key decisions:** what was decided and why, including rejected alternatives worth knowing.
   - **Artifacts:** files created or changed (with paths), commands, links.
   - **Open questions:** anything unresolved and suggested next steps.
2. Run one Bash command in exactly this form, with the result on stdin through the quoted heredoc:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/st.mjs return --session ${CLAUDE_SESSION_ID} <<'RESULT'
   <result>
   RESULT
   ```

3. If the script says this session is not a registered fork and your context names a Fork ID, run the same command again with `--fork <Fork ID>` added after `--session ${CLAUDE_SESSION_ID}`.
4. Reply with the script's output only. Don't repeat the result.

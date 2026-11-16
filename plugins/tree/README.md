# Session Tree for Claude Code

Split a complex conversation into focused forks. A fork is a new Claude Code session that starts from a short brief instead of the whole conversation. When the fork is done, only its result comes back to the main conversation. A browser view shows the conversations and their forks as a tree.

**Claude Code only.** The plugin opens forks in a local terminal and reads Claude Code's session files on your machine, so it doesn't work in Claude Cowork or claude.ai.

## Install

```sh
claude plugin marketplace add epakon/claude-session-tree
claude plugin install tree@claude-session-tree
```

Restart Claude Code afterwards.

## Commands

| Command | Run it in | What it does |
| :- | :- | :- |
| `/tree:fork <topic>` | The main conversation | Claude writes a brief of under 300 words, and a new Terminal window opens with a fork session that starts from it. |
| `/tree:return` | The fork | Claude writes a self-contained result and saves it. The main conversation receives it with your next message there. |
| `/tree:list` | Anywhere | Lists the conversation's forks and whether each has returned. |
| `/tree:view` | Anywhere | Opens the tree view in your browser. |

## What the plugin runs, reads and writes

- **Scripts it runs:** the commands run `scripts/st.mjs` with Node.js, and a hook runs `hooks/prompt-check.sh` on every prompt. The hook exits at once unless a fork result is waiting for the session.
- **Programs it starts:** `/tree:fork` starts a new `claude` session in a macOS Terminal window through `osascript`. `--review` opens the brief in Cursor, VS Code or the default text editor. `/tree:view` opens the tree page in your default browser.
- **Files it reads:** Claude Code's session files under `~/.claude/projects` (titles and the last exchanges you ask for with `--last N`), and its own files below.
- **Files it writes:** briefs, results and fork records in `~/.claude/session-tree/`, which you can open and read.
- **Environment variables it reads:** `CLAUDE_CONFIG_DIR`, `SESSION_TREE_DIR`, `SESSION_TREE_CLAUDE_ARGS`, `TERM_PROGRAM` and `VSCODE_GIT_ASKPASS_NODE` (the last two only to tell Cursor from VS Code when opening the brief for review; the second is checked for the word "cursor" and its value is not used otherwise). It reads no credentials.
- **Network:** none. Nothing leaves your machine, and the tree page loads no external resources.
- **What it adds to a conversation:** a fork result is added to the parent conversation as context with your next message there, and a short notice tells you so.

The full usage guide, the data formats and the source are at https://github.com/epakon/claude-session-tree. The license is Apache-2.0.

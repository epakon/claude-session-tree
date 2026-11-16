# Privacy

Session Tree is a Claude Code plugin that runs entirely on your computer. It has no server and no account, and its author receives no data from it.

## What it handles

- **Conversation content.** To make a brief or a result, the plugin reads Claude Code's local session files under `~/.claude/projects` (titles and the last exchanges you ask for with `--last N`). A brief or a result is written by Claude from your conversation, so it can contain whatever the conversation contains, including names, email addresses or other personal data you typed.
- **Working folders.** Each fork record stores the folder where the session ran, which can include your user name.

## What it stores, and where

Briefs, results, fork records, launch scripts and the tree page are written as plain files to `~/.claude/session-tree/` (or to the folder named by `SESSION_TREE_DIR` or `CLAUDE_CONFIG_DIR`). You can open and read all of them. They stay on your computer until you delete them. To remove everything the plugin has stored, delete that folder.

## What it sends

Nothing. The plugin has no network code, no analytics and no telemetry, and the tree page loads no external resources.

Claude Code itself works as usual. A fork starts a normal Claude Code session, and a fork result is added to the parent conversation as context. That conversation is handled by Claude Code under your own Anthropic terms and privacy policy, not by this plugin.

## Questions

Open an issue at https://github.com/epakon/claude-session-tree/issues.

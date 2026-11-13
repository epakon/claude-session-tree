# Session Tree for Claude Code

Split a complex conversation into focused forks. A fork is a new Claude Code session that starts from a short brief instead of the whole conversation. When the fork is done, only its result comes back to the main conversation, so the main conversation stays short and free of the subtask's noise. A browser view shows the whole tree: each conversation, its forks, their briefs and their results.

**Claude Code only.** The plugin runs forks in a local terminal and reads Claude Code's session files on your machine, so it doesn't work in Claude Cowork or claude.ai.

![Session tree viewer](docs/tree.png)

## How it differs from the built-in commands

Claude Code's own `/fork` and `/branch` copy the **whole** conversation into the new session, and nothing comes back. `/subtask` sends a result back, but its background subagent also inherits the full conversation and runs without you. `/tree:fork` and `/tree:return` keep both sides lean:
- The fork starts from a short, scoped brief, not a copy of the conversation.
- You work in the fork interactively.
- Only the result returns to the main conversation.
- The tree view shows how the conversations relate.

The commands are namespaced (`/tree:fork`), so they can't be confused with the built-in `/fork`.

## Install

```sh
claude plugin marketplace add epakon/claude-session-tree
claude plugin install tree@claude-session-tree
```

To install from a local clone instead, pass its path to `claude plugin marketplace add`.

Restart Claude Code afterwards so the plugin is active from the start of each session.

### Update

`marketplace add` doesn't update a marketplace you've already added, and it fails if the marketplace was added from a different source. To update an installed plugin, use these commands instead:

```sh
claude plugin marketplace update claude-session-tree
claude plugin update tree@claude-session-tree
```

Then restart Claude Code, or run `/reload-plugins` in a running session.

If you installed from a local clone, run `git pull` in it. Claude Code reads the plugin straight from the clone's folder, so `claude plugin update` says there is nothing to update; restart Claude Code or run `/reload-plugins` to load the new files.

## Use

Each command is a skill in [`plugins/tree/skills/`](plugins/tree/skills). The commands are namespaced, so `fork` becomes `/tree:fork`. You start them yourself; Claude never runs them on its own.

| Command | Run it in | What to expect |
| :- | :- | :- |
| [`/tree:fork <topic>`](plugins/tree/skills/fork/SKILL.md) | The main conversation | Claude writes a short brief (under 300 words: goal, context, constraints, expected result) and a new Terminal window opens with a fork session that starts from it. You can add `focus: ...; skip: ...`, `--last N`, `--review` and `--print`. Only the brief's text is produced in the main conversation, never the fork's work. |
| [`/tree:fork go <label>`](plugins/tree/skills/fork/SKILL.md) | The main conversation | Starts a fork you drafted with `--review`, after you edited its brief. |
| [`/tree:return`](plugins/tree/skills/return/SKILL.md) | The fork | Claude writes a self-contained result (outcome, key decisions, artifacts, open questions; under about 4,000 characters) and saves it. The main conversation receives it with your next message there. Afterwards, type `/exit` to end the fork session. |
| [`/tree:list`](plugins/tree/skills/list/SKILL.md) | Anywhere | Shows the conversation's forks and whether each has returned. |
| `/tree:list pull <fork>` | Anywhere | Brings a returned result into the current conversation by hand, for example after `/clear` started a new session. |
| [`/tree:view`](plugins/tree/skills/view/SKILL.md) | Anywhere | Opens the tree of conversations and forks in your browser. Nothing is added to the conversation. |

A typical round:
1. In the main conversation, run `/tree:fork "OAuth2 option"`. A new Terminal window opens with the fork, which already knows the goal and the relevant context.
2. Work on the subtopic in the fork as in any Claude Code session.
3. When you're done, run `/tree:return` in the fork, then type `/exit` to end the fork session. Its Terminal window stays open until you close it.
4. Go back to the main conversation and carry on. With your next message, Claude receives the fork's result, and you see a short notice that the fork was merged.

Forks can fork again; the tree view shows every level.

### Scoping a fork

Options for `/tree:fork` can be combined, for example:

```text
/tree:fork "OAuth2 option" focus: token refresh; skip: UI --last 2 --review
```

- **`focus: ...; skip: ...`** tells Claude what to put in the brief and what to leave out.
- **`--last N`** copies the last N exchanges of the conversation into the brief exactly as written. It costs no tokens in the main conversation.
- **`--review`** opens the brief in your editor instead of starting the fork. Edit it, then run `/tree:fork go f1`. Your edits never enter the main conversation.
- **`--print`** prints the command that starts the fork instead of opening Terminal. Use it to run the fork in a VS Code or Cursor terminal, or on Linux and Windows, where this is the only mode.

### What comes back

`/tree:return` makes Claude write a self-contained result: outcome, key decisions, artifacts and open questions, in under about 4,000 characters. The fork's conversation itself never enters the main conversation.

If several forks return at once, their results arrive oldest first, and any that don't fit arrive with the following message. A result that is too long is cut off, with a pointer to the full text.

A fork can return again after you continue working in it. The new result is complete, and Claude is told that it replaces any earlier result of the same fork.

### The tree view

`/tree:view` opens the tree in your browser.
- **Reading it:** the main conversation is blue. Returned forks are green, forks that haven't returned are grey, and drafts that haven't started have a dashed outline. Arrows are labelled with what happened: `create` (a fork was started), `draft` (a fork is drafted but not started) and `result` (a dashed green arrow back to the parent, showing the result went back). The fork's label, such as `f1`, is in the details panel.
- **Details:** click a box to see its brief, its result and when it happened.
- **Navigating:** double-click a box to fold its branch. Filter by project or status, or search topics and results.
- **Updates:** the page updates after every fork and return; reload it to see the latest state.

## Settings

Optionally, create `~/.claude/session-tree/config.json`:

```json
{
  "resultCap": 4000,
  "terminal": "Terminal"
}
```

- `resultCap`: how many characters of each result the main conversation receives.
- `terminal`: `"Terminal"` opens forks in macOS Terminal; `"print"` always prints the command instead.

## What the plugin touches

- `/tree:fork` opens a macOS Terminal window, unless you pass `--print`.
- `--review` opens the brief in Cursor, VS Code or TextEdit.
- `/tree:view` opens the tree in your default browser.
- **Files:** briefs, results and fork records are plain files in `~/.claude/session-tree/`, which you can open and read. The plugin reads Claude Code's session files but writes nothing else.
- **Network:** none.

## More

- [SPEC.md](SPEC.md): how it works, data formats, and development.
- [LICENSE](LICENSE): Apache-2.0.

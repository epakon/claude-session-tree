import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forkPoint, humanText, lastExchanges, readRecords, sessionTitle, turns } from "../src/transcript.js";
import { assistant, tempDir, user, writeTranscript } from "./helpers.js";

const forkCommand = user("<command-message>session-tree:fork</command-message>\n<command-name>/session-tree:fork</command-name>\n<command-args>OAuth2</command-args>");

describe("humanText", () => {
  it("skips meta records, tool results and harness output", () => {
    expect(humanText(user("hello") as never)).toBe("hello");
    expect(humanText(user("skill body", { isMeta: true }) as never)).toBeNull();
    expect(humanText({ type: "user", message: { content: [{ type: "tool_result", content: "x" }] } })).toBeNull();
    expect(humanText(user("<local-command-stdout>x</local-command-stdout>") as never)).toBeNull();
  });

  it("renders slash commands as the typed command", () => {
    expect(humanText(forkCommand as never)).toBe("/session-tree:fork OAuth2");
  });
});

describe("turns and lastExchanges", () => {
  const records = [user("first question"), assistant("first answer"), user("second question"), assistant("part one"), assistant("part two"), forkCommand, assistant("fork created")];

  it("merges consecutive assistant texts and stops at the plugin command", () => {
    expect(turns(records as never)).toEqual([
      { role: "user", text: "first question" },
      { role: "assistant", text: "first answer" },
      { role: "user", text: "second question" },
      { role: "assistant", text: "part one\n\npart two" },
    ]);
  });

  it("returns the last N exchanges", () => {
    const text = lastExchanges(records as never, 1, 10_000);
    expect(text).toBe("**User:**\nsecond question\n\n**Claude:**\npart one\n\npart two");
  });

  it("returns everything when N exceeds the exchange count", () => {
    expect(lastExchanges(records as never, 5, 10_000)).toContain("first question");
  });

  it("trims from the oldest side to fit the cap", () => {
    const text = lastExchanges(records as never, 2, 30);
    expect(text.startsWith("[earlier part trimmed]")).toBe(true);
    expect(text.endsWith("part two")).toBe(true);
  });
});

describe("forkPoint", () => {
  it("is the last conversation record before the plugin command", () => {
    const answer = assistant("answer") as { uuid: string };
    expect(forkPoint([user("q"), answer, forkCommand, assistant("after")] as never).uuid).toBe(answer.uuid);
  });
});

describe("sessionTitle", () => {
  it("prefers custom title, then AI title, then first prompt", () => {
    expect(sessionTitle([{ type: "ai-title", aiTitle: "AI" }, { type: "custom-title", customTitle: "Custom" }])).toBe("Custom");
    expect(sessionTitle([{ type: "ai-title", aiTitle: "AI" }])).toBe("AI");
    expect(sessionTitle([user("/clear") as never, user("Design the auth module") as never])).toBe("Design the auth module");
  });
});

describe("readRecords", () => {
  it("ignores a partially written last line", () => {
    const path = writeTranscript(tempDir(), "s1", [user("hello")]);
    appendFileSync(path, '{"type":"user","mess');
    expect(readRecords(path)).toHaveLength(1);
  });
});

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run, type Context } from "../src/cli.js";
import { Registry } from "../src/registry.js";
import { assistant, tempDir, user, writeTranscript } from "./helpers.js";

interface Harness {
  ctx: Context;
  registry: Registry;
  projects: string;
  opened: { terminal: string[]; editor: string[]; file: string[] };
  stdin: (text: string) => void;
}

function harness(overrides: Partial<Context> = {}): Harness {
  const base = tempDir();
  const pluginRoot = join(base, "plugin");
  mkdirSync(join(pluginRoot, "viewer"), { recursive: true });
  copyFileSync(join(import.meta.dirname, "..", "src", "viewer", "template.html"), join(pluginRoot, "viewer", "template.html"));

  const env = { CLAUDE_CONFIG_DIR: join(base, "claude"), SESSION_TREE_DIR: join(base, "registry") };
  const opened = { terminal: [] as string[], editor: [] as string[], file: [] as string[] };
  let input = "";
  let tick = 0;
  const ctx: Context = {
    env,
    cwd: "/tmp/project",
    now: () => `2026-11-11T10:${String(tick++).padStart(2, "0")}:00.000Z`,
    readStdin: () => input,
    scriptPath: join(pluginRoot, "scripts", "st.mjs"),
    platform: "darwin",
    refreshTree: () => {},
    openTerminal: (path) => (opened.terminal.push(path), true),
    openEditor: (path) => (opened.editor.push(path), true),
    openFile: (path) => (opened.file.push(path), true),
    ...overrides,
  };
  return { ctx, registry: new Registry(env.SESSION_TREE_DIR), projects: join(env.CLAUDE_CONFIG_DIR, "projects"), opened, stdin: (text) => (input = text) };
}

const hook = (h: Harness, command: string, input: object) => {
  h.stdin(JSON.stringify(input));
  return run([command], h.ctx);
};

describe("fork, return and delivery", () => {
  it("runs the full cycle from fork to delivery in the parent", () => {
    const h = harness();
    const parentTranscript = writeTranscript(h.projects, "parent", [user("Design auth"), assistant("Options: JWT or OAuth2")]);
    hook(h, "hook-session-start", { session_id: "parent", transcript_path: parentTranscript, cwd: "/work/app", source: "startup" });

    h.stdin("Goal: evaluate OAuth2 for the auth module.");
    const forked = run(["fork", "--parent", "parent", "--topic", "OAuth2 option"], h.ctx);
    expect(forked).toMatchObject({ code: 0, stdout: 'Fork f1 "OAuth2 option" opened in a new Terminal window.' });

    const [fork] = h.registry.listForks();
    expect(fork).toMatchObject({ label: "f1", parentSessionId: "parent", parentTranscript, cwd: "/work/app", launchedAt: null });
    expect(h.registry.readBrief(fork!.forkId)).toBe("# Fork f1: OAuth2 option\n\nGoal: evaluate OAuth2 for the auth module.\n");
    const script = readFileSync(h.opened.terminal[0]!, "utf8");
    expect(script).toContain(`cd '/work/app' || exit 1`);
    expect(script).toContain(`--session-id '${fork!.childSessionId}'`);

    const start = hook(h, "hook-session-start", { session_id: fork!.childSessionId, transcript_path: "/t/child.jsonl", cwd: "/work/app", source: "startup" });
    const startOutput = JSON.parse(start.stdout).hookSpecificOutput;
    expect(startOutput.sessionTitle).toBe("[fork f1] OAuth2 option");
    expect(startOutput.additionalContext).toContain(`Fork ID: ${fork!.forkId}`);
    expect(h.registry.getFork(fork!.forkId)).toMatchObject({ childTranscript: "/t/child.jsonl" });
    expect(h.registry.getFork(fork!.forkId)!.launchedAt).not.toBeNull();

    expect(hook(h, "hook-prompt", { session_id: "parent" }).stdout).toBe("");

    h.stdin("Use OAuth2 with PKCE.");
    const returned = run(["return", "--session", fork!.childSessionId], h.ctx);
    expect(returned.stdout).toContain('Result for fork f1 "OAuth2 option" saved');
    expect(h.registry.hasPending("parent")).toBe(true);

    const delivery = JSON.parse(hook(h, "hook-prompt", { session_id: "parent" }).stdout);
    expect(delivery.systemMessage).toBe('Session Tree: merged f1 "OAuth2 option"');
    expect(delivery.hookSpecificOutput.additionalContext).toContain("Use OAuth2 with PKCE.");
    expect(hook(h, "hook-prompt", { session_id: "parent" }).stdout).toBe("");
  });

  it("copies the last exchanges verbatim into the brief", () => {
    const h = harness();
    writeTranscript(h.projects, "parent", [user("old question"), assistant("old answer"), user("latest question"), assistant("latest answer")]);
    h.stdin("Brief text");
    run(["fork", "--parent", "parent", "--topic", "T", "--last", "1"], h.ctx);
    const brief = h.registry.readBrief(h.registry.listForks()[0]!.forkId)!;
    expect(brief).toContain("## Recent exchange (verbatim)\n\n**User:**\nlatest question\n\n**Claude:**\nlatest answer");
    expect(brief).not.toContain("old question");
  });

  it("drafts with --review and launches with go", () => {
    const h = harness();
    h.stdin("Brief");
    const drafted = run(["fork", "--parent", "parent", "--topic", "Draft topic", "--review", "--scope", "focus: tokens"], h.ctx);
    expect(drafted.stdout).toContain("run /tree:fork go f1");
    expect(h.opened.editor).toHaveLength(1);
    expect(h.opened.terminal).toHaveLength(0);
    expect(h.registry.listForks()[0]!.scope).toBe("focus: tokens");

    expect(run(["go", "f1", "--parent", "parent"], h.ctx).stdout).toBe('Fork f1 "Draft topic" opened in a new Terminal window.');
    expect(h.opened.terminal).toHaveLength(1);
  });

  it("prints the launch command with --print, on other platforms and when Terminal fails", () => {
    for (const ctxOverride of [{}, { platform: "linux" as const }, { openTerminal: () => false }]) {
      const h = harness(ctxOverride);
      h.stdin("Brief");
      const args = Object.keys(ctxOverride).length ? [] : ["--print"];
      const outcome = run(["fork", "--parent", "p", "--topic", "T", ...args], h.ctx);
      expect(outcome.stdout).toMatch(/is ready\. Run it in a new terminal: sh '.*\.sh'$/);
    }
  });

  it("finds the fork with --fork when the session ID changed", () => {
    const h = harness();
    h.stdin("Brief");
    run(["fork", "--parent", "parent", "--topic", "T"], h.ctx);
    const forkId = h.registry.listForks()[0]!.forkId;
    h.stdin("Result");
    expect(run(["return", "--session", "new-id-after-clear"], h.ctx).code).toBe(1);
    expect(run(["return", "--session", "new-id-after-clear", "--fork", forkId], h.ctx).code).toBe(0);
  });

  it("supports nested forks with their own labels", () => {
    const h = harness();
    h.stdin("Brief");
    run(["fork", "--parent", "root", "--topic", "Child"], h.ctx);
    const child = h.registry.listForks()[0]!;
    run(["fork", "--parent", child.childSessionId, "--topic", "Grandchild"], h.ctx);
    run(["fork", "--parent", "root", "--topic", "Second child"], h.ctx);
    const labels = h.registry.listForks().map((fork) => `${fork.topic}:${fork.label}`);
    expect(labels).toEqual(["Child:f1", "Grandchild:f1", "Second child:f2"]);
  });

  it("rejects bad input with usage errors", () => {
    const h = harness();
    expect(run(["fork", "--parent", "p", "--topic", "T"], h.ctx)).toMatchObject({ code: 2, stderr: "pass the brief on stdin" });
    h.stdin("Brief");
    expect(run(["fork", "--parent", "p"], h.ctx)).toMatchObject({ code: 2, stderr: "missing --topic" });
    expect(run(["fork", "--parent", "p", "--topic", "T", "--last", "x"], h.ctx).code).toBe(2);
    expect(run(["nope"], h.ctx).code).toBe(2);
  });
});

describe("list", () => {
  it("lists forks, offers orphaned results and pulls them by hand", () => {
    const h = harness();
    hook(h, "hook-session-start", { session_id: "old-parent", cwd: "/work/app", source: "startup" });
    hook(h, "hook-session-start", { session_id: "new-parent", cwd: "/work/app", source: "clear" });
    h.stdin("Brief");
    run(["fork", "--parent", "old-parent", "--topic", "Lost result"], h.ctx);
    const fork = h.registry.listForks()[0]!;
    h.stdin("The answer");
    run(["return", "--session", fork.childSessionId], h.ctx);

    const listing = run(["list", "--session", "new-parent"], h.ctx).stdout;
    expect(listing).toContain("This session has no forks.");
    expect(listing).toContain(`f1  returned, waiting for delivery  "Lost result"  (fork ID ${fork.forkId})`);

    const pulled = run(["list", "--session", "new-parent", "pull", fork.forkId], h.ctx).stdout;
    expect(pulled).toContain("The answer");
    expect(h.registry.getFork(fork.forkId)!.deliveredAt).not.toBeNull();
  });
});

describe("tree", () => {
  it("writes a self-contained viewer with the data embedded", () => {
    const h = harness();
    h.stdin("Brief with </script> inside");
    run(["fork", "--parent", "root", "--topic", "Child"], h.ctx);
    const outcome = run(["tree", "--open"], h.ctx);
    expect(outcome.stdout).toBe(`Session tree: ${h.registry.treePath}`);
    expect(h.opened.file).toEqual([h.registry.treePath]);
    const html = readFileSync(h.registry.treePath, "utf8");
    expect(html).not.toContain('"__SESSION_TREE_DATA__"');
    expect(html).toContain('"topic":"Child"');
    expect(html).not.toContain("Brief with </script>");
    expect(existsSync(h.registry.treePath)).toBe(true);
  });
});

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { deliver, renderResult } from "./deliver.js";
import { atomicWrite } from "./fsutil.js";
import { launchScript, openEditor, openFile, openTerminal } from "./launch.js";
import { projectsDir, registryDir, type Env } from "./paths.js";
import { Registry, type ForkRecord } from "./registry.js";
import { findTranscript, forkPoint, lastExchanges, readRecords } from "./transcript.js";
import { buildTree, forkState } from "./tree.js";
import { renderViewer } from "./viewer.js";

export interface Context {
  env: Env;
  cwd: string;
  now: () => string;
  readStdin: () => string;
  /** Absolute path of the bundled st.mjs; the plugin root is two levels up. */
  scriptPath: string;
  platform: NodeJS.Platform;
  /** Regenerates tree.html in a detached process so hooks and commands return immediately. */
  refreshTree: () => void;
  openTerminal: (scriptPath: string) => boolean;
  openEditor: (path: string) => boolean;
  openFile: (path: string) => boolean;
}

export interface Outcome {
  stdout: string;
  stderr?: string;
  code: number;
}

export class UsageError extends Error {}

const LAST_EXCHANGES_MAX_CHARS = 8000;
const PLUGIN = "session-tree";

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new UsageError(`missing --${name}`);
  return value;
}

function readBody(ctx: Context, what: string): string {
  const text = ctx.readStdin().trim();
  if (!text) throw new UsageError(`pass the ${what} on stdin`);
  return text;
}

function parseHookInput(ctx: Context): Record<string, unknown> {
  try {
    return JSON.parse(ctx.readStdin() || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function launch(ctx: Context, registry: Registry, fork: ForkRecord, print: boolean): string {
  const script = launchScript(fork.cwd, fork.childSessionId, registry.briefPath(fork.forkId), ctx.env.SESSION_TREE_CLAUDE_ARGS);
  const path = registry.launchPath(fork.forkId);
  atomicWrite(path, script, 0o755);
  const usePrint = print || registry.config().terminal === "print" || ctx.platform !== "darwin";
  if (!usePrint && ctx.openTerminal(path)) return `Fork ${fork.label} "${fork.topic}" opened in a new Terminal window.`;
  return `Fork ${fork.label} "${fork.topic}" is ready. Run it in a new terminal: sh '${path}'`;
}

function cmdFork(ctx: Context, registry: Registry, argv: string[]): Outcome {
  const { values } = parseArgs({
    args: argv,
    options: {
      parent: { type: "string" },
      topic: { type: "string" },
      scope: { type: "string" },
      last: { type: "string" },
      review: { type: "boolean", default: false },
      print: { type: "boolean", default: false },
    },
  });
  const parentSessionId = required(values.parent, "parent");
  const topic = required(values.topic, "topic").trim();
  const last = values.last === undefined ? 0 : Number.parseInt(values.last, 10);
  if (!Number.isInteger(last) || last < 0) throw new UsageError("--last must be a non-negative number");
  const brief = readBody(ctx, "brief");

  const session = registry.getSession(parentSessionId);
  const parentTranscript = session?.transcriptPath ?? findTranscript(projectsDir(ctx.env), parentSessionId);
  if (last > 0 && parentTranscript) sleep(300);
  const records = parentTranscript ? readRecords(parentTranscript) : [];
  const point = forkPoint(records);

  const childSessionId = randomUUID();
  const forkId = childSessionId.slice(0, 8);
  const label = registry.nextLabel(parentSessionId);
  const now = ctx.now();

  let document = `# Fork ${label}: ${topic}\n\n${brief}\n`;
  if (last > 0) {
    const exchanges = lastExchanges(records, last, LAST_EXCHANGES_MAX_CHARS);
    if (exchanges) document += `\n## Recent exchange (verbatim)\n\n${exchanges}\n`;
  }
  registry.writeBrief(forkId, document);

  const fork: ForkRecord = {
    forkId,
    label,
    topic,
    scope: values.scope?.trim() || null,
    parentSessionId,
    parentTranscript,
    forkPointUuid: point.uuid,
    forkPointAt: point.at ?? now,
    childSessionId,
    childTranscript: null,
    cwd: session?.cwd ?? ctx.cwd,
    createdAt: now,
    launchedAt: null,
    returnedAt: null,
    deliveredAt: null,
  };
  registry.saveFork(fork);
  ctx.refreshTree();

  if (values.review) {
    const opened = ctx.openEditor(registry.briefPath(forkId));
    const where = opened ? "opened in your editor" : `saved at ${registry.briefPath(forkId)}`;
    return { stdout: `Fork ${label} "${topic}" drafted; the brief is ${where}. Edit it, then run /${PLUGIN}:fork go ${label} to start the fork.`, code: 0 };
  }
  return { stdout: launch(ctx, registry, fork, values.print), code: 0 };
}

function cmdGo(ctx: Context, registry: Registry, argv: string[]): Outcome {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { parent: { type: "string" }, print: { type: "boolean", default: false } },
  });
  const ref = positionals[0];
  if (!ref) throw new UsageError("usage: go <label|forkId> --parent <session>");
  const fork = registry.resolveFork(ref, values.parent);
  if (!fork) return { stdout: "", stderr: `No fork "${ref}" found for this session.`, code: 1 };
  if (fork.launchedAt) return { stdout: `Fork ${fork.label} "${fork.topic}" already started; resume it with: claude --resume ${fork.childSessionId}`, code: 0 };
  return { stdout: launch(ctx, registry, fork, values.print), code: 0 };
}

function cmdReturn(ctx: Context, registry: Registry, argv: string[]): Outcome {
  const { values } = parseArgs({ args: argv, options: { session: { type: "string" }, fork: { type: "string" } } });
  const fork = values.fork ? registry.resolveFork(values.fork) : registry.findForkByChild(required(values.session, "session"));
  if (!fork) {
    return {
      stdout: "",
      stderr: "This session is not a registered fork. If its session ID changed (for example after /clear), run the command again with --fork <forkId> from the fork context.",
      code: 1,
    };
  }
  const result = readBody(ctx, "result");
  registry.writeResult(fork.forkId, result + "\n");
  registry.saveFork({ ...fork, returnedAt: ctx.now(), deliveredAt: null, launchedAt: fork.launchedAt ?? fork.createdAt });
  registry.markPending(fork.parentSessionId);
  ctx.refreshTree();

  const { resultCap } = registry.config();
  const note = result.length > resultCap ? ` The parent receives the first ${resultCap} characters and a pointer to the full file.` : "";
  return {
    stdout: `Result for fork ${fork.label} "${fork.topic}" saved (${result.length} characters). It will reach the parent with your next message there.${note}`,
    code: 0,
  };
}

function cmdHookSessionStart(ctx: Context, registry: Registry): Outcome {
  const input = parseHookInput(ctx);
  const sessionId = typeof input.session_id === "string" ? input.session_id : null;
  if (!sessionId) return { stdout: "", code: 0 };
  const source = typeof input.source === "string" ? input.source : null;
  const transcriptPath = typeof input.transcript_path === "string" ? input.transcript_path : null;
  registry.recordSession({ sessionId, transcriptPath, cwd: typeof input.cwd === "string" ? input.cwd : null, source }, ctx.now());

  const fork = registry.findForkByChild(sessionId);
  if (!fork) return { stdout: "", code: 0 };
  if (!fork.launchedAt || !fork.childTranscript) {
    registry.saveFork({ ...fork, launchedAt: fork.launchedAt ?? ctx.now(), childTranscript: fork.childTranscript ?? transcriptPath });
    ctx.refreshTree();
  }
  const context = [
    `This session is fork ${fork.label} "${fork.topic}" of parent session ${fork.parentSessionId}, created by the ${PLUGIN} plugin. Fork ID: ${fork.forkId}.`,
    "The first user message is the brief from the parent. Work on this subtopic with the user.",
    `When the user runs /${PLUGIN}:return, write the result for the parent. Only that result goes back; the parent never sees this conversation.`,
  ];
  if (fork.scope) context.push(`Scope requested by the user for this fork: ${fork.scope}`);
  const output: Record<string, unknown> = { hookEventName: "SessionStart", additionalContext: context.join("\n") };
  if (source === "startup") output.sessionTitle = `[fork ${fork.label}] ${fork.topic}`;
  return { stdout: JSON.stringify({ hookSpecificOutput: output }), code: 0 };
}

function cmdHookPrompt(ctx: Context, registry: Registry): Outcome {
  const input = parseHookInput(ctx);
  const sessionId = typeof input.session_id === "string" ? input.session_id : null;
  if (!sessionId || !registry.hasPending(sessionId)) return { stdout: "", code: 0 };
  const result = deliver(registry, sessionId, ctx.now());
  if (!result.additionalContext) return { stdout: "", code: 0 };
  ctx.refreshTree();
  return {
    stdout: JSON.stringify({
      systemMessage: result.systemMessage,
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: result.additionalContext },
    }),
    code: 0,
  };
}

function describe(fork: ForkRecord): string {
  const state = forkState(fork);
  const status =
    state === "draft" ? "draft, not started" : state === "not-returned" ? "not returned" : fork.deliveredAt ? "returned, delivered" : "returned, waiting for delivery";
  return `${fork.label}  ${status}  "${fork.topic}"  (fork ID ${fork.forkId})`;
}

function cmdForks(ctx: Context, registry: Registry, argv: string[]): Outcome {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { session: { type: "string" } } });
  const sessionId = required(values.session, "session");

  if (positionals[0] === "pull") {
    const ref = positionals[1];
    if (!ref) throw new UsageError("usage: forks pull <label|forkId> --session <session>");
    const fork = registry.resolveFork(ref, sessionId);
    if (!fork) return { stdout: `No fork "${ref}" found.`, code: 0 };
    if (!fork.returnedAt) return { stdout: `Fork ${fork.label} "${fork.topic}" has not returned yet.`, code: 0 };
    registry.saveFork({ ...fork, deliveredAt: ctx.now() });
    ctx.refreshTree();
    return { stdout: renderResult(registry, fork, registry.config().resultCap), code: 0 };
  }

  const own = registry.forksOfParent(sessionId);
  const lines = own.length ? ["Forks of this session:", ...own.map(describe)] : ["This session has no forks."];

  const cwd = registry.getSession(sessionId)?.cwd ?? ctx.cwd;
  const orphans = registry.listForks().filter((fork) => fork.parentSessionId !== sessionId && fork.cwd === cwd && fork.returnedAt && !fork.deliveredAt);
  if (orphans.length) {
    lines.push(
      "",
      `Returned but undelivered results from other sessions in this project (bring one here with /${PLUGIN}:forks pull <fork ID>):`,
      ...orphans.map(describe),
    );
  }
  return { stdout: lines.join("\n"), code: 0 };
}

function cmdTree(ctx: Context, registry: Registry, argv: string[]): Outcome {
  const { values } = parseArgs({ args: argv, options: { open: { type: "boolean", default: false }, quiet: { type: "boolean", default: false } } });
  const template = readFileSync(join(dirname(dirname(ctx.scriptPath)), "viewer", "template.html"), "utf8");
  const html = renderViewer(template, buildTree(registry, projectsDir(ctx.env), ctx.now()));
  atomicWrite(registry.treePath, html);
  if (values.open) ctx.openFile(registry.treePath);
  return { stdout: values.quiet ? "" : `Session tree: ${registry.treePath}`, code: 0 };
}

export function run(argv: string[], ctx: Context): Outcome {
  const [command, ...rest] = argv;
  const registry = new Registry(registryDir(ctx.env));
  try {
    switch (command) {
      case "fork":
        return cmdFork(ctx, registry, rest);
      case "go":
        return cmdGo(ctx, registry, rest);
      case "return":
        return cmdReturn(ctx, registry, rest);
      case "hook-session-start":
        return cmdHookSessionStart(ctx, registry);
      case "hook-prompt":
        return cmdHookPrompt(ctx, registry);
      case "forks":
        return cmdForks(ctx, registry, rest);
      case "tree":
        return cmdTree(ctx, registry, rest);
      default:
        throw new UsageError("usage: st.mjs <fork|go|return|forks|tree|hook-session-start|hook-prompt> [options]");
    }
  } catch (error) {
    if (error instanceof UsageError || (error as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
      return { stdout: "", stderr: (error as Error).message, code: 2 };
    }
    throw error;
  }
}

export function defaultContext(scriptPath: string): Context {
  return {
    env: process.env,
    cwd: process.cwd(),
    now: () => new Date().toISOString(),
    readStdin: () => (process.stdin.isTTY ? "" : readFileSync(0, "utf8")),
    scriptPath,
    platform: process.platform,
    refreshTree: () => {
      const child = spawn(process.execPath, [scriptPath, "tree", "--quiet"], { detached: true, stdio: "ignore", env: process.env });
      child.on("error", () => {});
      child.unref();
    },
    openTerminal,
    openEditor: (path) => openEditor(path, process.env),
    openFile,
  };
}

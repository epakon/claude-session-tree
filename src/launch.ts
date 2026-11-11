import { execFileSync, spawn } from "node:child_process";
import type { Env } from "./paths.js";

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** The script a new terminal runs: an interactive claude session with a pre-assigned ID whose first prompt is the brief. */
export function launchScript(cwd: string, childSessionId: string, briefPath: string, extraClaudeArgs = ""): string {
  const extra = extraClaudeArgs.trim() ? ` ${extraClaudeArgs.trim()}` : "";
  return [
    "#!/bin/sh",
    `cd ${shellQuote(cwd)} || exit 1`,
    `exec claude${extra} --session-id ${shellQuote(childSessionId)} "$(cat ${shellQuote(briefPath)})"`,
    "",
  ].join("\n");
}

export function openTerminal(scriptPath: string): boolean {
  try {
    execFileSync("osascript", [
      "-e",
      `tell application "Terminal" to do script ${appleScriptString(`sh ${shellQuote(scriptPath)}`)}`,
      "-e",
      'tell application "Terminal" to activate',
    ], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function detached(command: string, args: string[]): boolean {
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
    return child.pid !== undefined;
  } catch {
    return false;
  }
}

function onPath(command: string): boolean {
  try {
    execFileSync("/bin/sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Opens a file for editing: in Cursor or VS Code when running inside their terminal, otherwise in the default text editor. */
export function openEditor(path: string, env: Env = process.env): boolean {
  if (env.TERM_PROGRAM === "vscode") {
    const preferred = env.CURSOR_TRACE_ID || /cursor/i.test(env.VSCODE_GIT_ASKPASS_NODE ?? "") ? ["cursor", "code"] : ["code", "cursor"];
    for (const editor of preferred) {
      if (onPath(editor) && detached(editor, [path])) return true;
    }
  }
  if (process.platform === "darwin") return detached("open", ["-t", path]);
  return false;
}

export function openFile(path: string): boolean {
  if (process.platform === "darwin") return detached("open", [path]);
  if (process.platform === "win32") return detached("cmd", ["/c", "start", "", path]);
  return detached("xdg-open", [path]);
}

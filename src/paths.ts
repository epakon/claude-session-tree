import { homedir } from "node:os";
import { join } from "node:path";

export type Env = Record<string, string | undefined>;

/** The only environment variables the plugin reads. It never takes the whole environment object. */
export function readEnv(): Env {
  return {
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    SESSION_TREE_DIR: process.env.SESSION_TREE_DIR,
    SESSION_TREE_CLAUDE_ARGS: process.env.SESSION_TREE_CLAUDE_ARGS,
    TERM_PROGRAM: process.env.TERM_PROGRAM,
    VSCODE_GIT_ASKPASS_NODE: process.env.VSCODE_GIT_ASKPASS_NODE,
  };
}

export function configDir(env: Env = readEnv()): string {
  return env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export function registryDir(env: Env = readEnv()): string {
  return env.SESSION_TREE_DIR || join(configDir(env), "session-tree");
}

export function projectsDir(env: Env = readEnv()): string {
  return join(configDir(env), "projects");
}

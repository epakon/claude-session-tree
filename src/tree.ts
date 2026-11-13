import type { ForkRecord, Registry } from "./registry.js";
import { findTranscript, readRecords, sessionTitle } from "./transcript.js";

export type ForkState = "draft" | "not-returned" | "returned";

export interface TreeNode {
  id: string;
  title: string;
  cwd: string | null;
  transcript: string | null;
  isRoot: boolean;
  fork: {
    forkId: string;
    label: string;
    topic: string;
    state: ForkState;
    createdAt: string;
    launchedAt: string | null;
    returnedAt: string | null;
    deliveredAt: string | null;
    brief: string | null;
    result: string | null;
    briefPath: string;
    resultPath: string;
  } | null;
}

export interface TreeEdge {
  id: string;
  source: string;
  target: string;
  kind: "fork" | "return";
  label: string;
}

export interface TreeData {
  generatedAt: string;
  nodes: TreeNode[];
  edges: TreeEdge[];
}

export function forkState(fork: ForkRecord): ForkState {
  if (fork.returnedAt) return "returned";
  return fork.launchedAt ? "not-returned" : "draft";
}

export function buildTree(registry: Registry, projectsRoot: string, now: string): TreeData {
  const forks = registry.listForks();
  const childIds = new Set(forks.map((fork) => fork.childSessionId));
  const nodes = new Map<string, TreeNode>();

  const transcriptOf = (sessionId: string, known: string | null): string | null =>
    known ?? registry.getSession(sessionId)?.transcriptPath ?? findTranscript(projectsRoot, sessionId);

  const ensure = (sessionId: string, transcript: string | null, cwd: string | null): TreeNode => {
    let node = nodes.get(sessionId);
    if (!node) {
      const path = transcriptOf(sessionId, transcript);
      node = {
        id: sessionId,
        title: (path && sessionTitle(readRecords(path))) || sessionId.slice(0, 8),
        cwd,
        transcript: path,
        isRoot: !childIds.has(sessionId),
        fork: null,
      };
      nodes.set(sessionId, node);
    }
    return node;
  };

  const edges: TreeEdge[] = [];
  for (const fork of forks) {
    ensure(fork.parentSessionId, fork.parentTranscript, fork.cwd);
    const child = ensure(fork.childSessionId, fork.childTranscript, fork.cwd);
    child.fork = {
      forkId: fork.forkId,
      label: fork.label,
      topic: fork.topic,
      state: forkState(fork),
      createdAt: fork.createdAt,
      launchedAt: fork.launchedAt,
      returnedAt: fork.returnedAt,
      deliveredAt: fork.deliveredAt,
      brief: registry.readBrief(fork.forkId),
      result: registry.readResult(fork.forkId),
      briefPath: registry.briefPath(fork.forkId),
      resultPath: registry.resultPath(fork.forkId),
    };
    if (child.title === fork.childSessionId.slice(0, 8)) child.title = fork.topic;
    edges.push({ id: `fork-${fork.forkId}`, source: fork.parentSessionId, target: fork.childSessionId, kind: "fork", label: forkState(fork) === "draft" ? "draft" : "create" });
    if (fork.returnedAt) {
      edges.push({ id: `return-${fork.forkId}`, source: fork.childSessionId, target: fork.parentSessionId, kind: "return", label: "result" });
    }
  }

  return { generatedAt: now, nodes: [...nodes.values()], edges };
}

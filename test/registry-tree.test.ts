import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { buildTree } from "../src/tree.js";
import { assistant, fork, tempDir, tempRegistry, user, writeTranscript } from "./helpers.js";

describe("Registry", () => {
  it("resolves forks by ID or by label within a parent", () => {
    const registry = tempRegistry();
    registry.saveFork(fork({ forkId: "abc12345", label: "f1" }));
    expect(registry.resolveFork("abc12345")?.label).toBe("f1");
    expect(registry.resolveFork("f1", "parent-1")?.forkId).toBe("abc12345");
    expect(registry.resolveFork("f1", "other-parent")).toBeNull();
    expect(registry.nextLabel("parent-1")).toBe("f2");
  });

  it("keeps firstSeenAt when a session is recorded again", () => {
    const registry = tempRegistry();
    registry.recordSession({ sessionId: "s1", transcriptPath: "/t.jsonl", cwd: "/p", source: "startup" }, "2026-11-11T10:00:00Z");
    const again = registry.recordSession({ sessionId: "s1", source: "resume" }, "2026-11-11T11:00:00Z");
    expect(again).toMatchObject({ transcriptPath: "/t.jsonl", lastSource: "resume", firstSeenAt: "2026-11-11T10:00:00Z", lastSeenAt: "2026-11-11T11:00:00Z" });
  });
});

describe("buildTree", () => {
  it("links parents, forks and nested forks with fork and return edges", () => {
    const registry = tempRegistry();
    const projects = join(tempDir(), "projects");
    writeTranscript(projects, "root", [user("Plan the auth redesign"), assistant("ok"), { type: "ai-title", aiTitle: "Auth redesign" }]);

    registry.saveFork(fork({ forkId: "child1", label: "f1", topic: "OAuth2", parentSessionId: "root", childSessionId: "child1-uuid", returnedAt: "2026-11-11T11:00:00Z" }));
    registry.saveFork(fork({ forkId: "grand1", label: "f1", topic: "Token refresh", parentSessionId: "child1-uuid", childSessionId: "grand1-uuid", launchedAt: null }));
    registry.writeResult("child1", "Use OAuth2 with PKCE");

    const tree = buildTree(registry, projects, "2026-11-11T12:00:00Z");
    const byId = Object.fromEntries(tree.nodes.map((node) => [node.id, node]));

    expect(byId.root).toMatchObject({ title: "Auth redesign", isRoot: true, fork: null });
    expect(byId["child1-uuid"]).toMatchObject({ isRoot: false, title: "OAuth2", fork: { state: "returned", result: "Use OAuth2 with PKCE" } });
    expect(byId["grand1-uuid"]!.fork!.state).toBe("draft");
    expect(tree.edges.map((edge) => edge.id).sort()).toEqual(["fork-child1", "fork-grand1", "return-child1"]);
  });
});

// Opens the generated tree page in headless Chrome and drives it with real mouse events: select, fold, zoom, pan, filters.
// Usage: node scripts/check-viewer.mjs [--screenshot docs/tree.png]
// Needs Google Chrome or Chromium; set CHROME to its path if it is not found. Uses a temporary registry.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const screenshot = args.includes("--screenshot") ? resolve(args[args.indexOf("--screenshot") + 1]) : null;

const chromePath = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => p && existsSync(p));
if (!chromePath) {
  console.log("SKIP: Chrome not found. Set CHROME to the browser's path.");
  process.exit(0);
}

// ---- a sample registry: one conversation, eight forks over three levels ----------------------
const work = mkdtempSync(join(tmpdir(), "session-tree-viewer-"));
const registry = join(work, "registry");
const claude = join(work, "claude");
for (const dir of ["forks", "briefs", "results"]) mkdirSync(join(registry, dir), { recursive: true });
mkdirSync(join(claude, "projects", "-demo-cli"), { recursive: true });
const id = (n) => `${String(n).padStart(8, "0")}-aaaa-4aaa-8aaa-000000000000`;
const ROOT = id(100);
writeFileSync(join(claude, "projects", "-demo-cli", `${ROOT}.jsonl`), JSON.stringify({ type: "ai-title", aiTitle: "Config format for a CLI tool", sessionId: ROOT }) + "\n");
const forks = [
  [1, "Config validation", "returned", ROOT, "f1"],
  [2, "Config migrations", "not-returned", ROOT, "f2"],
  [3, "Documentation structure", "returned", ROOT, "f3"],
  [4, "Release process and versioning policy for the CLI", "not-returned", ROOT, "f4"],
  [5, "Error message format", "draft", id(1), "f1"],
  [6, "Schema library choice", "returned", id(1), "f2"],
  [7, "Zod versus a hand-written checker", "not-returned", id(6), "f1"],
  [8, "Examples for the README", "returned", id(3), "f1"],
];
for (const [n, topic, state, parent, label] of forks) {
  const forkId = id(n).slice(0, 8);
  const returned = state === "returned" ? "2026-11-13T09:40:00Z" : null;
  writeFileSync(join(registry, "forks", `${forkId}.json`), JSON.stringify({
    forkId, label, topic, scope: null, parentSessionId: parent, parentTranscript: null, forkPointUuid: null, forkPointAt: null,
    childSessionId: id(n), childTranscript: null, cwd: "/demo/cli", createdAt: "2026-11-13T09:00:00Z",
    launchedAt: state === "draft" ? null : "2026-11-13T09:00:05Z", returnedAt: returned, deliveredAt: returned,
  }));
  writeFileSync(join(registry, "briefs", `${forkId}.md`), `# Fork ${label}: ${topic}\n\n**Goal:** work out ${topic.toLowerCase()}.\n`);
  if (returned) writeFileSync(join(registry, "results", `${forkId}.md`), `**Outcome:** ${topic} is settled.\n\n**Key decisions:**\n- A hand-written approach, no new dependency.\n`);
}
execFileSync("node", [join(root, "plugins", "tree", "scripts", "st.mjs"), "tree"], { env: { ...process.env, SESSION_TREE_DIR: registry, CLAUDE_CONFIG_DIR: claude }, stdio: "pipe" });
const page = join(registry, "tree.html");

// ---- a minimal DevTools client ---------------------------------------------------------------
const chrome = spawn(chromePath, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${join(work, "profile")}`, "--disable-gpu", "--hide-scrollbars", "--window-size=1280,800", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((resolveUrl, reject) => {
  let buffer = "";
  chrome.stderr.on("data", (chunk) => {
    buffer += chunk;
    const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
    if (match) resolveUrl(match[1]);
  });
  chrome.on("exit", () => reject(new Error("Chrome exited before it was ready")));
  setTimeout(() => reject(new Error("Chrome did not start")), 15000);
});
const port = new URL(wsUrl).port;
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok) => socket.addEventListener("open", ok));
let nextId = 0;
const waiting = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
});
const send = (method, params = {}) => new Promise((ok, fail) => {
  const callId = ++nextId;
  waiting.set(callId, (message) => (message.error ? fail(new Error(`${method}: ${message.error.message}`)) : ok(message.result)));
  socket.send(JSON.stringify({ id: callId, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`page error: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  return result.result.value;
};
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
const click = async (x, y, count = 1) => {
  for (let i = 1; i <= count; i++) {
    await mouse("mousePressed", x, y, { clickCount: i });
    await mouse("mouseReleased", x, y, { clickCount: i });
  }
  await pause(120);
};
const centre = (nodeId) => evaluate(`(() => { const r = document.querySelector('[data-id="${nodeId}"] rect').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

let failures = 0;
const check = (what, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${what}${ok || !detail ? "" : ` (${detail})`}`);
  if (!ok) failures++;
};
const nodeCount = () => evaluate(`document.querySelectorAll('#graph-svg [data-id]').length`);
const panelTitle = () => evaluate(`document.querySelector('#details h2')?.textContent ?? ''`);
const scale = () => evaluate(`Number(/scale\\(([^)]+)\\)/.exec(document.querySelector('#graph-svg > g').getAttribute('transform'))[1])`);
const translate = () => evaluate(`(() => { const m = /translate\\(([-\\d.e]+) ([-\\d.e]+)\\)/.exec(document.querySelector('#graph-svg > g').getAttribute('transform')); return [Number(m[1]), Number(m[2])]; })()`);

try {
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  if (args.includes("--dark")) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  const errors = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? "exception");
  });
  await send("Runtime.enable");
  await send("Page.navigate", { url: `file://${page}` });
  await pause(800);

  check("all eight forks and the conversation are drawn", (await nodeCount()) === 9, String(await nodeCount()));
  check("the layout is vertical: children sit below their parent", await evaluate(`(() => {
    const y = (n) => document.querySelector('[data-id="' + n + '"] rect').getBoundingClientRect().y;
    return y('${id(1)}') > y('${ROOT}') && y('${id(6)}') > y('${id(1)}') && y('${id(7)}') > y('${id(6)}');
  })()`));
  check("no two boxes overlap", await evaluate(`(() => {
    const boxes = [...document.querySelectorAll('#graph-svg [data-id] rect')].map((r) => r.getBoundingClientRect());
    return boxes.every((a, i) => boxes.every((b, j) => i === j || a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5));
  })()`));
  check("arrows are labelled create, draft and result", await evaluate(`(() => {
    const labels = [...document.querySelectorAll('#graph-svg g > g > text')].map((t) => t.textContent);
    return labels.filter((l) => l === 'create').length === 7 && labels.filter((l) => l === 'draft').length === 1 && labels.filter((l) => l === 'result').length === 4;
  })()`));
  check("every arrow has a drawn path", await evaluate(`document.querySelectorAll('#graph-svg path[marker-end]').length === 12`));
  check("the pointer is silent until something is selected", (await panelTitle()) === "");

  // select with a real click
  let p = await centre(id(1));
  await click(p.x, p.y);
  check("clicking a box shows its details", (await panelTitle()) === "Config validation", await panelTitle());
  check("the details include the returned result", await evaluate(`document.querySelector('#details').textContent.includes('Config validation is settled')`));
  check("the clicked box is highlighted", await evaluate(`document.querySelector('[data-id="${id(1)}"] rect').getAttribute('stroke-width') === '3'`));

  // a link in the panel selects a child
  await evaluate(`document.querySelector('#details a[data-select="${id(5)}"]').click()`);
  await pause(100);
  check("a fork link in the panel selects that fork", (await panelTitle()) === "Error message format", await panelTitle());
  check("the main conversation shows its own details", await (async () => { p = await centre(ROOT); await click(p.x, p.y); return (await panelTitle()) === "Config format for a CLI tool"; })());

  // fold with a double click
  p = await centre(id(1));
  await click(p.x, p.y, 2);
  check("a double click folds the branch", (await nodeCount()) === 6, String(await nodeCount()));
  check("the folded box shows how many boxes it hides", await evaluate(`document.querySelector('[data-id="${id(1)}"]').textContent.includes('+3')`));
  p = await centre(id(1));
  await click(p.x, p.y, 2);
  check("a second double click unfolds it", (await nodeCount()) === 9, String(await nodeCount()));
  p = await centre(id(2));
  await click(p.x, p.y, 2);
  check("a box without forks cannot be folded", (await nodeCount()) === 9);

  // zoom and pan
  const before = await scale();
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 400, deltaX: 0, deltaY: -300 });
  await pause(100);
  check("the wheel zooms in", (await scale()) > before, `${before} -> ${await scale()}`);
  const [tx, ty] = await translate();
  const titleBeforeDrag = await panelTitle();
  await mouse("mousePressed", 600, 700);
  for (let i = 1; i <= 6; i++) await mouse("mouseMoved", 600 + i * 20, 700 - i * 10);
  await mouse("mouseReleased", 720, 640);
  await pause(100);
  const [nx, ny] = await translate();
  check("dragging the background pans the graph", Math.abs(nx - (tx + 120)) < 2 && Math.abs(ny - (ty - 60)) < 2, `${tx},${ty} -> ${nx},${ny}`);
  check("a drag does not select a box", (await panelTitle()) === titleBeforeDrag);
  await click(await evaluate(`document.getElementById('fit').getBoundingClientRect().x + 10`), await evaluate(`document.getElementById('fit').getBoundingClientRect().y + 10`));
  check("Fit brings the whole graph back into view", await evaluate(`(() => {
    const view = document.getElementById('graph-svg').getBoundingClientRect();
    return [...document.querySelectorAll('#graph-svg [data-id] rect')].every((r) => { const b = r.getBoundingClientRect(); return b.left >= view.left && b.right <= view.right && b.top >= view.top && b.bottom <= view.bottom; });
  })()`));

  // filters
  await evaluate(`(() => { const s = document.getElementById('state'); s.value = 'returned'; s.dispatchEvent(new Event('change')); })()`);
  await pause(100);
  const dimmed = await evaluate(`[...document.querySelectorAll('#graph-svg [data-id]')].filter((g) => g.getAttribute('opacity') === '0.25').length`);
  check("the status filter dims the forks that do not match", dimmed === 4, String(dimmed));
  await evaluate(`(() => { const s = document.getElementById('state'); s.value = 'all'; s.dispatchEvent(new Event('change')); const q = document.getElementById('search'); q.value = 'zod'; q.dispatchEvent(new Event('input')); })()`);
  await pause(100);
  const found = await evaluate(`[...document.querySelectorAll('#graph-svg [data-id]')].filter((g) => g.getAttribute('opacity') === '1').map((g) => g.textContent.trim()).join('|')`);
  check("the search dims everything except matching forks and the main conversation", found.includes("Zod") && !found.includes("Config migrations"), found);
  await evaluate(`(() => { const q = document.getElementById('search'); q.value = ''; q.dispatchEvent(new Event('input')); })()`);

  // no escaping problems from titles and topics
  check("the page raised no script errors", errors.length === 0, errors.join("; "));

  if (screenshot) {
    p = await centre(id(1));
    await click(p.x, p.y);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(screenshot, Buffer.from(shot.data, "base64"));
    console.log(`screenshot saved to ${screenshot}`);
  }
} finally {
  socket.close();
  chrome.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall viewer checks passed");
process.exit(failures ? 1 : 0);

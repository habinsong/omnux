const readline = require("node:readline");
const runtimeId = require("node:crypto").randomUUID();
let chromium;
try { chromium = require("playwright").chromium; }
catch { console.error("Playwright 패키지를 불러오지 못했습니다. Node.js와 Playwright 설치를 확인해 주세요."); process.exit(2); }

let browser, context, activePage;
let nextTab = 1;
let canvasVisible = false, canvasRevision = 0, canvasDocument = false;
const ids = new WeakMap();
const actions = [];
const headless = process.env.OMNUX_BROWSER_HEADLESS !== "false";
const channel = process.env.OMNUX_BROWSER_CHANNEL || "";
const idOf = page => {
  if (!ids.has(page)) ids.set(page, `tab-${runtimeId}-${nextTab++}`);
  return ids.get(page);
};
const pages = () => context ? context.pages().filter(page => !page.isClosed()) : [];
const running = () => Boolean(browser?.isConnected());
function active() {
  if (!activePage || activePage.isClosed()) activePage = pages().slice(-1)[0];
  return activePage;
}
function target(id) {
  if (!id) return active();
  const page = pages().find(page => idOf(page) === id);
  if (!page) throw new Error("target tab not found");
  return page;
}
function url(value) {
  if (value === "about:blank") return value;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("url must be http/https or about:blank"); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("url must be http/https or about:blank");
  return parsed.href;
}
async function ensureBrowser() {
  if (running() && context) return;
  try {
    browser = await chromium.launch({ headless, ...(channel ? { channel } : {}), timeout: 12000 });
  } catch (error) {
    if (channel || !/executable.*(?:exist|found)/i.test(String(error))) throw error;
    browser = await chromium.launch({ headless, channel: "chrome", timeout: 12000 });
  }
  context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  context.on("page", page => { idOf(page); activePage = page; });
  await context.exposeFunction("__omnuxCanvasAction", event => {
    if (canvasDocument) { actions.push(event); if (actions.length > 128) actions.shift(); }
  });
  activePage = await context.newPage();
}
async function snapshot(request, extra = {}) {
  const page = active();
  const tabs = await Promise.all(pages().map(async item => ({
    targetId: idOf(item), url: item.url(), title: await item.title().catch(() => ""),
    active: item === page, updatedAtMs: Date.now()
  })));
  return {
    requestId: request.requestId, ok: true, action: request.action, profile: request.profile,
    adapter: "playwright", running: running(), activeTargetId: page ? idOf(page) : null,
    activeUrl: page?.url() || null, tabs: tabs.slice(0, request.limit || 100),
    visible: canvasVisible && running(), a2UiRevision: canvasRevision, actionEvents: actions.slice(),
    updatedAtMs: Date.now(), ...extra
  };
}
async function navigate(page, address) {
  await page.goto(url(address), { waitUntil: "domcontentloaded", timeout: 12000 });
  activePage = page;
  canvasDocument = false;
  await page.bringToFront();
}
async function capture(page, request) {
  const width = Math.max(320, Math.min(4096, request.maxWidth || 1280));
  const height = Math.round(width * 9 / 16);
  await page.setViewportSize({ width, height });
  const format = request.outputFormat === "jpg" ? "jpeg" : request.outputFormat || "png";
  if (!["png", "jpeg"].includes(format)) throw new Error("snapshot format must be png or jpeg");
  const buffer = await page.screenshot({ type: format, timeout: 12000, ...(format === "jpeg" ? { quality: 85 } : {}) });
  return { snapshotId: `capture-${Date.now()}`, format, width, height, updatedAtMs: Date.now(), dataUrl: `data:image/${format};base64,${buffer.toString("base64")}` };
}
async function execute(request) {
  const action = request.action;
  if (["status", "tabs"].includes(action)) return snapshot(request);
  if (action === "hide") { canvasVisible = false; return snapshot(request); }
  if (action === "stop") {
    if (browser) await browser.close();
    browser = context = activePage = undefined;
    canvasVisible = canvasDocument = false;
    canvasRevision = 0;
    actions.length = 0;
    return snapshot(request);
  }
  if (!["start", "open", "navigate", "focus", "close", "present", "eval", "snapshot", "a2ui_push", "a2ui_reset"].includes(action)) throw new Error(`unsupported browser action: ${action}`);
  if (["open", "navigate"].includes(action)) url(request.url);
  if (action === "present" && request.url) url(request.url);
  if (["eval", "snapshot", "focus", "close"].includes(action) && !running()) throw new Error("browser is not running");
  await ensureBrowser();
  if (action === "start") return snapshot(request);
  if (action === "open") {
    const page = await context.newPage();
    try { await navigate(page, request.url); }
    catch (error) { await page.close(); throw error; }
  } else if (["navigate", "present"].includes(action)) {
    let page = target(request.targetId);
    if (!page) page = await context.newPage();
    if (request.url || action === "navigate") await navigate(page, request.url);
    canvasVisible = request.surface === "canvas";
  } else if (action === "focus") {
    if (!request.targetId) throw new Error("targetId is required for focus");
    activePage = target(request.targetId); await activePage.bringToFront();
  } else if (action === "close") {
    const page = target(request.targetId);
    if (!page) throw new Error("target tab not found");
    await page.close();
  } else if (action === "eval") {
    if (!request.javaScript?.trim()) throw new Error("javaScript is required");
    const page = target(request.targetId);
    if (!page) throw new Error("target tab not found");
    const value = await page.evaluate(request.javaScript);
    const serialized = typeof value === "string" ? value : JSON.stringify(value) ?? "undefined";
    return snapshot(request, { evalResult: serialized });
  } else if (action === "snapshot") {
    const page = target(request.targetId);
    if (!page) throw new Error("target tab not found");
    return snapshot(request, { snapshot: await capture(page, request) });
  } else if (action === "a2ui_push") {
    if (!request.jsonl?.trim()) throw new Error("jsonl is required");
    const messages = request.jsonl.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
    if (!canvasDocument) {
      const previous = active();
      const candidate = await context.newPage();
      try { await candidate.evaluate(renderA2Ui, messages); }
      catch (error) { await candidate.close(); activePage = previous; throw error; }
      if (previous) await previous.close();
      activePage = candidate;
      canvasDocument = true;
      canvasRevision = 0;
    } else await active().evaluate(renderA2Ui, messages);
    canvasVisible = true;
    canvasRevision++;
  } else if (action === "a2ui_reset") {
    await active().goto("about:blank");
    canvasDocument = false;
    canvasRevision = 0;
    actions.length = 0;
  }
  return snapshot(request);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let queue = Promise.resolve();
input.on("line", line => {
  queue = queue.then(async () => {
    let request = {};
    try {
      request = JSON.parse(line);
      process.stdout.write(JSON.stringify(await execute(request)) + "\n");
    } catch (error) {
      process.stdout.write(JSON.stringify(await snapshot(request, { ok: false, error: error instanceof Error ? error.message : String(error) })) + "\n");
    }
  });
});
input.on("close", () => { void queue.finally(async () => { if (browser) await browser.close(); process.exit(0); }); });
process.on("SIGTERM", async () => { if (browser) await browser.close().catch(() => {}); process.exit(0); });

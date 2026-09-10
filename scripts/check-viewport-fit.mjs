import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const scratch = process.env.OMNUX_LAUNCH_SCRATCH || "/var/folders/xb/b4975z4x7c18yq8vf53qjcjr0000gn/T/grok-goal-c16810818bbb/implementer";
const url = process.env.OMNUX_DESKTOP_URL || "http://127.0.0.1:1420/";
const widths = [1440, 768, 390, 320];
const pages = [
  "home",
  "ask",
  "build",
  "automate",
  "explore",
  "projects",
  "activity",
  "logic",
  "insights",
  "notebooks",
  "skills",
  "extensions",
  "routing",
  "planning",
  "refactor",
  "agents",
  "settings",
  "operations",
  "shell"
];

mkdirSync(scratch, { recursive: true });

function mockGateway(page) {
  return page.routeWebSocket(/ws:\/\/(127\.0\.0\.1|localhost):41880\/ws\//, (socket) => {
    socket.send(JSON.stringify({ type: "auth_result", ok: true }));
    socket.onMessage((raw) => {
      const m = JSON.parse(raw);
      const reply = (type, fields = {}) => socket.send(JSON.stringify({ ...fields, type, requestId: m.requestId }));
      if (m.type === "ping") reply("pong", { webSocketAcceptedCount: 1, webSocketRoundTripCount: 1 });
      if (/^get_.*_models$/.test(m.type)) {
        reply(m.type.slice(4), { items: ["grok-4.6", "grok-fixture-custom"], selected: "grok-4.6" });
      }
      if (m.type === "list_conversations") reply("conversations", { scope: m.scope, mode: m.mode, items: [] });
      if (m.type === "plan_list") reply("plan_list_result", { payload: { items: [] } });
      if (m.type === "list_memory_notes") reply("memory_notes", { items: [] });
      if (m.type === "list_projects") reply("projects", { items: [] });
    });
  });
}

const errors = [];
const rows = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (err) => errors.push(err.message));
await mockGateway(page);
await page.route(/http:\/\/(127\.0\.0\.1|localhost):41880\//, (route) =>
  route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"ok":true}' })
);
await page.route("**/media", (route) => route.fulfill({ contentType: "application/json", body: "null" }));
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  const nav = (await import("/src/features/shell/navigation-store.ts")).useDesktopNavigationStore;
  const auth = (await import("/src/features/auth/auth-store.ts")).useDesktopAuthStore;
  auth.setState((s) => ({ auth: { ...s.auth, status: "authenticated" } }));
  window.__nav = nav;
});

for (const pageId of pages) {
  await page.evaluate((id) => window.__nav.getState().setActivePage(id), pageId);
  await page.waitForTimeout(250);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(120);
    const geometry = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflowX = doc.scrollWidth > innerWidth + 1;
      const pageScroll = doc.scrollHeight > innerHeight + 1;
      const main = document.querySelector("main") || document.body;
      const surface =
        document.querySelector("[data-surface]") ||
        document.querySelector("h1")?.closest(".flex.h-full") ||
        main;
      const r = surface.getBoundingClientRect();
      const parent = (surface.parentElement || main).getBoundingClientRect();
      const left = r.left - parent.left;
      const right = parent.right - r.right;
      const outside = [...surface.querySelectorAll("button,input,textarea,select,summary,a")].filter((node) => {
        if (!node.getClientRects().length) return false;
        const b = node.getBoundingClientRect();
        if (!(b.left < -1 || b.right > innerWidth + 1)) return false;
        let parentNode = node.parentElement;
        while (parentNode && parentNode !== surface) {
          const ox = getComputedStyle(parentNode).overflowX;
          if (ox === "auto" || ox === "scroll") return false;
          parentNode = parentNode.parentElement;
        }
        return true;
      }).map((node) => (node.getAttribute("aria-label") || node.textContent || "").trim().slice(0, 40));
      const headings = [...document.querySelectorAll("h1, [data-surface]")].map((el) => el.tagName + ":" + (el.textContent || "").trim().slice(0, 40));
      const search = document.querySelector("[data-topbar-search]");
      const actions = document.querySelector("[data-topbar-actions]");
      let topbarGap = null;
      if (search && actions) {
        const s = search.getBoundingClientRect();
        const a = actions.getBoundingClientRect();
        topbarGap = Math.round(a.left - s.right);
      }
      return {
        overflowX,
        pageScroll,
        left: Math.round(left),
        right: Math.round(right),
        viewportLeft: Math.round(r.left),
        w: Math.round(r.width),
        h: Math.round(r.height),
        outside,
        headings,
        topbarGap
      };
    });
    const skew = Math.abs(geometry.left - geometry.right) > 8 && width >= 768;
    const tooSmall = geometry.w < 240 || geometry.h < 160;
    const topbarLoose = geometry.topbarGap != null && geometry.topbarGap > 24;
    const pushed = width >= 1440 && geometry.viewportLeft > 380;
    const bad = geometry.overflowX || geometry.outside.length > 0 || tooSmall || (width >= 768 && skew) || topbarLoose || pushed;
    rows.push({ pageId, width, bad, skew, ...geometry });
    if ((width === 1440 || width === 390) && (pageId === "home" || pageId === "ask" || pageId === "build" || pageId === "settings" || pageId === "insights" || pageId === "operations")) {
      await page.screenshot({ path: `${scratch}/fit-${pageId}-${width}.png`, animations: "disabled" });
    }
  }
}

await browser.close();
const failed = rows.filter((row) => row.bad);
writeFileSync(`${scratch}/viewport-fit.json`, JSON.stringify({ ok: failed.length === 0, errors, failed, rows }, null, 2));
if (errors.length) {
  throw new Error("page errors: " + errors.join(" | "));
}
if (failed.length) {
  console.log(JSON.stringify({ ok: false, failed }, null, 2));
  throw new Error(`viewport fit failed: ${failed.length} cases`);
}
console.log(JSON.stringify({ ok: true, pages: pages.length, widths, checked: rows.length }, null, 2));

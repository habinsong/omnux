import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scratch = process.env.OMNUX_LAUNCH_SCRATCH || fileURLToPath(new URL("../output/playwright/audit", import.meta.url));
const url = process.env.OMNUX_DESKTOP_URL || "http://127.0.0.1:1420/";
const outDir = `${scratch}/all`;
const widths = [1440, 768, 390];
const pages = [
  "home", "ask", "build", "automate", "explore", "projects", "activity", "logic",
  "insights", "notebooks", "skills", "extensions", "routing", "planning", "refactor",
  "agents", "settings", "operations", "shell"
];

mkdirSync(outDir, { recursive: true });

function mockGateway(page) {
  return page.routeWebSocket(/ws:\/\/(127\.0\.0\.1|localhost):41880\/ws\//, (socket) => {
    socket.send(JSON.stringify({ type: "auth_result", ok: true }));
    socket.onMessage((raw) => {
      const m = JSON.parse(raw);
      const reply = (type, fields = {}) => socket.send(JSON.stringify({ ...fields, type, requestId: m.requestId }));
      if (m.type === "ping") reply("pong", { webSocketAcceptedCount: 1, webSocketRoundTripCount: 1 });
      if (/^get_.*_models$/.test(m.type)) reply(m.type.slice(4), { items: ["grok-4.6", "grok-fixture-custom"], selected: "grok-4.6" });
      if (m.type === "list_conversations") reply("conversations", { scope: m.scope, mode: m.mode, items: [] });
      if (m.type === "list_memory_notes") reply("memory_notes", { items: [] });
      if (m.type === "list_projects") reply("projects", { items: [] });
    });
  });
}

function box(el) {
  if (!el || !el.getClientRects().length) return null;
  const b = el.getBoundingClientRect();
  return {
    x: Math.round(b.left),
    y: Math.round(b.top),
    w: Math.round(b.width),
    h: Math.round(b.height),
    r: Math.round(b.right),
    b: Math.round(b.bottom)
  };
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
  await page.waitForTimeout(320);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(180);
    const geometry = await page.evaluate((vpWidth) => {
      const doc = document.documentElement;
      const header = document.querySelector("header.sticky") || document.querySelector("main > header");
      const h1 = document.querySelector("h1");
      const tabs = document.querySelector('[role="tablist"]');
      const composer = document.querySelector(".chat-compose, .build-compose");
      const search = document.querySelector("[data-topbar-search]");
      const actions = document.querySelector("[data-topbar-actions]");
      const rail = document.querySelector("aside");
      const sub = document.querySelector("main > div.absolute, main > div[class*='lg:w-[260px]']");
      const surface = document.querySelector("[data-surface]");
      const hero = document.querySelector("textarea[aria-label='omnux 명령 입력']")?.closest(".relative") || document.querySelector("textarea[aria-label='omnux 명령 입력']");
      const drawer = [...document.querySelectorAll("button")].find((n) => (n.textContent || "").includes("이어서 작업하기"))?.closest(".w-full");
      const mainPad = document.querySelector("main .min-h-0.flex-1") || document.querySelector("main");
      const toBox = (el) => {
        if (!el || !el.getClientRects().length) return null;
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), bot: Math.round(b.bottom) };
      };
      let topbarGap = null;
      if (search && actions) {
        const s = search.getBoundingClientRect();
        const a = actions.getBoundingClientRect();
        topbarGap = Math.round(a.left - s.right);
      }
      const controls = [...document.querySelectorAll("button,input,textarea,select,a,[role='tab']")].filter((node) => node.getClientRects().length);
      // 스크롤/접힘 영역에 잘린 요소와 닫힌 서랍(transform 으로 화면 밖) 안의 요소는 보이지 않으므로 제외한다.
      const clippedByAncestor = (node, b) => {
        for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (style.overflowX === "visible" && style.overflowY === "visible") continue;
          const r = parent.getBoundingClientRect();
          if (b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1) return true;
        }
        return false;
      };
      const inClosedDrawer = (node, b) => {
        const offscreen = b.right <= 0 || b.left >= innerWidth || b.bottom <= 0 || b.top >= innerHeight;
        if (!offscreen) return false;
        for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (getComputedStyle(parent).transform !== "none") return true;
        }
        return false;
      };
      const outside = controls.filter((node) => {
        const b = node.getBoundingClientRect();
        const beyond = b.left < -1 || b.right > innerWidth + 1 || b.top < -1 || b.bottom > innerHeight + 1;
        return beyond && !clippedByAncestor(node, b) && !inClosedDrawer(node, b);
      }).map((n) => ({
        label: (n.getAttribute("aria-label") || n.textContent || "").trim().slice(0, 40),
        box: toBox(n)
      }));
      const tiny = controls.filter((node) => {
        const b = node.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && (b.width < 20 || b.height < 20);
      }).map((n) => ({
        label: (n.getAttribute("aria-label") || n.textContent || "").trim().slice(0, 32),
        w: Math.round(n.getBoundingClientRect().width),
        h: Math.round(n.getBoundingClientRect().height)
      }));
      const content = surface || h1?.closest(".flex.h-full") || mainPad;
      const contentBox = toBox(content);
      const contentCenterX = contentBox ? contentBox.x + contentBox.w / 2 : innerWidth / 2;
      const chromeH =
        (header?.getBoundingClientRect().height || 0) +
        (h1 ? h1.getBoundingClientRect().height + 12 : 0) +
        (tabs?.getBoundingClientRect().height || 0);
      const composerH = composer ? composer.getBoundingClientRect().height : 0;
      const railW = rail && getComputedStyle(rail).position !== "fixed" ? rail.getBoundingClientRect().width : (vpWidth >= 1024 ? 56 : 0);
      const subW = sub && getComputedStyle(sub).display !== "none" ? sub.getBoundingClientRect().width : 0;
      const usedLeft = (rail && getComputedStyle(rail).transform === "none" ? rail.getBoundingClientRect().width : 0) + (vpWidth >= 1024 && sub && getComputedStyle(sub).display !== "none" ? 260 : 0);
      return {
        overflowX: doc.scrollWidth > innerWidth + 1,
        pageScroll: doc.scrollHeight > innerHeight + 1,
        scrollW: doc.scrollWidth,
        scrollH: doc.scrollHeight,
        chromeH: Math.round(chromeH),
        chromeRatio: Math.round((chromeH / innerHeight) * 100),
        composerH: Math.round(composerH),
        composerRatio: Math.round((composerH / innerHeight) * 100),
        topbarGap,
        h1: (h1?.textContent || "").trim().slice(0, 40),
        rail: toBox(rail),
        railW: Math.round(railW),
        sub: toBox(sub),
        subW: Math.round(subW),
        usedLeft: Math.round(usedLeft),
        content: contentBox,
        // 레일과 서브패널이 차지한 왼쪽을 뺀 남은 영역의 중심과 비교한다.
        contentCenterSkew: Math.round(contentCenterX - (usedLeft + (innerWidth - usedLeft) / 2)),
        hero: toBox(hero),
        composer: toBox(composer),
        header: toBox(header),
        tabs: toBox(tabs),
        search: toBox(search),
        actions: toBox(actions),
        drawer: toBox(drawer),
        outside: outside.slice(0, 12),
        tiny: tiny.slice(0, 12),
        tinyCount: tiny.length,
        controlCount: controls.length
      };
    }, width);
    const bad =
      geometry.overflowX ||
      geometry.outside.length > 0 ||
      (geometry.topbarGap != null && geometry.topbarGap > 24) ||
      Math.abs(geometry.contentCenterSkew) > 80 && width >= 1440;
    rows.push({ pageId, width, bad, ...geometry });
    await page.screenshot({ path: `${outDir}/${pageId}-${width}.png`, animations: "disabled" });
  }
}

await browser.close();
const summary = {
  ok: errors.length === 0 && !rows.some((r) => r.bad),
  errors,
  bad: rows.filter((r) => r.bad).map((r) => ({
    pageId: r.pageId,
    width: r.width,
    overflowX: r.overflowX,
    topbarGap: r.topbarGap,
    outside: r.outside,
    contentCenterSkew: r.contentCenterSkew
  })),
  chrome: rows.filter((r) => r.chromeRatio >= 22).map((r) => ({ pageId: r.pageId, width: r.width, chromeRatio: r.chromeRatio, chromeH: r.chromeH, composerRatio: r.composerRatio, usedLeft: r.usedLeft })),
  skew: rows.filter((r) => Math.abs(r.contentCenterSkew) > 40).map((r) => ({ pageId: r.pageId, width: r.width, contentCenterSkew: r.contentCenterSkew, usedLeft: r.usedLeft, content: r.content })),
  composer: rows.filter((r) => r.composerH).map((r) => ({ pageId: r.pageId, width: r.width, composerH: r.composerH, composerRatio: r.composerRatio })),
  rows
};
writeFileSync(`${outDir}/audit.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  ok: summary.ok,
  errors: summary.errors,
  bad: summary.bad,
  chrome: summary.chrome,
  skew: summary.skew,
  composer: summary.composer
}, null, 2));

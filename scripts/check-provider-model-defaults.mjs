import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scratch = process.env.OMNUX_LAUNCH_SCRATCH || fileURLToPath(new URL("../output/playwright/provider-defaults", import.meta.url));
mkdirSync(scratch, { recursive: true });
const url = process.env.OMNUX_DESKTOP_URL || "http://127.0.0.1:1420/";

let groqSelected = "grok-4.6";
const groqItems = ["grok-4.6", "grok-fixture-custom"];

function mockGateway(page) {
  return page.routeWebSocket(/ws:\/\/(127\.0\.0\.1|localhost):41880\/ws\//, (socket) => {
    socket.send(JSON.stringify({ type: "auth_result", ok: true }));
    socket.onMessage((raw) => {
      const m = JSON.parse(raw);
      const reply = (type, fields = {}) => socket.send(JSON.stringify({ ...fields, type, requestId: m.requestId }));
      if (m.type === "ping") reply("pong", { webSocketAcceptedCount: 1, webSocketRoundTripCount: 1 });
      if (m.type === "get_groq_models") {
        reply("groq_models", { items: groqItems, selected: groqSelected });
        return;
      }
      if (/^get_.*_models$/.test(m.type)) {
        reply(m.type.slice(4), { items: ["grok-4.6", "grok-fixture-custom"], selected: "grok-4.6" });
      }
      if (m.type === "set_groq_model") {
        groqSelected = m.model;
        reply("groq_model_set", { ok: true, model: groqSelected });
        reply("groq_models", { items: groqItems, selected: groqSelected });
      }
      if (m.type === "list_conversations") reply("conversations", { scope: m.scope, mode: m.mode, items: [] });
      if (m.type === "list_memory_notes") reply("memory_notes", { items: [] });
    });
  });
}

const errors = [];
const log = [];
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
  const shell = (await import("/src/shell-store.ts")).useDesktopShellStore;
  auth.setState((s) => ({ auth: { ...s.auth, status: "authenticated" } }));
  shell.getState().markBridgeStatus("connected");
  window.__nav = nav;
});

await page.evaluate((id) => window.__nav.getState().setActivePage(id), "ask");
const chat = page.locator('[data-surface="chat"]');
await chat.waitFor();
await page.getByRole("tab", { name: "모델", exact: true }).click();
await chat.getByRole("combobox", { name: "응답 제공자", exact: true }).selectOption("grok");
await chat.getByRole("combobox", { name: "Grok 응답 모델", exact: true }).first().selectOption("grok-fixture-custom");
const askProvider = await chat.getByRole("combobox", { name: "응답 제공자", exact: true }).inputValue();
const askModel = await chat.getByRole("combobox", { name: "Grok 응답 모델", exact: true }).first().inputValue();
if (askProvider !== "grok") throw new Error(`ask provider not kept: ${askProvider}`);
if (askModel !== "grok-fixture-custom") throw new Error(`ask model not kept: ${askModel}`);
log.push({ surface: "ask", provider: askProvider, model: askModel });

await page.evaluate((id) => window.__nav.getState().setActivePage(id), "build");
const build = page.locator('[data-surface="build-workspace"]');
await build.waitFor();
await page.getByRole("tab", { name: "설정", exact: true }).click();
await build.getByRole("combobox", { name: "담당 모델 제공자", exact: true }).selectOption("grok");
const buildProvider = await build.getByRole("combobox", { name: "담당 모델 제공자", exact: true }).inputValue();
if (buildProvider !== "grok") throw new Error(`build provider not kept: ${buildProvider}`);
const buildModelBox = build.getByRole("combobox", { name: "담당 모델", exact: true });
if (await buildModelBox.count()) {
  const options = await buildModelBox.locator("option").allTextContents();
  const pick = options.find((value) => value && value !== "none") || options[0];
  if (pick) await buildModelBox.selectOption(pick);
  const buildModel = await buildModelBox.inputValue();
  if (!buildModel) throw new Error("build model empty after select");
  log.push({ surface: "build", provider: buildProvider, model: buildModel });
} else {
  log.push({ surface: "build", provider: buildProvider, model: "(auto)" });
}

await page.evaluate((id) => window.__nav.getState().setActivePage(id), "settings");
await page.getByRole("tab", { name: "모델·키", exact: true }).click();
await page.getByRole("tab", { name: "모델 선택", exact: true }).click();
const groqSelect = page.getByRole("combobox").filter({ has: page.locator("option", { hasText: "grok-fixture-custom" }) }).first();
await groqSelect.waitFor({ timeout: 8000 });
await groqSelect.selectOption("grok-fixture-custom");
if ((await groqSelect.inputValue()) !== "grok-fixture-custom") {
  throw new Error(`groq select value ${(await groqSelect.inputValue())}`);
}
await page.getByRole("button", { name: "적용", exact: true }).first().click();
await page.waitForFunction(() => document.body.innerText.includes("grok-fixture-custom로 적용"), null, { timeout: 8000 });
const badge = page.locator(".font-mono").filter({ hasText: "grok-fixture-custom" });
await badge.first().waitFor({ timeout: 8000 });
if (!(await badge.first().textContent())?.includes("grok-fixture-custom")) {
  throw new Error("settings default badge missing grok-fixture-custom");
}
log.push({ surface: "settings", defaultModel: "grok-fixture-custom" });

await page.screenshot({ path: `${scratch}/ui-settings.png`, animations: "disabled" });
await page.setViewportSize({ width: 390, height: 900 });
await page.screenshot({ path: `${scratch}/ui-settings-390.png`, animations: "disabled" });

await browser.close();
if (errors.length) throw new Error("page errors: " + errors.join(" | "));
writeFileSync(`${scratch}/feature-checks.log`, JSON.stringify({ ok: true, log, errors }, null, 2));
console.log(JSON.stringify({ ok: true, log }, null, 2));

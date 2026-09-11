import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scratch = process.env.OMNUX_LAUNCH_SCRATCH || fileURLToPath(new URL("../output/playwright/launch", import.meta.url));
mkdirSync(scratch, { recursive: true });
const url = "http://127.0.0.1:1420/";
const errors = [];

function mockGateway(page) {
  return page.routeWebSocket(/ws:\/\/(127\.0\.0\.1|localhost):41880\/ws\//, (socket) => {
    socket.send(JSON.stringify({ type: "auth_result", ok: true }));
    socket.onMessage((raw) => {
      const m = JSON.parse(raw);
      const reply = (type, fields = {}) => socket.send(JSON.stringify({ ...fields, type, requestId: m.requestId }));
      if (m.type === "ping") reply("pong", { webSocketAcceptedCount: 1, webSocketRoundTripCount: 1 });
      if (/^get_.*_models$/.test(m.type)) reply(m.type.slice(4), { items: ["grok-4.6"], selected: "grok-4.6" });
      if (m.type === "list_conversations") reply("conversations", { scope: m.scope, mode: m.mode, items: [] });
      if (m.type === "list_memory_notes") reply("memory_notes", { items: [] });
      if (m.type.startsWith("llm_chat_")) {
        const id = m.conversationId || "chat-launch";
        const answer = "픽스처 답변입니다.";
        reply("llm_chat_result", {
          conversationId: id,
          text: answer,
          conversation: {
            id,
            scope: "chat",
            mode: m.mode || "single",
            title: "론치 대화",
            messages: [
              { role: "user", text: m.text },
              { role: "assistant", text: answer, provider: "grok", model: "grok-4.6" }
            ]
          }
        });
      }
      if (String(m.type).startsWith("coding_run_")) {
        const id = m.conversationId || "build-launch";
        const summary = "픽스처 빌드 결과";
        reply("coding_result", {
          conversationId: id,
          summary,
          provider: "grok",
          model: "grok-4.6",
          mode: m.mode || "single",
          execution: { status: "ok", command: "python3 main.py", exitCode: 0, stdOut: "hello", stdErr: "", runDirectory: "/tmp/omnux-launch", entryFile: "main.py" },
          changedFiles: ["main.py"],
          conversation: {
            id,
            scope: "coding",
            mode: m.mode || "single",
            title: "론치 빌드",
            messages: [
              { role: "user", text: m.text },
              { role: "assistant", text: summary }
            ],
            latestCodingResult: {
              conversationId: id,
              summary,
              provider: "grok",
              model: "grok-4.6",
              mode: m.mode || "single",
              execution: { status: "ok", command: "python3 main.py", exitCode: 0, stdOut: "hello", stdErr: "", runDirectory: "/tmp/omnux-launch", entryFile: "main.py" },
              changedFiles: ["main.py"]
            }
          }
        });
      }
    });
  });
}

async function run(label) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (err) => errors.push(`${label}:${err.message}`));
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
  const shots = {};
  async function shot(name, pageId, surface) {
    await page.evaluate((id) => window.__nav.getState().setActivePage(id), pageId);
    if (surface) await page.locator(surface).waitFor({ timeout: 8000 });
    else await page.waitForTimeout(400);
    const box = surface
      ? await page.locator(surface).first().evaluate((el) => {
          const root = el.closest(".flex.h-full") || el;
          const r = root.getBoundingClientRect();
          return { w: r.width, h: r.height, left: r.left, right: innerWidth - r.right };
        })
      : await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight, left: 0, right: 0 }));
    if (box.w < 280 || box.h < 200) throw new Error(`${label} ${name} too small ${JSON.stringify(box)}`);
    const path = `${scratch}/ui-${name}${label === "second" ? "-2" : ""}.png`;
    await page.screenshot({ path, animations: "disabled" });
    shots[name] = { path, ...box };
  }
  await shot("home", "home", null);
  await shot("ask", "ask", '[data-surface="chat"]');
  await page.locator("#chat-request").fill("픽스처 질문");
  await page.getByRole("button", { name: "질문 보내기", exact: true }).click();
  await page.getByText("픽스처 질문", { exact: true }).waitFor();
  await page.getByText("픽스처 답변입니다.", { exact: true }).waitFor();
  const composerH = await page.locator(".chat-compose").evaluate((el) => el.getBoundingClientRect().height);
  if (composerH > 160) throw new Error(`${label} ask composer too tall ${composerH}`);
  await page.screenshot({ path: `${scratch}/ui-ask-turn${label === "second" ? "-2" : ""}.png`, animations: "disabled" });
  await shot("build", "build", '[data-surface="build-workspace"]');
  await page.locator("#build-workspace-request").fill("픽스처 빌드 요청");
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  const buildThread = page.getByLabel("빌드 대화");
  await buildThread.getByText("픽스처 빌드 요청", { exact: true }).waitFor();
  await buildThread.getByText("픽스처 빌드 결과", { exact: true }).waitFor();
  const buildComposerH = await page.locator(".build-compose").evaluate((el) => el.getBoundingClientRect().height);
  if (buildComposerH > 180) throw new Error(`${label} build composer too tall ${buildComposerH}`);
  await page.screenshot({ path: `${scratch}/ui-build-turn${label === "second" ? "-2" : ""}.png`, animations: "disabled" });
  await shot("logs", "insights", "h1");
  await shot("automate", "automate", "h1");
  await shot("settings", "settings", "h1");
  await page.setViewportSize({ width: 390, height: 900 });
  const overflow390 = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (overflow390) throw new Error(`${label} settings overflow-x at 390`);
  await page.screenshot({ path: `${scratch}/ui-settings-390${label === "second" ? "-2" : ""}.png`, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await browser.close();
  return shots;
}

const first = await run("first");
const second = await run("second");
if (errors.length) {
  writeFileSync(`${scratch}/launch.log`, JSON.stringify({ errors, first, second }, null, 2));
  throw new Error("page errors: " + errors.join(" | "));
}
writeFileSync(`${scratch}/launch.log`, JSON.stringify({ ok: true, first, second, errors }, null, 2));
console.log(JSON.stringify({ ok: true, first, second }, null, 2));

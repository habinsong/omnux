import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

// 격리 미들웨어와 새 브라우저 컨텍스트만 사용한다. LLM/로그인/사용자 브라우저 프로필은 사용하지 않는다.
export async function verifyExploreRuntime(session, baseUrl) {
  let sequence = 0;
  const calls = [];
  async function request(type, fields, responseType = type + "_result") {
    const requestId = `explore-contract-${++sequence}`;
    session.sendJson({ type, requestId, ...fields });
    const response = await session.waitForJson(message => message.type === responseType && message.requestId === requestId, `${type}/${fields.action || "read"}`, 30000);
    calls.push({ type, action: fields.action || "", ok: response.ok, requestId });
    return response;
  }
  const browserProfile = "runtime-browser", canvasProfile = "runtime-canvas";
  try {
    const fetched = await request("web_fetch", { url: baseUrl + "/healthz", extractMode: "text", maxChars: 20000 });
    assert.equal(fetched.status, 200);
    assert.ok(fetched.text.includes('"ok"'));
    assert.equal(fetched.error || "", "");
    const invalidSearch = await request("web_search", { query: "" }, "error");
    assert.equal(invalidSearch.requestType, "web_search");
    const created = await request("create_conversation", { scope: "chat", mode: "single", conversationTitle: "탐색 기록 검사" }, "conversation_created");
    const sessionKey = created.conversation.id;
    const listed = await request("sessions_list", { limit: 100 });
    assert.ok(listed.sessions.some(item => item.key === sessionKey));
    const note = await request("sessions_send", { sessionKey, message: "다음 작업에 참고할 내용", timeoutSeconds: 60 });
    assert.equal(note.status, "accepted");
    assert.ok(!note.reply);
    const history = await request("sessions_history", { sessionKey, limit: 100 });
    assert.ok(history.messages.some(message => message.text === "다음 작업에 참고할 내용"));
    const spawnStatus = await request("sessions_spawn", { action: "status" }, "sessions_spawn_result");
    assert.equal(spawnStatus.action, "status");
    const invalidSpawn = await request("sessions_spawn", { spawnTask: "" }, "error");
    assert.equal(invalidSpawn.requestType, "sessions_spawn");
    const opened = await request("browser", { action: "open", webFetchUrl: baseUrl + "/healthz", profile: browserProfile });
    assert.equal(opened.ok, true, opened.error);
    assert.equal(opened.adapter, "playwright");
    assert.equal(opened.running, true);
    assert.ok(opened.tabs.some(tab => tab.url === baseUrl + "/healthz"));
    const targetId = opened.activeTargetId;
    const invalidTarget = await request("browser", { action: "navigate", webFetchUrl: "about:blank", targetId: "missing", profile: browserProfile });
    assert.equal(invalidTarget.ok, false);
    assert.equal(invalidTarget.activeTargetId, targetId, "없는 탭을 요청하면 현재 탭을 대신 이동하지 않는다.");
    const focused = await request("browser", { action: "focus", targetId, profile: browserProfile });
    assert.equal(focused.ok, true);
    const browserImage = await request("browser", { action: "snapshot", profile: browserProfile });
    assert.ok(browserImage.snapshot.dataUrl.startsWith("data:image/png;base64,"));
    await request("browser", { action: "stop", profile: browserProfile });
    const restarted = await request("browser", { action: "open", url: baseUrl + "/healthz", profile: browserProfile });
    assert.equal(restarted.ok, true, restarted.error);
    assert.notEqual(restarted.activeTargetId, targetId, "재시작한 브라우저가 이전 탭 ID를 재사용하면 안 됩니다.");
    const staleClose = await request("browser", { action: "close", targetId, profile: browserProfile });
    assert.equal(staleClose.ok, false, "이전 실행의 탭 ID로 새 탭을 닫으면 안 됩니다.");
    const separate = await request("browser", { action: "status", profile: "untouched" });
    assert.equal(separate.running, false);

    const shown = await request("canvas", { action: "present", webFetchUrl: "about:blank", profile: canvasProfile });
    assert.equal(shown.ok, true, shown.error);
    const evaluated = await request("canvas", { action: "eval", text: "document.body.innerHTML='<h1>실제 캔버스</h1><button id=verify>확인</button>'; document.querySelector('#verify').onclick=()=>document.querySelector('h1').textContent='클릭 완료'; 1 + 2", profile: canvasProfile });
    assert.equal(evaluated.ok, true, evaluated.error);
    assert.equal(evaluated.evalResult, "3");
    const clicked = await request("canvas", { action: "eval", text: "document.querySelector('#verify').click();document.querySelector('h1').textContent", profile: canvasProfile });
    assert.equal(clicked.evalResult, "클릭 완료");
    const hidden = await request("canvas", { action: "hide", profile: canvasProfile });
    assert.equal(hidden.visible, false);
    await request("canvas", { action: "present", profile: canvasProfile });
    const restored = await request("canvas", { action: "eval", text: "document.querySelector('h1').textContent", profile: canvasProfile });
    assert.equal(restored.evalResult, "클릭 완료", "숨김 뒤에도 작성한 DOM을 유지한다.");
    const rejected = await request("canvas", { action: "a2ui_push", text: JSON.stringify({ invalid: true }), profile: canvasProfile });
    assert.equal(rejected.ok, false);
    const original = await request("canvas", { action: "eval", text: "document.querySelector('h1').textContent", profile: canvasProfile });
    assert.equal(original.evalResult, "클릭 완료", "유효하지 않은 선언형 화면은 현재 화면을 지우지 않는다.");
    const captured = await request("canvas", { action: "snapshot", outputFormat: "png", maxWidth: 640, profile: canvasProfile });
    assert.equal(captured.ok, true, captured.error);
    const image = Buffer.from(captured.snapshot.dataUrl.split(",")[1], "base64");
    assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(image.readUInt32BE(16), 640);
    assert.equal(image.readUInt32BE(20), 360);
    mkdirSync("output/playwright", { recursive: true });
    writeFileSync("output/playwright/explore-real-canvas.png", image);

    const messages = [
      { version: "v0.9.1", createSurface: { surfaceId: "form", catalogId: "https://a2ui.org/specification/v0_9_1/catalogs/basic/catalog.json", sendDataModel: true } },
      { version: "v0.9.1", updateComponents: { surfaceId: "form", components: [
        { id: "root", component: "Column", children: ["title", "name", "echo", "save"] },
        { id: "title", component: "Text", text: "선언형 화면" },
        { id: "name", component: "TextField", label: "이름", value: { path: "/name" } },
        { id: "echo", component: "Text", text: { path: "/name" } },
        { id: "save", component: "Button", text: "저장", action: { event: { name: "save", context: { name: { path: "/name" } } } }, checks: [{ call: "required", args: { value: { path: "/name" } }, message: "이름이 필요합니다." }] }
      ] } },
      { version: "v0.9.1", updateDataModel: { surfaceId: "form", value: { name: "" } } }
    ];
    const pushed = await request("canvas", { action: "a2ui_push", text: messages.map(message => JSON.stringify(message)).join("\n"), profile: canvasProfile });
    assert.equal(pushed.ok, true, pushed.error);
    assert.equal(pushed.a2uiRevision, 1);
    const disabled = await request("canvas", { action: "eval", text: "document.querySelector('button').disabled", profile: canvasProfile });
    assert.equal(disabled.evalResult, "true");
    const changed = await request("canvas", { action: "eval", text: "const input=document.querySelector('input');input.value='사용자 입력';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-component-id=echo]').textContent", profile: canvasProfile });
    assert.equal(changed.ok, true, changed.error);
    assert.equal(changed.evalResult, "사용자 입력");
    const button = await request("canvas", { action: "eval", text: "document.querySelector('button').click();document.querySelector('button').disabled", profile: canvasProfile });
    assert.equal(button.evalResult, "false");
    const event = await request("canvas", { action: "status", profile: canvasProfile });
    assert.equal(event.actionEvents[0].action.context.name, "사용자 입력");
    assert.equal(event.actionEvents[0].dataModel.name, "사용자 입력");
    const a2uiImage = await request("canvas", { action: "snapshot", outputFormat: "png", maxWidth: 640, profile: canvasProfile });
    writeFileSync("output/playwright/explore-real-a2ui.png", Buffer.from(a2uiImage.snapshot.dataUrl.split(",")[1], "base64"));
    const invalid = await request("canvas", { action: "a2ui_push", text: JSON.stringify({ version: "v0.9.1", updateComponents: { surfaceId: "form", components: [{ id: "root", component: "Column", children: ["root"] }] } }), profile: canvasProfile });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.a2uiRevision, 1);
    const kept = await request("canvas", { action: "eval", text: "document.querySelector('[data-component-id=echo]').textContent", profile: canvasProfile });
    assert.equal(kept.evalResult, "사용자 입력");
    const reset = await request("canvas", { action: "a2ui_reset", profile: canvasProfile });
    assert.equal(reset.a2uiRevision, 0);
    const removed = await request("canvas", { action: "eval", text: "document.body.textContent", profile: canvasProfile });
    assert.equal(removed.evalResult, "");
    await request("delete_conversation", { conversationId: sessionKey, scope: "chat", mode: "single" }, "conversation_deleted");
    return { calls, fetched, listed, history, spawnStatus, browser: opened, browserImage, canvas: shown, evaluated, captured, a2ui: pushed, event };
  } finally {
    await request("browser", { action: "stop", profile: browserProfile });
    await request("canvas", { action: "hide", profile: canvasProfile });
  }
}

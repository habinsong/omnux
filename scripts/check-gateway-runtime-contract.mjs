import assert from "node:assert/strict";
import { verifyCodingProjects } from "./check-coding-project-runtime.mjs";
import { verifyRoutineRuntime } from "./check-routine-runtime-contract.mjs";
import { verifyChatRuntime } from "./check-chat-runtime-contract.mjs";
import { verifyExploreRuntime } from "./check-explore-runtime-contract.mjs";
import { createGrokCliFixture } from "./grok-cli-fixture.mjs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, realpathSync, readdirSync, renameSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findNonLoopbackIPv4() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces ?? []) {
      if (item.family === "IPv4" && !item.internal && item.address) {
        return item.address;
      }
    }
  }

  return "";
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) {
    return;
  }

  processHandle.kill("SIGTERM");
  for (let i = 0; i < 20; i += 1) {
    if (processHandle.exitCode !== null) {
      return;
    }
    await sleep(100);
  }

  processHandle.kill("SIGKILL");
}

async function waitForHttpOk(url, logs) {
  let lastError = "";
  for (let i = 0; i < 200; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error.message;
    }

    await sleep(250);
  }

  throw new Error(`gateway did not become healthy: ${lastError}\n${logs()}`);
}

async function waitForLocalFallbackOtp(logs) {
  for (let i = 0; i < 100; i += 1) {
    const text = logs();
    const matches = [...text.matchAll(/\[otp\]\s+otp=(\d{6})\s+session=([a-f0-9]+)/gi)];
    const latest = matches.at(-1);
    if (latest) {
      return latest[1];
    }

    await sleep(100);
  }

  throw new Error(`local fallback otp was not printed\n${logs()}`);
}

async function fetchWithDesktopOrigin(url) {
  return fetch(url, {
    headers: {
      Origin: "http://localhost:1420"
    }
  });
}

function rawWebSocketHandshake({ host = "127.0.0.1", port, origin }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("websocket handshake timed out"));
    }, 5000);

    socket.on("connect", () => {
      const lines = [
        "GET /ws/ HTTP/1.1",
        `Host: ${host}:${port}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version: 13"
      ];
      if (origin) {
        lines.push(`Origin: ${origin}`);
      }
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    });

    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (!response.includes("\r\n\r\n")) {
        return;
      }

      clearTimeout(timeout);
      socket.destroy();
      const statusLine = response.split("\r\n", 1)[0] || "";
      const match = statusLine.match(/^HTTP\/1\.[01]\s+(\d+)/);
      resolve({
        status: match ? Number(match[1]) : 0,
        statusLine
      });
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function encodeClientFrame(opcode, payloadText = "") {
  const payload = Buffer.from(payloadText, "utf8");
  const extendedLengthBytes = payload.length <= 125 ? 0 : payload.length <= 65535 ? 2 : 8;
  const headerLength = 2 + extendedLengthBytes;
  const frame = Buffer.alloc(headerLength + 4 + payload.length);
  frame[0] = 0x80 | opcode;
  if (payload.length <= 125) {
    frame[1] = 0x80 | payload.length;
  } else if (payload.length <= 65535) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(payload.length, 2);
  } else {
    frame[1] = 0x80 | 127;
    frame.writeUInt32BE(0, 2);
    frame.writeUInt32BE(payload.length, 6);
  }

  const mask = randomBytes(4);
  mask.copy(frame, headerLength);
  for (let i = 0; i < payload.length; i += 1) {
    frame[headerLength + 4 + i] = payload[i] ^ mask[i % 4];
  }
  return frame;
}

function extractServerFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (buffer.length - offset < 4) {
        break;
      }
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) {
        break;
      }
      const high = buffer.readUInt32BE(offset + 2);
      const low = buffer.readUInt32BE(offset + 6);
      length = high * 2 ** 32 + low;
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (buffer.length - offset < frameLength) {
      break;
    }

    let payload = buffer.subarray(offset + headerLength + maskLength, offset + frameLength);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload.map((value, index) => value ^ mask[index % 4]));
    }

    frames.push({ opcode, payload });
    offset += frameLength;
  }

  return {
    frames,
    remaining: buffer.subarray(offset)
  };
}

function openRawWebSocketSession({ host = "127.0.0.1", port, origin }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let handshakeBuffer = Buffer.alloc(0);
    let frameBuffer = Buffer.alloc(0);
    let handshakeDone = false;
    let settled = false;
    const messages = [];
    const waiters = [];
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("websocket session handshake timed out"));
    }, 5000);

    const rejectWaiters = (error) => {
      while (waiters.length > 0) {
        const waiter = waiters.shift();
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
    };

    const dispatchMessage = (message) => {
      messages.push(message);
      for (let i = 0; i < waiters.length; i += 1) {
        const waiter = waiters[i];
        if (!waiter.predicate(message)) {
          continue;
        }

        waiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return;
      }
    };

    const handleFrameBytes = (chunk) => {
      frameBuffer = Buffer.concat([frameBuffer, chunk]);
      const extracted = extractServerFrames(frameBuffer);
      frameBuffer = extracted.remaining;
      for (const frame of extracted.frames) {
        if (frame.opcode === 0x1) {
          const text = frame.payload.toString("utf8");
          try {
            dispatchMessage(JSON.parse(text));
          } catch {
            dispatchMessage({ type: "__raw_text__", text });
          }
        }
      }
    };

    const session = {
      sendJson(message) {
        socket.write(encodeClientFrame(0x1, JSON.stringify(message)));
      },
      waitForJson(predicate, description, timeoutMs = 5000) {
        for (const message of messages) {
          if (predicate(message)) {
            return Promise.resolve(message);
          }
        }

        return new Promise((resolve, rejectWaiter) => {
          const waiter = {
            predicate,
            resolve,
            reject: rejectWaiter,
            timer: setTimeout(() => {
              const index = waiters.indexOf(waiter);
              if (index >= 0) {
                waiters.splice(index, 1);
              }
              rejectWaiter(new Error(`${description} timed out; received=${JSON.stringify(messages.filter(message => !["metrics_stream", "settings_state"].includes(message.type) && !String(message.type).endsWith("_models")).slice(-8))}`));
            }, timeoutMs)
          };
          waiters.push(waiter);
        });
      },
      close() {
        socket.write(encodeClientFrame(0x8));
        socket.end();
      }
    };

    socket.on("connect", () => {
      const lines = [
        "GET /ws/ HTTP/1.1",
        `Host: ${host}:${port}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
        "Sec-WebSocket-Version: 13"
      ];
      if (origin) {
        lines.push(`Origin: ${origin}`);
      }
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    });

    socket.on("data", (chunk) => {
      if (handshakeDone) {
        handleFrameBytes(chunk);
        return;
      }

      handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
      const headerEnd = handshakeBuffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        return;
      }

      const headerText = handshakeBuffer.subarray(0, headerEnd).toString("utf8");
      const statusLine = headerText.split("\r\n", 1)[0] || "";
      const match = statusLine.match(/^HTTP\/1\.[01]\s+(\d+)/);
      const status = match ? Number(match[1]) : 0;
      if (status !== 101) {
        clearTimeout(timeout);
        socket.destroy();
        reject(new Error(`websocket session expected 101 but received ${statusLine}`));
        return;
      }

      handshakeDone = true;
      settled = true;
      clearTimeout(timeout);
      resolve(session);
      const remaining = handshakeBuffer.subarray(headerEnd + 4);
      if (remaining.length > 0) {
        handleFrameBytes(remaining);
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        reject(error);
        return;
      }

      rejectWaiters(error);
    });

    socket.on("close", () => {
      rejectWaiters(new Error("websocket session closed"));
    });
  });
}

function waitForPong(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("websocket pong timed out"));
    }, 5000);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "ping" }));
    });

    socket.addEventListener("message", (event) => {
      const text = typeof event.data === "string" ? event.data : event.data.toString();
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }

      if (message.type === "pong") {
        clearTimeout(timeout);
        socket.close();
        resolve(message);
      }
    });

    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("websocket connection failed"));
    });
  });
}

// 미들웨어는 격리 HOME 으로 띄우므로 Playwright 가 받은 실제 브라우저 캐시를 명시해 넘긴다.
function resolvePlaywrightBrowsersPath() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Caches", "ms-playwright");
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "ms-playwright");
  return path.join(process.env.XDG_CACHE_HOME || path.join(home, ".cache"), "ms-playwright");
}

async function main() {
  const port = await findFreePort();
  const externalHost = findNonLoopbackIPv4();
  const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "omnux-gateway-runtime-"));
  const homeDir = path.join(runtimeRoot, "home");
  const workspaceRoot = path.join(runtimeRoot, "workspace", "coding");
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });

  const desktopIndexPath = path.join(runtimeRoot, "desktop", "index.html");
  const desktopHtml = '<!doctype html><html><body><div id="root">omnux-runtime-fixture</div></body></html>';
  mkdirSync(path.dirname(desktopIndexPath), { recursive: true });
  writeFileSync(desktopIndexPath, desktopHtml);

  const grokBinary = createGrokCliFixture(runtimeRoot);
  const isolatedSecrets = {};
  for (const [key, prefix] of [
    ["OMNUX_GROQ_API_KEY", "OMNUX_GROQ"], ["OMNUX_GEMINI_API_KEY", "OMNUX_GEMINI"],
    ["OMNUX_CEREBRAS_API_KEY", "OMNUX_CEREBRAS"], ["OMNUX_NVIDIA_API_KEY", "OMNUX_NVIDIA"],
    ["OMNUX_CODEX_API_KEY", "OMNUX_CODEX"], ["OMNUX_STT_API_KEY", "OMNUX_STT"],
    ["OMNUX_TELEGRAM_BOT_TOKEN", "OMNUX_TELEGRAM_BOT_TOKEN"], ["OMNUX_TELEGRAM_CHAT_ID", "OMNUX_TELEGRAM_CHAT_ID"]
  ]) {
    isolatedSecrets[key] = "";
    isolatedSecrets[`${key}_FILE`] = "";
    isolatedSecrets[`${prefix}_KEYCHAIN_SERVICE`] = `omnux-test-${port}-${prefix}`;
    isolatedSecrets[`${prefix}_KEYCHAIN_ACCOUNT`] = "fixture";
  }
  const logs = [];
  const middleware = spawn(
    "dotnet",
    ["run", "--project", "apps/omnux-middleware/Omnux.Middleware.csproj"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...isolatedSecrets,
        HOME: homeDir,
        OMNUX_GROK_BIN: grokBinary,
        OMNUX_COPILOT_BIN: path.join(runtimeRoot, "no-gh"),
        OMNUX_COPILOT_DIRECT_BIN: path.join(runtimeRoot, "no-copilot"),
        OMNUX_CODEX_BIN: path.join(runtimeRoot, "no-codex"),
        OMNUX_GROQ_BASE_URL: `http://127.0.0.1:${port}/disabled-provider`,
        OMNUX_GEMINI_BASE_URL: `http://127.0.0.1:${port}/disabled-provider`,
        OMNUX_CEREBRAS_BASE_URL: `http://127.0.0.1:${port}/disabled-provider`,
        OMNUX_NVIDIA_BASE_URL: `http://127.0.0.1:${port}/disabled-provider`,
        OMNUX_WS_PORT: String(port),
        OMNUX_ENABLE_AUTO_INSTALL: "0",
        OMNUX_BROWSER_TOOL_MODE: "auto",
        OMNUX_CANVAS_TOOL_MODE: "auto",
        OMNUX_BROWSER_HEADLESS: "true",
        OMNUX_BROWSER_CHANNEL: "",
        PLAYWRIGHT_BROWSERS_PATH: resolvePlaywrightBrowsersPath(),
        // 여러 기능을 한 연결에서 연속 검사한다. 제품 기본 요청 제한은 변경하지 않는다.
        OMNUX_WS_COMMANDS_PER_MINUTE: "300",
        OMNUX_DASHBOARD_INDEX: desktopIndexPath,
        OMNUX_WORKSPACE_ROOT: workspaceRoot,
        OMNUX_DASHBOARD_ACCESS_STATE_PATH: path.join(runtimeRoot, "dashboard_access.json"),
        OMNUX_ENABLE_LOCAL_OTP_FALLBACK: "1",
        OMNUX_GATEWAY_STARTUP_PROBE: "0",
        OMNUX_EXTERNAL_DASHBOARD: externalHost ? "1" : "0",
        OMNUX_SKIP_MEMORY_INDEX_BOOTSTRAP: "1",
        DOTNET_CLI_TELEMETRY_OPTOUT: "1",
        DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
        DOTNET_CLI_HOME: process.env.HOME || homeDir
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  middleware.stdout.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  middleware.stderr.on("data", (chunk) => logs.push(chunk.toString("utf8")));

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHttpOk(`${baseUrl}/healthz`, () => logs.join(""));
    const desktopHealth = await fetchWithDesktopOrigin(`${baseUrl}/healthz`);
    assert.equal(desktopHealth.status, 200, "desktop healthz fetch should pass");
    assert.equal(
      desktopHealth.headers.get("access-control-allow-origin"),
      "http://localhost:1420",
      "desktop healthz fetch should be CORS-readable from local Tauri dev origin"
    );

    const noOrigin = await rawWebSocketHandshake({ port });
    assert.equal(noOrigin.status, 101, "local websocket without Origin should be accepted");

    const loopbackCrossPortOrigin = await rawWebSocketHandshake({
      port,
      origin: "http://localhost:1420"
    });
    assert.equal(
      loopbackCrossPortOrigin.status,
      101,
      "desktop loopback websocket with cross-port Origin should be accepted"
    );

    const badOrigin = await rawWebSocketHandshake({
      port,
      origin: `http://evil.example:${port}`
    });
    assert.equal(badOrigin.status, 403, "websocket with mismatched Origin should be rejected");

    const localSession = await openRawWebSocketSession({ port });
    const authRequired = await localSession.waitForJson(
      (message) => message.type === "auth_required",
      "local auth_required"
    );
    assert.equal(authRequired.remoteDashboardClient, false, "local websocket should start in OTP-pending mode");
    localSession.sendJson({ type: "llm_chat_single", input: "should require auth" });
    const unauthorized = await localSession.waitForJson(
      (message) => message.type === "error" && message.message === "unauthorized",
      "local unauthorized protected message"
    );
    assert.equal(unauthorized.message, "unauthorized", "local protected messages should require auth");

    const appAuthSession = await openRawWebSocketSession({ port });
    await appAuthSession.waitForJson(
      (message) => message.type === "auth_required",
      "app auth session auth_required"
    );
    appAuthSession.sendJson({ type: "request_otp" });
    const otpResult = await appAuthSession.waitForJson(
      (message) => message.type === "otp_request_result",
      "app auth session otp_request_result"
    );
    assert.equal(otpResult.ok, true, "local fallback otp request should succeed");
    const otp = await waitForLocalFallbackOtp(() => logs.join(""));
    appAuthSession.sendJson({ type: "auth", otp, authTtlHours: 24 });
    const appAuth = await appAuthSession.waitForJson(
      (message) => message.type === "auth_result" && message.ok === true,
      "app auth session auth_result"
    );
    assert.equal(appAuth.ok, true, "app auth session should authenticate");

    localSession.sendJson({ type: "ping" });
    const promotedAuth = await localSession.waitForJson(
      (message) => message.type === "auth_result" && message.ok === true && message.resumed === true,
      "already-open local session trusted auth promotion"
    );
    assert.equal(promotedAuth.authToken, "", "trusted auth promotion must not send a bearer token");
    assert.equal(promotedAuth.remoteDashboardClient, false, "trusted auth promotion should keep local mode");
    if (process.argv.includes("--explore-only")) {
      const explored = await verifyExploreRuntime(appAuthSession, baseUrl);
      mkdirSync(path.join(repoRoot, "output", "playwright"), { recursive: true });
      writeFileSync(path.join(repoRoot, "output", "playwright", "explore-runtime-fixtures.json"), JSON.stringify(explored));
      console.log(JSON.stringify({ ok: true, calls: explored.calls }));
      return;
    }
    const chatRecords = await verifyChatRuntime(appAuthSession).catch(error => {
      const diagnostics = logs.join("").split("\n").filter(line => line.includes("[ws] client error:"));
      throw new Error(`${error.message}\n${diagnostics.join("\n")}`);
    });
    if (process.argv.includes("--chat-only")) { console.log(JSON.stringify({ ok: true, chatRecords })); return; }
    const exploration = await verifyExploreRuntime(appAuthSession, baseUrl);
    mkdirSync(path.join(repoRoot, "output", "playwright"), { recursive: true });
    writeFileSync(path.join(repoRoot, "output", "playwright", "explore-runtime-fixtures.json"), JSON.stringify(exploration));
    const automation = await verifyRoutineRuntime(appAuthSession);
    const codingProjects = await verifyCodingProjects(appAuthSession, runtimeRoot, baseUrl, grokBinary);
    mkdirSync(path.join(repoRoot,"output","playwright"),{recursive:true});
    writeFileSync(path.join(repoRoot,"output","playwright","coding-project-fixtures.json"),JSON.stringify(codingProjects,null,2));
    appAuthSession.sendJson({ type: "get_grok_models" });
    const grokModels = await appAuthSession.waitForJson(message => message.type === "grok_models", "Grok CLI catalog");
    assert.ok(grokModels.items.includes("grok-fixture-custom"), "Grok CLI catalog reaches the client");
    appAuthSession.sendJson({ type: "llm_chat_single", text: "GROK_FIXTURE_SINGLE 짧은 답변", provider: "grok", model: "grok-fixture-custom", webSearchEnabled: false, requestId: "grok-single" });
    const grokSingle = await appAuthSession.waitForJson(message => message.type === "llm_chat_result" && message.requestId === "grok-single", "Grok single routing", 30000);
    assert.equal(grokSingle.provider, "grok");
    assert.equal(grokSingle.model, "grok-fixture-custom");
    assert.ok(grokSingle.text.includes("GROK_FIXTURE_RESPONSE grok-fixture-custom"));
    appAuthSession.sendJson({ type: "llm_chat_orchestration", requestId: "grok-orchestration", text: "GROK_FIXTURE_ORCHESTRATION 모의 검토", provider: "grok", model: "grok-fixture-custom", groqModel: "none", geminiModel: "none", cerebrasModel: "none", nvidiaModel: "none", copilotModel: "none", codexModel: "none", grokModel: "grok-fixture-custom", webSearchEnabled: false });
    const grokOrchestration = await appAuthSession.waitForJson(message => message.type === "llm_chat_result" && message.mode === "orchestration", "Grok orchestration routing", 30000);
    assert.equal(grokOrchestration.requestId, "grok-orchestration");
    assert.ok(grokOrchestration.text.includes("GROK_FIXTURE_RESPONSE grok-fixture-custom"));
    appAuthSession.sendJson({ type: "llm_chat_multi", requestId: "grok-multi", text: "GROK_FIXTURE_MULTI 짧은 비교", groqModel: "none", geminiModel: "none", cerebrasModel: "none", nvidiaModel: "none", copilotModel: "none", codexModel: "none", grokModel: "grok-fixture-custom", summaryProvider: "grok", webSearchEnabled: false });
    const grokMulti = await appAuthSession.waitForJson(message => message.type === "llm_chat_multi_result", "Grok multi routing", 30000);
    assert.equal(grokMulti.requestId, "grok-multi");
    assert.equal(grokMulti.grokModel, "grok-fixture-custom");
    assert.ok(grokMulti.grok.includes("GROK_FIXTURE_RESPONSE grok-fixture-custom"));
    assert.equal(grokMulti.resolvedSummaryProvider, "grok");
    for (const mode of ["single", "orchestration", "multi"]) {
      appAuthSession.sendJson({type:`llm_chat_${mode}`,requestId:`empty-chat-${mode}`,text:""});
      const error = await appAuthSession.waitForJson(message => message.type === "error" && message.requestId === `empty-chat-${mode}`, "chat validation request ID");
      assert.equal(error.requestType, `llm_chat_${mode}`);
    }
    appAuthSession.sendJson({ type: "coding_run_single", requestId: "coding-single", text: "GROK_FIXTURE_CODE main.py에 triangular(n)을 구현하고 1부터 10까지의 합을 출력한 뒤 실행하세요.", provider: "grok", model: "grok-fixture-custom", language: "python", webSearchEnabled: false });
    const grokCoding = await appAuthSession.waitForJson(message => message.requestId === "coding-single" && (message.type === "coding_result" || message.type === "error"), "Grok coding file and execution", 90000);
    assert.equal(grokCoding.type, "coding_result", JSON.stringify(grokCoding));
    assert.equal(grokCoding.requestId, "coding-single");
    await appAuthSession.waitForJson(message => message.type === "coding_progress" && message.requestId === "coding-single", "coding progress request ID");
    assert.equal(grokCoding.provider, "grok");
    assert.equal(grokCoding.model, "grok-fixture-custom");
    assert.equal(grokCoding.execution.status, "ok", JSON.stringify(grokCoding.execution));
    assert.ok(grokCoding.changedFiles.some(file => file.endsWith("main.py")));
    const codePreview = await fetch(`${baseUrl}/api/coding-preview/${encodeURIComponent(grokCoding.conversationId)}/main/main.py`, {headers:{Origin:"http://localhost:1420"}});
    const codePreviewText = await codePreview.text();
    assert.equal(codePreview.status, 200, JSON.stringify({body:codePreviewText,execution:grokCoding.execution,files:grokCoding.changedFiles,binding:grokCoding.conversation?.codingProject}));
    assert.equal(codePreview.headers.get("access-control-allow-origin"), "http://localhost:1420", "데스크톱의 파일 내용 조회 CORS");
    assert.ok(codePreviewText.includes("def triangular(n)"), "파일 API는 실제 생성 파일을 반환한다");
    const windowsPreview = await fetch(`${baseUrl}/api/coding-preview/${encodeURIComponent(grokCoding.conversationId)}/main/main.py`, {headers:{Origin:"http://tauri.localhost"}});
    assert.equal(windowsPreview.headers.get("access-control-allow-origin"), "http://tauri.localhost", "Tauri Windows 파일 읽기");
    const previewHtml = "<!doctype html><html><body><p id='preview-status'>미리보기 준비</p><button id='preview-action' onclick=\"document.getElementById('preview-status').textContent='동작 확인'\">확인</button></body></html>";
    writeFileSync(path.join(grokCoding.execution.runDirectory, "preview-fixture.html"), previewHtml);
    const previewPath = `/api/coding-preview/${encodeURIComponent(grokCoding.conversationId)}/main/preview-fixture.html`;
    const framePreview = await fetch(`${baseUrl}${previewPath}`, {headers:{Origin:"http://localhost:1420"}});
    assert.equal(framePreview.status, 200, "HTML 미리보기 파일 제공");
    assert.equal(framePreview.headers.get("x-frame-options"), null, "다른 포트의 데스크톱 프레임을 SAMEORIGIN으로 차단하지 않는다");
    const previewHeaders = Object.fromEntries(framePreview.headers.entries());
    assert.ok(previewHeaders["content-security-policy"].includes("http://localhost:1420"));
    assert.ok(!previewHeaders["content-security-policy"].includes("frame-ancestors *"));
    assert.equal(await framePreview.text(), previewHtml);
    assert.ok(grokCoding.execution.stdOut.includes("55"), "Grok action plan executes real local Python");
    assert.ok(!path.relative(workspaceRoot, grokCoding.execution.runDirectory).startsWith(".."), "Grok code stays inside the isolated workspace");
    const codingVariants = {};
    for (const mode of ["orchestration", "multi"]) {
      appAuthSession.sendJson({ type: `coding_run_${mode}`, requestId: `coding-${mode}`, mode, text: "GROK_FIXTURE_CODE main.py에 triangular(n)을 구현하고 1부터 10까지의 합을 출력한 뒤 실행하세요.", provider: "grok", model: "grok-fixture-custom", language: "python", groqModel: "none", geminiModel: "none", cerebrasModel: "none", nvidiaModel: "none", copilotModel: "none", codexModel: "none", grokModel: "grok-fixture-custom", webSearchEnabled: false });
      const result = await appAuthSession.waitForJson(message => message.type === "coding_result" && message.requestId === `coding-${mode}`, `Grok ${mode} coding`, 90000);
      assert.equal(result.requestId, `coding-${mode}`);
      await appAuthSession.waitForJson(message => message.type === "coding_progress" && message.requestId === `coding-${mode}`, `${mode} progress request ID`);
      assert.ok(result.workers.some(worker => worker.provider === "grok" && worker.model === "grok-fixture-custom"), `${mode} keeps the selected Grok worker`);
      assert.ok(result.workers.some(worker => worker.execution.status === "ok" && worker.execution.stdOut.includes("55")), `${mode} executes the generated Python`);
      codingVariants[mode] = result;
      const planningIndex = result.workers.findIndex(worker => worker.execution.command === "(planning)");
      if (planningIndex >= 0) {
        appAuthSession.sendJson({type:"coding_execute_result",requestId:`execute-planning-${mode}`,conversationId:result.conversationId,target:`worker-${planningIndex}`});
        const planningRun = await appAuthSession.waitForJson(message => message.type === "coding_execute_result" && message.requestId === `execute-planning-${mode}`, "계획 표시는 실행 명령이 아님");
        assert.equal(planningRun.ok, false);
        assert.ok(!planningRun.execution, "계획 메타데이터를 셸에 전달하지 않는다");
      }
      const executableIndex = result.workers.findIndex(worker => worker.execution.status === "ok" && worker.changedFiles.length > 0);
      assert.ok(executableIndex >= 0);
      appAuthSession.sendJson({type:"coding_execute_result",requestId:`execute-worker-${mode}`,conversationId:result.conversationId,target:`worker-${executableIndex}`});
      const executedWorker = await appAuthSession.waitForJson(message => message.type === "coding_execute_result" && message.requestId === `execute-worker-${mode}`, "선택한 보조 모델 결과 실행", 30000);
      assert.equal(executedWorker.ok, true, JSON.stringify(executedWorker));
      assert.equal(executedWorker.execution.runDirectory, result.workers[executableIndex].execution.runDirectory);
      assert.ok(executedWorker.execution.stdOut.includes("55"));
      appAuthSession.sendJson({type:"get_conversation",requestId:`rerun-history-${mode}`,conversationId:result.conversationId});
      const rerunHistory = await appAuthSession.waitForJson(message => message.type === "conversation_detail" && message.requestId === `rerun-history-${mode}`, "다시 실행한 결과 저장");
      assert.equal(rerunHistory.conversation.latestCodingResult.workers[executableIndex].execution.command, executedWorker.execution.command);
      assert.equal(rerunHistory.conversation.latestCodingResult.workers[executableIndex].execution.stdout, executedWorker.execution.stdOut);


    }
    for (const mode of ["single", "orchestration", "multi"]) {
      appAuthSession.sendJson({type:`coding_run_${mode}`,requestId:`invalid-${mode}`,text:""});
      const error = await appAuthSession.waitForJson(message => message.type === "error" && message.requestId === `invalid-${mode}`, "invalid coding input request ID");
      assert.equal(error.requestType, `coding_run_${mode}`);
      assert.equal(error.message, "empty coding input");
    }
    appAuthSession.sendJson({type:"coding_execute_result",requestId:"execute-missing-target",conversationId:grokCoding.conversationId,target:"worker-999"});
    const missingTarget = await appAuthSession.waitForJson(message => message.type === "coding_execute_result" && message.requestId === "execute-missing-target", "없는 실행 대상 거부");
    assert.equal(missingTarget.ok, false);
    appAuthSession.sendJson({type:"get_conversation",requestId:"fresh-build-history",conversationId:grokCoding.conversationId});
    const history = await appAuthSession.waitForJson(message => message.type === "conversation_detail" && message.requestId === "fresh-build-history", "빌드 기록 요청 식별자");
    assert.equal(history.conversation.id, grokCoding.conversationId);
    assert.equal(history.conversation.latestCodingResult.execution.programStdOut, grokCoding.execution.programStdOut);
    assert.ok(!history.conversation.latestCodingResult.execution.programStdOut.includes("quality-gate"));
    appAuthSession.sendJson({type:"get_conversation",requestId:"fresh-build-history-missing",conversationId:"missing-fixture"});
    const missingHistory = await appAuthSession.waitForJson(message => message.type === "error" && message.requestId === "fresh-build-history-missing", "없는 빌드 기록 오류 식별자");
    assert.equal(missingHistory.requestType, "get_conversation");
    appAuthSession.sendJson({type:"list_conversations",requestId:"fresh-build-list",scope:"coding",mode:"single"});
    await appAuthSession.waitForJson(message => message.type === "conversations" && message.requestId === "fresh-build-list", "빌드 목록 요청 식별자");
    appAuthSession.sendJson({type:"coding_execute_result",requestId:"execute-valid",conversationId:grokCoding.conversationId});
    const execution = await appAuthSession.waitForJson(message => message.type === "coding_execute_result" && message.requestId === "execute-valid", "execute request ID", 30000);
    assert.equal(execution.ok, true, JSON.stringify(execution));
    assert.ok(execution.execution.stdOut.includes("55"));
    appAuthSession.sendJson({type:"coding_execute_result",requestId:"execute-empty"});
    const emptyExecution = await appAuthSession.waitForJson(message => message.type === "coding_execute_result" && message.requestId === "execute-empty", "empty execution request ID");
    assert.equal(emptyExecution.ok, false);
    appAuthSession.sendJson({type:"coding_execute_result",requestId:"execute-missing",conversationId:"missing-fixture"});
    const missingExecution = await appAuthSession.waitForJson(message => message.type === "coding_execute_result" && message.requestId === "execute-missing", "missing execution request ID");
    assert.equal(missingExecution.ok, false);
    appAuthSession.sendJson({ type: "plan_create", requestId: "fresh-plan-create", text: "GROK_FIXTURE_PLAN Python 파일 구현 계획", mode: "fast" });
    const grokPlan = await appAuthSession.waitForJson(message => message.type === "plan_result", "Grok planning route", 30000);
    assert.equal(grokPlan.payload.ok, true, JSON.stringify(grokPlan));
    assert.equal(grokPlan.requestId, "fresh-plan-create");
    assert.equal(grokPlan.payload.snapshot.plan.title, "Grok fixture plan");
    const planId = grokPlan.payload.snapshot.plan.planId;
    appAuthSession.sendJson({type:"plan_list",requestId:"fresh-plan-list"});
    await appAuthSession.waitForJson(message=>message.type==="plan_list_result"&&message.requestId==="fresh-plan-list", "plan list request identity");
    appAuthSession.sendJson({type:"plan_get",planId,requestId:"fresh-plan-read"});
    await appAuthSession.waitForJson(message=>message.type==="plan_result"&&message.requestId==="fresh-plan-read", "plan read request identity");
    appAuthSession.sendJson({ type: "plan_review", planId, requestId: "fresh-plan-review" });
    const grokReview = await appAuthSession.waitForJson(message => message.type === "plan_result" && message.payload?.snapshot?.review, "Grok review route", 30000);
    assert.equal(grokReview.payload.snapshot.review.reviewerRoute, "reviewer:grok:grok-4.6");
    assert.equal(grokReview.requestId, "fresh-plan-review");
    appAuthSession.sendJson({type:"task_graph_create",planId,requestId:"fresh-run-create"});
    const taskCreated = await appAuthSession.waitForJson(message=>message.type==="task_graph_result"&&message.action==="create", "task graph creation");
    const taskGraphId = taskCreated.payload.snapshot.graph.graphId;
    assert.equal(taskCreated.requestId,"fresh-run-create");
    appAuthSession.sendJson({type:"task_graph_list",requestId:"fresh-run-list"});
    await appAuthSession.waitForJson(message=>message.type==="task_graph_list_result"&&message.requestId==="fresh-run-list", "run list request identity");
    const taskNodes = [
      {taskId:"build",title:"파일 구현",category:"coding",prompt:"GROK_FIXTURE_TASK 중단한 파일에서 이어서 구현하세요.",dependsOn:[],requiredSkills:[],requiredTools:[]},
      {taskId:"verify",title:"파일 검증",category:"verification",prompt:"GROK_FIXTURE_TASK 남아 있는 파일을 검증하세요.",dependsOn:["build"],requiredSkills:[],requiredTools:[]}
    ];
    appAuthSession.sendJson({type:"task_graph_update",graphId:taskGraphId,graph:{nodes:taskNodes}});
    await appAuthSession.waitForJson(message=>message.type==="task_graph_result"&&message.action==="update", "task graph update");
    for (const action of ["resume", "retry"]) {
      appAuthSession.sendJson({type:`task_${action}`,graphId:taskGraphId,taskId:"build"});
      const blocked = await appAuthSession.waitForJson(message=>message.type==="task_graph_result"&&message.action===action, "unapproved task execution blocked");
      assert.equal(blocked.payload.ok,false);
      assert.ok(blocked.payload.message.includes("승인"));
    }
    appAuthSession.sendJson({type:"plan_approve",planId});
    await appAuthSession.waitForJson(message=>message.type==="plan_result"&&message.action==="approve", "task plan approval");
    const taskMarker = path.join(path.dirname(grokBinary),"checkpoint-marker.json");
    appAuthSession.sendJson({type:"task_graph_run",graphId:taskGraphId});
    const taskStarted = await appAuthSession.waitForJson(message=>message.type==="task_graph_result"&&message.action==="run", "task graph run");
    assert.equal(taskStarted.payload.ok,true,JSON.stringify(taskStarted));
    for(let attempt=0;attempt<200&&!existsSync(taskMarker);attempt++) await sleep(100);
    assert.ok(existsSync(taskMarker),"background coding task wrote files");
    const taskProcess=JSON.parse(readFileSync(taskMarker,"utf8"));
    appAuthSession.sendJson({type:"task_graph_cancel",graphId:taskGraphId});
    await appAuthSession.waitForJson(message=>message.type==="task_updated"&&message.graphId===taskGraphId&&message.task?.taskId==="build"&&String(message.task.status).toLowerCase()==="canceled", "background task cancellation",5000);
    appAuthSession.sendJson({type:"task_graph_get",graphId:taskGraphId});
    const taskCanceled = await appAuthSession.waitForJson(message=>message.type==="task_graph_result"&&message.action==="get"&&message.payload.snapshot?.executions?.some(item=>item.taskId==="build"&&item.status==="canceled"), "persisted task checkpoint");
    const firstAttempt=taskCanceled.payload.snapshot.executions.find(item=>item.taskId==="build");
    assert.ok(firstAttempt.conversationId,"task preserves coding conversation before completion");
    appAuthSession.sendJson({type:"task_retry",graphId:taskGraphId,taskId:"build"});
    await appAuthSession.waitForJson(message=>message.type==="task_updated"&&message.graphId===taskGraphId&&message.task?.taskId==="verify"&&String(message.task.status).toLowerCase()==="completed", "retry and dependent verification",90000);
    appAuthSession.sendJson({type:"task_graph_get",graphId:taskGraphId});
    const taskCompleted = await appAuthSession.waitForJson(message=>message.type==="task_graph_result"&&message.action==="get"&&message.payload.snapshot?.graph?.graphId===taskGraphId&&String(message.payload.snapshot.graph.status).toLowerCase()==="completed", "completed task graph");
    const taskSnapshot=taskCompleted.payload.snapshot;
    assert.equal(taskSnapshot.executions.length,3);
    assert.ok(taskSnapshot.executions.every(item=>item.conversationId===firstAttempt.conversationId));
    assert.equal(readFileSync(path.join(taskProcess.cwd,"kept.txt"),"utf8"),"keep this content");
    appAuthSession.sendJson({type:"task_output_get",graphId:taskGraphId,taskId:"build",timestamp:Date.parse(firstAttempt.startedAtUtc),requestId:"old-task-output"});
    const oldTaskOutput=await appAuthSession.waitForJson(message=>message.type==="task_output_result"&&message.requestId==="old-task-output", "previous attempt output");
    assert.equal(oldTaskOutput.payload.execution.status,"canceled");
    assert.ok(oldTaskOutput.payload.stdErr.includes("canceled"));
    appAuthSession.sendJson({type:"task_output_get",graphId:taskGraphId,taskId:"build",requestId:"latest-task-output"});
    const latestTaskOutput=await appAuthSession.waitForJson(message=>message.type==="task_output_result"&&message.requestId==="latest-task-output", "latest attempt output");
    assert.equal(latestTaskOutput.payload.execution.status,"ok");
    assert.ok(latestTaskOutput.payload.stdOut.includes("resumed"));
    const taskProgramOutput = JSON.parse(latestTaskOutput.payload.resultJson).execution.stdout;
    assert.equal(taskProgramOutput.trim(), "resumed", "task result separates program output from internal quality notes");
    assert.notEqual(latestTaskOutput.payload.execution.runtimePath,oldTaskOutput.payload.execution.runtimePath);
    appAuthSession.sendJson({type:"get_conversation",conversationId:firstAttempt.conversationId});
    const taskConversation = await appAuthSession.waitForJson(message=>message.type==="conversation_detail"&&message.conversation?.id===firstAttempt.conversationId, "task coding files are reachable");
    rmSync(taskMarker);
    appAuthSession.sendJson({ type: "llm_chat_single", text: "GROK_FIXTURE_FAILURE 오류 전달", provider: "grok", model: "grok-fixture-custom", webSearchEnabled: false, requestId: "grok-failure" });
    const grokFailure = await appAuthSession.waitForJson(message => message.type === "llm_chat_result" && message.requestId === "grok-failure", "Grok failure reporting", 30000);
    assert.match(grokFailure.text, /실패|오류|error/i);
    assert.ok(!grokFailure.text.includes("GROK_FIXTURE_RESPONSE"));

    appAuthSession.sendJson({type:"ping"});
    const pingBeforeRun = await appAuthSession.waitForJson(message => message.type === "pong", "ping before delayed coding");
    const waitingPidPath = path.join(path.dirname(grokBinary), "waiting.pid");
    appAuthSession.sendJson({type:"coding_run_single",requestId:"coding-cancel",text:"GROK_FIXTURE_WAIT GROK_FIXTURE_CODE main.py 작성",provider:"grok",model:"grok-fixture-custom",language:"python",webSearchEnabled:false});
    for(let attempt=0; attempt<100 && !existsSync(waitingPidPath); attempt++) await sleep(100);
    assert.ok(existsSync(waitingPidPath), "delayed fixture process started");
    const waitingPid = Number(readFileSync(waitingPidPath,"utf8"));
    process.kill(waitingPid, 0);
    appAuthSession.sendJson({type:"ping"});
    await appAuthSession.waitForJson(message => message.type === "pong" && message.webSocketRoundTripCount > pingBeforeRun.webSocketRoundTripCount, "ping during coding", 3000);
    appAuthSession.sendJson({type:"coding_cancel",requestId:"coding-cancel"});
    await appAuthSession.waitForJson(message => message.type === "coding_cancelled" && message.requestId === "coding-cancel", "coding cancellation", 5000);
    assert.throws(()=>process.kill(waitingPid,0), "cancelled CLI must have exited");

    const checkpointMarker = path.join(path.dirname(grokBinary), "checkpoint-marker.json");
    appAuthSession.sendJson({type:"coding_run_single",requestId:"coding-checkpoint",conversationTitle:"중단 복구 검증",text:"GROK_FIXTURE_CHECKPOINT 파일을 작성하고 실행하세요.",provider:"grok",model:"grok-fixture-custom",language:"python",webSearchEnabled:false});
    for(let attempt=0; attempt<100 && !existsSync(checkpointMarker); attempt++) await sleep(100);
    assert.ok(existsSync(checkpointMarker), "checkpoint files were created before cancellation");
    const checkpointProcess = JSON.parse(readFileSync(checkpointMarker,"utf8"));
    process.kill(checkpointProcess.pid,0);
    appAuthSession.sendJson({type:"coding_cancel",requestId:"coding-checkpoint"});
    const cancelledCheckpoint = await appAuthSession.waitForJson(message=>message.type==="coding_cancelled"&&message.requestId==="coding-checkpoint", "checkpoint cancellation", 5000);
    assert.ok(cancelledCheckpoint.conversation?.latestCodingResult, "cancel response includes the stored checkpoint");
    appAuthSession.sendJson({type:"list_conversations",scope:"coding",mode:"single"});
    const checkpointList = await appAuthSession.waitForJson(message=>message.type==="conversations"&&message.items?.some(item=>item.title==="중단 복구 검증"), "cancelled coding history");
    const checkpointId = checkpointList.items.find(item=>item.title==="중단 복구 검증").id;
    appAuthSession.sendJson({type:"get_conversation",conversationId:checkpointId});
    const checkpointDetail = await appAuthSession.waitForJson(message=>message.type==="conversation_detail"&&message.conversation?.id===checkpointId, "cancelled coding checkpoint");
    const checkpoint = checkpointDetail.conversation.latestCodingResult;
    assert.ok(checkpoint, "cancelled task must preserve its run directory and files in history");
    assert.equal(checkpoint.execution.status,"cancelled");
    assert.equal(realpathSync(checkpoint.execution.runDirectory),realpathSync(checkpointProcess.cwd));
    assert.ok(checkpoint.changedFiles.some(file=>file.endsWith("kept.txt")));
    assert.ok(checkpoint.resumeInput.includes("GROK_FIXTURE_CHECKPOINT"));
    assert.equal(checkpoint.resumeModels.grok,"grok-fixture-custom");
    const movedCheckpoint = path.join(runtimeRoot,"temporarily-moved-checkpoint");
    renameSync(checkpoint.execution.runDirectory,movedCheckpoint);
    try {
      const runCount = readdirSync(path.join(workspaceRoot,"runs")).length;
      appAuthSession.sendJson({type:"coding_run_single",requestId:"coding-resume-missing",conversationId:checkpointId,text:"GROK_FIXTURE_RESUME 이어가기",provider:"grok",model:"grok-fixture-custom",language:"python",webSearchEnabled:false});
      const missingCheckpoint = await appAuthSession.waitForJson(message=>message.type==="error"&&message.requestId==="coding-resume-missing", "missing checkpoint is not silently replaced");
      assert.ok(missingCheckpoint.message.includes("중단한 작업 폴더"));
      assert.equal(readdirSync(path.join(workspaceRoot,"runs")).length,runCount);
    } finally {
      renameSync(movedCheckpoint,checkpoint.execution.runDirectory);
    }
    appAuthSession.sendJson({type:"coding_run_single",requestId:"coding-resume",conversationId:checkpointId,text:"GROK_FIXTURE_RESUME 남아 있는 파일에서 이어서 완성하세요.",provider:"grok",model:"grok-fixture-custom",language:"python",webSearchEnabled:false});
    const resumed = await appAuthSession.waitForJson(message=>message.type==="coding_result"&&message.requestId==="coding-resume", "resume cancelled workspace", 90000);
    assert.equal(resumed.execution.runDirectory,checkpoint.execution.runDirectory);
    assert.equal(resumed.execution.status,"ok",JSON.stringify(resumed.execution));
    assert.ok(resumed.execution.stdOut.includes("resumed"));
    assert.equal(readFileSync(path.join(checkpoint.execution.runDirectory,"kept.txt"),"utf8"),"keep this content");

    for(const mode of ["orchestration","multi"]) {
      rmSync(checkpointMarker);
      const workerModels = {groqModel:"none",geminiModel:"none",cerebrasModel:"none",nvidiaModel:"none",copilotModel:"none",codexModel:"none",grokModel:"grok-fixture-custom"};
      appAuthSession.sendJson({type:`coding_run_${mode}`,mode,requestId:`checkpoint-${mode}`,conversationTitle:`중단 복구 ${mode}`,text:"GROK_FIXTURE_CHECKPOINT 파일을 작성하고 실행하세요.",provider:"grok",model:"grok-fixture-custom",language:"python",webSearchEnabled:false,...workerModels});
      for(let attempt=0; attempt<200 && !existsSync(checkpointMarker); attempt++) await sleep(100);
      if (!existsSync(checkpointMarker)) {
        const failed = await appAuthSession.waitForJson(message=>message.requestId===`checkpoint-${mode}`&&(message.type==="coding_result"||message.type==="error"), "checkpoint did not materialize",1000);
        assert.fail(JSON.stringify(failed).slice(0,3000));
      }
      assert.ok(existsSync(checkpointMarker), `${mode} partial files created`);
      const workerProcess = JSON.parse(readFileSync(checkpointMarker,"utf8"));
      process.kill(workerProcess.pid,0);
      appAuthSession.sendJson({type:"coding_cancel",requestId:`checkpoint-${mode}`});
      const stopped = await appAuthSession.waitForJson(message=>message.type==="coding_cancelled"&&message.requestId===`checkpoint-${mode}`, `${mode} checkpoint cancellation`, 5000);
      const partial = stopped.conversation.latestCodingResult;
      assert.equal(partial.execution.status,"cancelled");
      assert.ok(!path.relative(realpathSync(partial.execution.runDirectory),realpathSync(workerProcess.cwd)).startsWith(".."));
      const kept = partial.changedFiles.find(file=>file.endsWith("kept.txt"));
      assert.ok(kept);
      appAuthSession.sendJson({type:`coding_run_${mode}`,mode,requestId:`resume-${mode}`,conversationId:stopped.conversationId,text:"GROK_FIXTURE_RESUME 남아 있는 파일에서 이어서 완성하세요.",provider:"grok",model:"grok-fixture-custom",language:"python",webSearchEnabled:false,...workerModels});
      const continued = await appAuthSession.waitForJson(message=>message.type==="coding_result"&&message.requestId===`resume-${mode}`, `${mode} checkpoint resume`, 90000);
      // 다중 모드의 최종 실행 위치는 선택된 워커 폴더다.
      assert.equal(realpathSync(continued.execution.runDirectory),realpathSync(workerProcess.cwd));
      assert.equal(continued.execution.status,"ok",JSON.stringify(continued.execution));
      assert.ok(continued.execution.stdOut.includes("resumed") || continued.workers.some(worker=>worker.execution.stdOut.includes("resumed")), `${mode} executes resumed files`);
      assert.equal(readFileSync(kept,"utf8"),"keep this content");
    }

    // 실제 Python 자식 프로세스가 stdin을 읽지 않아도 중단할 수 있어야 한다.
    const programPath = path.join(grokCoding.execution.runDirectory, "main.py");
    const childPidPath = path.join(grokCoding.execution.runDirectory, "execution-child.pid");
    const grandchildPidPath = path.join(grokCoding.execution.runDirectory, "execution-grandchild.pid");
    writeFileSync(programPath, [
      "import os, sys, time, subprocess",
      "from pathlib import Path",
      "child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])",
      "Path('execution-grandchild.pid').write_text(str(child.pid))",
      "Path('execution-child.pid').write_text(str(os.getpid()))",
      "time.sleep(30)", ""
    ].join("\n"));
    appAuthSession.sendJson({type:"coding_execute_result",requestId:"execute-cancel",conversationId:grokCoding.conversationId,standardInput:"x".repeat(65536)});
    for(let attempt=0; attempt<100 && !existsSync(childPidPath); attempt++) await sleep(100);
    assert.ok(existsSync(childPidPath), "local Python execution started");
    const childPid = Number(readFileSync(childPidPath,"utf8"));
    const grandchildPid = Number(readFileSync(grandchildPidPath,"utf8"));
    process.kill(childPid,0);
    process.kill(grandchildPid,0);
    localSession.sendJson({type:"coding_cancel",requestId:"execute-cancel"});
    const wrongSessionCancel = await localSession.waitForJson(message => message.type === "coding_cancel_result" && message.requestId === "execute-cancel", "other session cancellation");
    assert.equal(wrongSessionCancel.ok,false);
    process.kill(childPid,0);
    appAuthSession.sendJson({type:"coding_execute_result",requestId:"execute-cancel",conversationId:grokCoding.conversationId});
    await appAuthSession.waitForJson(message => message.type === "coding_request_active" && message.requestId === "execute-cancel", "duplicate request ID remains active");
    appAuthSession.sendJson({type:"coding_execute_result",requestId:"execute-overlap",conversationId:grokCoding.conversationId});
    const busy = await appAuthSession.waitForJson(message => message.type === "error" && message.requestId === "execute-overlap", "overlapping coding execution");
    assert.ok(busy.message.startsWith("coding_busy:"));
    appAuthSession.sendJson({type:"coding_cancel",requestId:"execute-cancel"});
    await appAuthSession.waitForJson(message => message.type === "coding_cancelled" && message.requestId === "execute-cancel", "local execution cancellation", 5000);
    for(const pid of [childPid,grandchildPid]) {
      for(let attempt=0; attempt<50; attempt++) {
        try { process.kill(pid,0); } catch { break; }
        await sleep(100);
      }
      assert.throws(()=>process.kill(pid,0), "cancelled Python descendants must have exited");
    }
    assert.equal(readFileSync(programPath,"utf8").includes("time.sleep(30)"),true,"cancellation preserves files");
    writeFileSync(programPath,codePreviewText);
    const artifactDirectory = path.join(repoRoot, "output", "playwright");
    mkdirSync(artifactDirectory, { recursive: true });
    writeFileSync(path.join(artifactDirectory, "grok-gateway-fixtures.json"), JSON.stringify({ codingProjects, codingVariants, automation, single: grokSingle, multi: grokMulti, orchestration: grokOrchestration, coding: grokCoding, checkpoint:cancelledCheckpoint, resumed, tasks:{snapshot:taskSnapshot,canceled:taskCanceled.payload.snapshot,conversation:taskConversation,oldOutput:oldTaskOutput,latestOutput:latestTaskOutput}, preview: { path: previewPath, html: previewHtml, headers: previewHeaders } }, null, 2));
    rmSync(waitingPidPath);
    appAuthSession.sendJson({type:"coding_run_single",requestId:"coding-disconnect",text:"GROK_FIXTURE_WAIT GROK_FIXTURE_CODE main.py 작성",provider:"grok",model:"grok-fixture-custom",language:"python",webSearchEnabled:false});
    for(let attempt=0; attempt<100 && !existsSync(waitingPidPath); attempt++) await sleep(100);
    assert.ok(existsSync(waitingPidPath), "disconnect fixture started");
    const disconnectPid = Number(readFileSync(waitingPidPath,"utf8"));
    process.kill(disconnectPid,0);
    appAuthSession.close();
    for(let attempt=0; attempt<50; attempt++) {
      try { process.kill(disconnectPid,0); } catch { break; }
      await sleep(100);
    }
    assert.throws(()=>process.kill(disconnectPid,0), "disconnected coding CLI must have exited");
    localSession.close();
    await sleep(250);

    const remoteChecks = [];
    if (externalHost) {
      const remoteNoOrigin = await rawWebSocketHandshake({ host: externalHost, port });
      assert.equal(remoteNoOrigin.status, 403, "remote websocket without Origin should be rejected");

      const remoteOrigin = `http://${externalHost}:1420`;
      const remoteHealth = await fetch(`http://${externalHost}:${port}/healthz`, {
        headers: {
          Origin: remoteOrigin
        }
      });
      assert.equal(remoteHealth.status, 200, "remote healthz should pass");
      assert.equal(
        remoteHealth.headers.get("access-control-allow-origin"),
        remoteOrigin,
        "remote Tauri UI should be CORS-readable from port 1420"
      );

      const remoteSession = await openRawWebSocketSession({ host: externalHost, port, origin: remoteOrigin });
      const remoteAuth = await remoteSession.waitForJson(
        (message) => message.type === "auth_result",
        "remote auth_result"
      );
      assert.equal(remoteAuth.ok, true, "remote dashboard client should be auto-approved");
      assert.equal(remoteAuth.remoteDashboardClient, true, "remote dashboard client should be marked remote");
      assert.equal(remoteAuth.remoteLimited, true, "remote dashboard client should enter limited mode");

      remoteSession.sendJson({ type: "auth", otp: "000000" });
      const blockedAuth = await remoteSession.waitForJson(
        (message) => message.type === "error" && message.message === "forbidden_remote_limited_action",
        "remote limited auth block"
      );

      remoteSession.sendJson({ type: "request_otp" });
      const blockedOtpRequest = await remoteSession.waitForJson(
        (message) =>
          message.type === "error"
          && message.message === "forbidden_remote_limited_action"
          && message !== blockedAuth,
        "remote limited otp request block"
      );

      remoteSession.sendJson({ type: "resume_auth", authToken: "invalid-remote-token" });
      const blockedResumeAuth = await remoteSession.waitForJson(
        (message) =>
          message.type === "error"
          && message.message === "forbidden_remote_limited_action"
          && message !== blockedAuth
          && message !== blockedOtpRequest,
        "remote limited auth resume block"
      );

      const grokAuthErrors = new Set([blockedAuth, blockedOtpRequest, blockedResumeAuth]);
      for (const type of ["get_grok_status", "start_grok_login", "cancel_grok_login", "logout_grok"]) {
        remoteSession.sendJson({ type });
        const blocked = await remoteSession.waitForJson(
          (message) => message.type === "error" && message.message === "forbidden_remote_limited_action" && !grokAuthErrors.has(message),
          `remote Grok auth block: ${type}`
        );
        grokAuthErrors.add(blocked);
      }

      const remoteSettings = await remoteSession.waitForJson(
        (message) => message.type === "settings_state",
        "remote settings_state"
      );
      assert.equal(remoteSettings.remoteDashboardClient, true, "remote settings should be marked remote");
      assert.ok(
        Array.isArray(remoteSettings.dashboardExternalUrls)
          && remoteSettings.dashboardExternalUrls.includes(`http://${externalHost}:${port}/`),
        "외부 URL은 데스크톱 UI를 제공하는 미들웨어 HTTP 포트를 가리켜야 한다"
      );
      assert.ok(
        !remoteSettings.dashboardExternalUrls.includes(`http://${externalHost}:1420/`),
        "외부 URL은 별도 개발 서버에 의존하지 않는다"
      );
      const advertisedUi = await fetch(`http://${externalHost}:${port}/`);
      assert.equal(advertisedUi.status, 200, "외부 URL로 데스크톱 HTML을 읽을 수 있어야 한다");
      assert.equal(await advertisedUi.text(), desktopHtml, "외부 URL은 설정된 데스크톱 파일을 제공해야 한다");


      remoteSession.sendJson({ type: "list_conversations", scope: "chat", mode: "single" });
      const conversations = await remoteSession.waitForJson(
        (message) => message.type === "conversations",
        "remote read-only conversations",
        10000
      );
      assert.equal(conversations.scope, "chat", "remote read-only conversation list should preserve scope");
      assert.equal(conversations.mode, "single", "remote read-only conversation list should preserve mode");
      assert.ok(Array.isArray(conversations.items), "remote read-only conversation list should return items");

      remoteSession.sendJson({ type: "projects_list" });
      const projectsState = await remoteSession.waitForJson(
        (message) => message.type === "projects_state",
        "remote read-only projects"
      );
      assert.ok(Array.isArray(projectsState.items), "remote read-only projects should return items");

      remoteSession.sendJson({ type: "get_routines" });
      const routinesState = await remoteSession.waitForJson(
        (message) => message.type === "routines_state",
        "remote read-only routines"
      );
      assert.ok(Array.isArray(routinesState.items), "remote read-only routines should return items");

      remoteSession.sendJson({ type: "get_metrics" });
      const firstMetrics = await remoteSession.waitForJson(
        (message) => message.type === "metrics",
        "remote read-only metrics first response"
      );
      assert.ok(
        Object.hasOwn(firstMetrics, "payload"),
        "remote read-only metrics first response should return payload"
      );

      remoteSession.sendJson({ type: "get_metrics" });
      const secondMetrics = await remoteSession.waitForJson(
        (message) => message.type === "metrics" && message !== firstMetrics,
        "remote read-only metrics second response"
      );
      assert.ok(
        Object.hasOwn(secondMetrics, "payload"),
        "remote read-only metrics second response should return payload"
      );

      remoteSession.sendJson({ type: "llm_chat_single", input: "remote execution should be blocked" });
      const blocked = await remoteSession.waitForJson(
        (message) =>
          message.type === "error"
          && message.message === "forbidden_remote_limited_action"
          && message !== blockedAuth
          && message !== blockedOtpRequest
          && message !== blockedResumeAuth,
        "remote limited execution block"
      );
      assert.equal(
        blocked.message,
        "forbidden_remote_limited_action",
        "remote limited mode should block execution messages before dispatch"
      );
      remoteSession.close();

      remoteChecks.push(
        "remote_tauri_ui_healthz_cors",
        "remote_tauri_ui_origin_accept",
        "external_urls_serve_desktop_html_on_middleware_port",
        "websocket_no_origin_remote_reject",
        "remote_limited_auto_auth",
        "remote_limited_auth_messages_block",
        "remote_grok_oauth_blocked",
        "remote_limited_read_only_allow",
        "remote_limited_projects_read_allow",
        "remote_limited_routines_read_allow",
        "remote_limited_metrics_read_allow",
        "remote_limited_execution_block"
      );
    } else {
      remoteChecks.push("remote_limited_runtime_skipped_no_non_loopback_ipv4");
    }

    await waitForPong(`ws://127.0.0.1:${port}/ws/`);
    const ready = await fetchWithDesktopOrigin(`${baseUrl}/readyz`);
    assert.equal(ready.status, 200, "readyz should pass after websocket ping/pong");
    assert.equal(
      ready.headers.get("access-control-allow-origin"),
      "http://localhost:1420",
      "desktop readyz fetch should be CORS-readable from local Tauri dev origin"
    );

    console.log(JSON.stringify({
      ok: true,
      port,
      checks: [
        "healthz",
        "desktop_healthz_cors",
        "grok_cli_catalog",
        "grok_single_selected_model",
        "grok_orchestration_worker_and_summary",
        "grok_failure_reporting",
        "grok_multi_worker_and_summary",
        "grok_coding_file_and_python_execution",
        "grok_orchestration_and_multi_coding",
        "coding_ping_during_run",
        "coding_cli_cancellation",
        "coding_other_session_cancel_rejected",
        "coding_duplicate_id_does_not_restart",
        "coding_overlapping_run_rejected",
        "coding_stdin_and_descendant_cancellation",
        "coding_disconnect_terminates_cli",
        "coding_cancelled_checkpoint_persisted",
        "coding_resume_reuses_files",
        "coding_missing_checkpoint_rejected",
        "coding_orchestration_and_multi_resume",
        "task_checkpoint_retry_preserves_workspace",
        "task_attempt_history_output",
        "grok_plan_and_review",
        "websocket_no_origin_local_accept",
        "websocket_bad_origin_reject",
        "websocket_local_unauthorized_protected_reject",
        "websocket_local_open_session_trusted_auth_promote",
        ...remoteChecks,
        "readyz_after_ping",
        "desktop_readyz_cors"
      ]
    }, null, 2));
  } finally {
    await stopProcess(middleware);
    rmSync(runtimeRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

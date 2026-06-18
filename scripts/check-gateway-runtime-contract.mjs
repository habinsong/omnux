import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
              rejectWaiter(new Error(`${description} timed out; received=${JSON.stringify(messages)}`));
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

async function main() {
  const port = await findFreePort();
  const externalHost = findNonLoopbackIPv4();
  const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "omnux-gateway-runtime-"));
  const homeDir = path.join(runtimeRoot, "home");
  const workspaceRoot = path.join(runtimeRoot, "workspace", "coding");
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });

  const logs = [];
  const middleware = spawn(
    "dotnet",
    ["run", "--project", "apps/omnux-middleware/Omnux.Middleware.csproj"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: homeDir,
        OMNUX_WS_PORT: String(port),
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
    appAuthSession.close();
    localSession.close();
    await sleep(250);

    const remoteChecks = [];
    if (externalHost) {
      const remoteNoOrigin = await rawWebSocketHandshake({ host: externalHost, port });
      assert.equal(remoteNoOrigin.status, 403, "remote websocket without Origin should be rejected");

      const remoteOrigin = `http://${externalHost}:${port}`;
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

      const remoteSettings = await remoteSession.waitForJson(
        (message) => message.type === "settings_state",
        "remote settings_state"
      );
      assert.equal(remoteSettings.remoteDashboardClient, true, "remote settings should be marked remote");

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
        "websocket_no_origin_remote_reject",
        "remote_limited_auto_auth",
        "remote_limited_auth_messages_block",
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

    const firstIndex = await fetch(`${baseUrl}/`);
    assert.equal(firstIndex.status, 200, "dashboard index should load");
    const etag = firstIndex.headers.get("etag");
    assert.ok(etag, "dashboard index should expose ETag");
    assert.ok(firstIndex.headers.get("last-modified"), "dashboard index should expose Last-Modified");

    const cachedIndex = await fetch(`${baseUrl}/`, {
      headers: {
        "If-None-Match": etag
      }
    });
    assert.equal(cachedIndex.status, 304, "dashboard index should support conditional 304");

    console.log(JSON.stringify({
      ok: true,
      port,
      checks: [
        "healthz",
        "desktop_healthz_cors",
        "websocket_no_origin_local_accept",
        "websocket_bad_origin_reject",
        "websocket_local_unauthorized_protected_reject",
        "websocket_local_open_session_trusted_auth_promote",
        ...remoteChecks,
        "readyz_after_ping",
        "desktop_readyz_cors",
        "static_index_etag_304"
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

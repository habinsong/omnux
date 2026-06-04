import { useEffect } from "react";
import { DESKTOP_MIDDLEWARE_ENDPOINT_CANDIDATES, type DesktopMiddlewareEndpointCandidate } from "./middleware-contract";
import { useDesktopShellStore } from "./shell-store";

const PONG_TIMEOUT_MS = 3500;
const HTTP_PROBE_TIMEOUT_MS = 2500;

let probeActive = false;
let retryTimer: number | undefined;

type HttpProbeResult = {
  status: "ok" | "not_ready" | "error";
  detail: string;
};

function clearRetryTimer() {
  if (retryTimer !== undefined) {
    window.clearTimeout(retryTimer);
    retryTimer = undefined;
  }
}

function resolveReconnectDelayMs() {
  const { runtime } = useDesktopShellStore.getState();
  const attempt = Math.max(runtime.reconnectAttempts, 1);
  return Math.min(
    runtime.reconnectPolicy.initialDelayMs * attempt,
    runtime.reconnectPolicy.maxDelayMs
  );
}

function scheduleRetry(reason: string) {
  const { runtime, markHealthProbe, scheduleNextReconnect } = useDesktopShellStore.getState();
  if (runtime.reconnectAttempts >= runtime.reconnectPolicy.maxAttempts) {
    markHealthProbe("error", reason);
    return;
  }

  markHealthProbe("not_ready", reason);
  scheduleNextReconnect();
  const delay = resolveReconnectDelayMs();
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined;
    void runProbe();
  }, delay);
}

async function probeHttpEndpoint(
  endpoint: "healthz" | "readyz",
  url: string
): Promise<HttpProbeResult> {
  const { markHttpProbe } = useDesktopShellStore.getState();

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), HTTP_PROBE_TIMEOUT_MS);
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    window.clearTimeout(timeoutId);
    const payload = await response.json().catch(() => null) as { reason?: string } | null;
    const status = response.ok ? "ok" : response.status === 503 ? "not_ready" : "error";
    const reason = payload && typeof payload.reason === "string" ? `, reason=${payload.reason}` : "";
    const detail = `http ${response.status}${reason}`;
    markHttpProbe(endpoint, status, detail);
    return { status, detail };
  } catch (error) {
    const detail = error instanceof Error ? error.message : `${endpoint} probe failed`;
    markHttpProbe(endpoint, "error", detail);
    return { status: "error", detail };
  }
}

function uniqueEndpointCandidates(): DesktopMiddlewareEndpointCandidate[] {
  const runtime = useDesktopShellStore.getState().runtime;
  const current = {
    port: 0,
    wsUrl: runtime.wsUrl,
    healthUrl: runtime.healthUrl,
    readyUrl: runtime.readyUrl
  };
  const seen = new Set<string>();
  return [current, ...DESKTOP_MIDDLEWARE_ENDPOINT_CANDIDATES].filter((candidate) => {
    const key = candidate.healthUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function resolveGatewayEndpoint(): Promise<{ endpoint: DesktopMiddlewareEndpointCandidate; health: HttpProbeResult } | null> {
  const { setRuntimeEndpoint } = useDesktopShellStore.getState();
  let lastHealth: HttpProbeResult | null = null;
  for (const endpoint of uniqueEndpointCandidates()) {
    const health = await probeHttpEndpoint("healthz", endpoint.healthUrl);
    lastHealth = health;
    if (health.status === "ok") {
      setRuntimeEndpoint(endpoint);
      return { endpoint, health };
    }
  }

  return lastHealth
    ? { endpoint: uniqueEndpointCandidates()[0], health: lastHealth }
    : null;
}

async function runProbe() {
  if (probeActive) {
    return;
  }

  const { markWaiting, markHealthProbe } = useDesktopShellStore.getState();
  probeActive = true;
  markWaiting();

  const resolved = await resolveGatewayEndpoint();
  const health = resolved?.health ?? { status: "error" as const, detail: "gateway endpoint unavailable" };
  if (health.status !== "ok") {
    probeActive = false;
    scheduleRetry(`healthz ${health.detail}`);
    return;
  }

  const runtime = useDesktopShellStore.getState().runtime;
  const readyBefore = await probeHttpEndpoint("readyz", runtime.readyUrl);
  if (readyBefore.status === "error") {
    probeActive = false;
    scheduleRetry(`readyz ${readyBefore.detail}`);
    return;
  }

  let settled = false;
  let socket: WebSocket | null = null;
  let timeoutId: number | undefined;

  const cleanup = () => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    probeActive = false;
  };

  const settleFailure = (message: string) => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    try {
      socket?.close();
    } catch (_err) {
      // 이미 닫힌 소켓은 무시한다.
    }
    scheduleRetry(message);
  };

  try {
    socket = new WebSocket(runtime.wsUrl);
  } catch (error) {
    settleFailure(error instanceof Error ? error.message : "middleware websocket 생성 실패");
    return;
  }

  timeoutId = window.setTimeout(() => {
    settleFailure("pong timeout");
  }, PONG_TIMEOUT_MS);

  socket.addEventListener("open", () => {
    try {
      socket?.send(JSON.stringify({ type: "ping" }));
    } catch (error) {
      settleFailure(error instanceof Error ? error.message : "ping 전송 실패");
    }
  });

  socket.addEventListener("message", (event) => {
    if (settled) {
      return;
    }

    try {
      const message = JSON.parse(String(event.data || "{}")) as { type?: string };
      if (message.type !== "pong") {
        return;
      }

      settled = true;
      socket?.close();
      void (async () => {
        const latestRuntime = useDesktopShellStore.getState().runtime;
        const readyAfter = await probeHttpEndpoint("readyz", latestRuntime.readyUrl);
        cleanup();
        if (readyAfter.status === "ok") {
          markHealthProbe("ok", "healthz/readyz/ws pong");
          return;
        }

        scheduleRetry(`readyz after pong ${readyAfter.detail}`);
      })();
    } catch (error) {
      settleFailure(error instanceof Error ? error.message : "websocket message 파싱 실패");
    }
  });

  socket.addEventListener("error", () => {
    settleFailure("middleware websocket 연결 실패");
  });

  socket.addEventListener("close", () => {
    settleFailure("pong 수신 전 websocket 종료");
  });
}

export function triggerMiddlewareRuntimeProbe() {
  clearRetryTimer();
  void runProbe();
}

export function useMiddlewareRuntimeProbe() {
  useEffect(() => {
    triggerMiddlewareRuntimeProbe();
    return () => clearRetryTimer();
  }, []);
}

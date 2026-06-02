import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useDesktopShellStore, type MiddlewareBootstrapPhase } from "./shell-store";

type MiddlewareBootstrapEvent = {
  phase?: MiddlewareBootstrapPhase;
  pid?: number | null;
  message?: string;
};

const MIDDLEWARE_BOOTSTRAP_EVENT = "omnux://middleware-bootstrap";
const BOOTSTRAP_PHASES = new Set<MiddlewareBootstrapPhase>([
  "idle",
  "starting",
  "started",
  "stderr",
  "error",
  "terminated",
  "stopping"
]);

function normalizeBootstrapEvent(payload: unknown): MiddlewareBootstrapEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload as Record<string, unknown>;
  const phase =
    typeof value.phase === "string" && BOOTSTRAP_PHASES.has(value.phase as MiddlewareBootstrapPhase)
      ? (value.phase as MiddlewareBootstrapPhase)
      : null;

  if (!phase || typeof value.message !== "string") {
    return null;
  }

  return {
    phase,
    pid: typeof value.pid === "number" ? value.pid : null,
    message: value.message
  };
}

export function useMiddlewareBootstrapEvents() {
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<MiddlewareBootstrapEvent>(MIDDLEWARE_BOOTSTRAP_EVENT, (event) => {
      const payload = normalizeBootstrapEvent(event.payload);
      if (!payload) {
        return;
      }

      useDesktopShellStore.getState().markBootstrapEvent(
        payload.phase as MiddlewareBootstrapPhase,
        payload.pid ?? null,
        payload.message ?? ".NET 미들웨어 bootstrap 이벤트"
      );
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }

      unlisten = dispose;
    }).catch((error) => {
      useDesktopShellStore.getState().markBootstrapEvent(
        "error",
        null,
        error instanceof Error ? error.message : "middleware bootstrap event listen 실패"
      );
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}

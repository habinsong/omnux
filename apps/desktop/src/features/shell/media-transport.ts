import { invoke, isTauri } from "@tauri-apps/api/core";

export interface MediaData {
  title: string;
  artist: string;
  album: string;
  source: string | null;
  playing: boolean;
  position: number;
  duration: number;
  art_url: string | null;
}

export type MediaControlAction =
  | "toggle"
  | "seek_backward"
  | "seek_forward"
  | "next_track"
  | "previous_track";

const MEDIA_BRIDGE_ORIGIN = "http://127.0.0.1:41881";
/** 연속 실패가 이 횟수를 넘으면 브리지를 없는 것으로 보고 요청을 멈춘다. */
export const MEDIA_BRIDGE_FAILURE_LIMIT = 3;
const MEDIA_REFRESH_RECHECK_KEY = "omnux:media-refresh-recheck";
export const MEDIA_REFRESH_RECHECK_DELAY_MS = 2000;
export const MEDIA_REFRESH_RECHECK_EVENT = "omnux:media-refresh-recheck";

// 네이티브 셸 밖(일반 브라우저)에서는 41881 미디어 브리지가 없다.
// 계속 요청하면 거절된 연결 오류가 콘솔을 채워 실제 오류를 가린다.
// 몇 번 실패하면 멈추고, 사용자가 명시적으로 다시 시도할 때만 재개한다.
let bridgeFailureCount = 0;
let bridgeUnavailable = false;

/** 브리지가 없다고 판단한 상태인지. 화면이 '세션 없음'과 '브리지 없음'을 구분해 표시한다. */
export function isMediaBridgeUnavailable(): boolean {
  return bridgeUnavailable;
}

/** 사용자가 직접 다시 시도할 때 호출한다. 실패 누적을 지우고 다시 요청하게 한다. */
export function resetMediaBridgeAvailability(): void {
  bridgeFailureCount = 0;
  bridgeUnavailable = false;
}

function recordBridgeFailure(): void {
  bridgeFailureCount += 1;
  if (bridgeFailureCount >= MEDIA_BRIDGE_FAILURE_LIMIT) bridgeUnavailable = true;
}

function pageLoadedByRefresh(): boolean {
  if (typeof performance === "undefined" || typeof PerformanceNavigationTiming === "undefined") return false;
  const navigation = performance.getEntriesByType("navigation")[0];
  return navigation instanceof PerformanceNavigationTiming && navigation.type === "reload";
}

export function markMediaRefreshRecheck(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(MEDIA_REFRESH_RECHECK_KEY, String(Date.now()));
}

export function consumeMediaRefreshRecheck(): boolean {
  if (typeof window === "undefined") return false;
  const marked = window.sessionStorage.getItem(MEDIA_REFRESH_RECHECK_KEY);
  if (marked !== null) {
    window.sessionStorage.removeItem(MEDIA_REFRESH_RECHECK_KEY);
    return true;
  }
  return pageLoadedByRefresh();
}

async function requestBridge<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MEDIA_BRIDGE_ORIGIN}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  if (!response.ok) {
    throw new Error(`미디어 브리지 HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getMediaInfo(): Promise<MediaData | null> {
  if (isTauri()) {
    return invoke<MediaData | null>("get_media_info");
  }
  if (bridgeUnavailable) {
    return null;
  }
  try {
    const data = await requestBridge<MediaData | null>("/media");
    bridgeFailureCount = 0;
    return data;
  } catch {
    recordBridgeFailure();
    return null;
  }
}

export async function controlMedia(action: MediaControlAction): Promise<void> {
  if (isTauri()) {
    await invoke("control_media", { action });
    return;
  }
  // 사용자가 직접 누른 조작이다. 이전 실패 때문에 막지 않는다.
  resetMediaBridgeAvailability();
  await requestBridge<{ ok: boolean }>("/media/control", {
    method: "POST",
    body: JSON.stringify({ action })
  });
}

export async function seekMedia(position: number): Promise<void> {
  if (isTauri()) {
    await invoke("seek_media", { position });
    return;
  }
  resetMediaBridgeAvailability();
  await requestBridge<{ ok: boolean }>("/media/seek", {
    method: "POST",
    body: JSON.stringify({ position })
  });
}

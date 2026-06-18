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
const MEDIA_REFRESH_RECHECK_KEY = "omnux:media-refresh-recheck";
export const MEDIA_REFRESH_RECHECK_DELAY_MS = 2000;
export const MEDIA_REFRESH_RECHECK_EVENT = "omnux:media-refresh-recheck";

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
  try {
    return await requestBridge<MediaData | null>("/media");
  } catch {
    return null;
  }
}

export async function controlMedia(action: MediaControlAction): Promise<void> {
  if (isTauri()) {
    await invoke("control_media", { action });
    return;
  }
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
  await requestBridge<{ ok: boolean }>("/media/seek", {
    method: "POST",
    body: JSON.stringify({ position })
  });
}

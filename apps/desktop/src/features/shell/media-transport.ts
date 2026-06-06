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

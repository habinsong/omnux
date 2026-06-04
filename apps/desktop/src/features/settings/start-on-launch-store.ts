import { isTauri, invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type StartOnLaunchState = {
  supported: boolean;
  enabled: boolean;
  configuredPath: string;
  message: string;
};

type StartOnLaunchStore = {
  state: StartOnLaunchState;
  loading: boolean;
  pending: boolean;
  lastError: string;
  load: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<StartOnLaunchState | null>;
};

const UNSUPPORTED_STATE: StartOnLaunchState = {
  supported: false,
  enabled: false,
  configuredPath: "",
  message: "Tauri 데스크톱 앱에서만 OS 자동 시작을 설정할 수 있습니다."
};

function normalizeState(value: unknown): StartOnLaunchState {
  const payload = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    supported: payload.supported === true,
    enabled: payload.enabled === true,
    configuredPath: String(payload.configuredPath || ""),
    message: String(payload.message || "")
  };
}

async function invokeStartOnLaunchState(): Promise<StartOnLaunchState> {
  if (!isTauri()) return UNSUPPORTED_STATE;
  return normalizeState(await invoke("get_start_on_launch_state"));
}

async function invokeSetStartOnLaunch(enabled: boolean): Promise<StartOnLaunchState> {
  if (!isTauri()) return UNSUPPORTED_STATE;
  return normalizeState(await invoke("set_start_on_launch", { enabled }));
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export const useStartOnLaunchStore = create<StartOnLaunchStore>((set) => ({
  state: UNSUPPORTED_STATE,
  loading: false,
  pending: false,
  lastError: "",
  load: async () => {
    set({ loading: true, lastError: "" });
    try {
      set({ state: await invokeStartOnLaunchState(), loading: false });
    } catch (error) {
      set({
        loading: false,
        lastError: errorMessage(error, "자동 시작 상태를 조회하지 못했습니다.")
      });
    }
  },
  setEnabled: async (enabled) => {
    set({ pending: true, lastError: "" });
    try {
      const state = await invokeSetStartOnLaunch(enabled);
      set({ state, pending: false });
      return state;
    } catch (error) {
      set({
        pending: false,
        lastError: errorMessage(error, "자동 시작 설정을 저장하지 못했습니다.")
      });
      return null;
    }
  }
}));

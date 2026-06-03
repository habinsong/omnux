import { useEffect } from "react";
import { create } from "zustand";
import { requestDesktopRoutine, subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";

type RoutineItem = {
  id: string;
  title: string;
  enabled: boolean;
  toolProfile: string;
  scheduleSummary: string;
  preview: string;
};

type AutomateState = {
  routines: RoutineItem[];
  selectedRoutineId: string;
  pending: boolean;
  lastMessage: string;
  loadRoutines: () => void;
  selectRoutine: (id: string) => void;
  runRoutine: (id: string) => void;
  deleteRoutine: (id: string) => void;
};

export const useAutomateStore = create<AutomateState>((set) => ({
  routines: [],
  selectedRoutineId: "",
  pending: false,
  lastMessage: "",
  loadRoutines: () => {
    set({ pending: true });
    if (!requestDesktopRoutine.listRoutines()) {
      set({ pending: false, lastMessage: "루틴 목록 요청을 전송하지 못했다." });
    }
  },
  selectRoutine: (id) => set({ selectedRoutineId: id }),
  runRoutine: (id) => {
    if (!id) return;
    set({ pending: true, selectedRoutineId: id });
    if (!requestDesktopRoutine.runRoutine(id)) {
      set({ pending: false, lastMessage: "루틴 실행 요청을 전송하지 못했다." });
    }
  },
  deleteRoutine: (id) => {
    if (!id) return;
    if (!window.confirm("루틴을 삭제할까요?")) return;
    set({ pending: true, selectedRoutineId: id });
    if (!requestDesktopRoutine.deleteRoutine(id)) {
      set({ pending: false, lastMessage: "루틴 삭제 요청을 전송하지 못했다." });
    }
  }
}));

function normalizeList(value: unknown): RoutineItem[] {
  return Array.isArray(value)
    ? value.map((item) => {
        const record = item as Record<string, unknown>;
        return {
          id: String(record.id || record.routineId || ""),
          title: String(record.title || record.name || "루틴"),
          enabled: !!record.enabled,
          toolProfile: String(record.toolProfile || record.profile || ""),
          scheduleSummary: String(record.scheduleSummary || record.schedule || ""),
          preview: String(record.preview || record.description || "")
        };
      }).filter((item) => item.id)
    : [];
}

export function useAutomatePageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
    if (message.type === "routines_state") {
      useAutomateStore.setState({
        routines: normalizeList(message.items),
        pending: false
      });
      return;
    }

    if (message.type === "routine_result") {
      useAutomateStore.setState({
        pending: false,
        lastMessage: String(message.message || ""),
        selectedRoutineId: String((message.routine as { id?: string } | undefined)?.id || "")
      });
      return;
    }

    if (message.type === "routine_progress") {
      useAutomateStore.setState({
        lastMessage: String(message.message || ""),
        pending: true
      });
      return;
    }

    if (message.type === "error") {
      useAutomateStore.setState({
        pending: false,
        lastMessage: String(message.message || "오류")
      });
    }
    });
  }, []);
}

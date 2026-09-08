import { create } from "zustand";
import { exploreRequestId, sendExploreCommand, type ExploreCommand } from "../middleware/explore-workspace-gateway";
import { rows, text, type Payload } from "./explore-model";

type Operation = "list" | "history" | "message" | "spawn" | "status";
type Pending = { id: string; session?: string; text?: string };
type SessionExploreState = {
  items: Payload[]; selected: string; history: Payload | null; message: string; spawn: Payload | null; status: Payload | null;
  task: string; label: string; runtime: "acp" | "codex"; mode: "run" | "session" | "command"; timeout: number; thread: boolean;
  pending: Partial<Record<Operation, Pending>>; error: string; notice: string;
  request: (operation: Operation, type: ExploreCommand, fields: Payload) => void;
  refresh: () => void; open: (key: string) => void; append: () => void; create: () => void;
};
export const useSessionExplore = create<SessionExploreState>((set, get) => ({
  items: [], selected: "", history: null, message: "", spawn: null, status: null,
  task: "", label: "", runtime: "acp", mode: "run", timeout: 900, thread: true, pending: {}, error: "", notice: "",
  request: (operation, type, fields) => {
    if (get().pending[operation]) return;
    const id = exploreRequestId();
    set(state => ({ pending: { ...state.pending, [operation]: { id, session: text(fields.sessionKey), text: text(fields.message) } }, error: "", notice: "" }));
    if (!sendExploreCommand(type, id, fields)) set(state => ({ pending: { ...state.pending, [operation]: undefined }, error: "요청을 보내지 못했습니다. 작성한 내용은 유지됩니다." }));
  },
  refresh: () => get().request("list", "sessions_list", { limit: 100 }),
  open: key => { if (key) get().request("history", "sessions_history", { sessionKey: key, limit: 100 }); },
  append: () => { const state = get(); if (state.selected && state.message.trim()) state.request("message", "sessions_send", { sessionKey: state.selected, message: state.message.trim(), timeoutSeconds: 0 }); },
  create: () => {
    const state = get();
    if (!state.task.trim()) return;
    state.request("spawn", "sessions_spawn", { task: state.task.trim(), label: state.label.trim(), runtime: state.runtime, mode: state.mode, runTimeoutSeconds: state.timeout, timeoutSeconds: state.timeout, thread: state.thread });
  }
}));

export function receiveSessionExplore(message: Payload) {
  const state = useSessionExplore.getState();
  const match = Object.entries(state.pending).find(([, pending]) => pending && pending.id === message.requestId);
  if (!match) return;
  const [operation, pending] = match as [Operation, Pending];
  const responseTypes: Record<Operation, string> = { list: "sessions_list_result", history: "sessions_history_result", message: "sessions_send_result", spawn: "sessions_spawn_result", status: "sessions_spawn_result" };
  if (message.type !== "error" && message.type !== responseTypes[operation]) return;
  useSessionExplore.setState(current => ({ pending: { ...current.pending, [operation]: undefined } }));
  const error = text(message.error) || (message.type === "error" ? text(message.message) || "요청에 실패했습니다." : "");
  if (error || message.breakerBlocked === true) { useSessionExplore.setState({ error: error || text(message.breakerMessage) || "현재 작업을 실행할 수 없습니다." }); return; }
  if (operation === "list") useSessionExplore.setState({ items: rows(message.sessions) });
  if (operation === "history") useSessionExplore.setState({ selected: text(message.sessionKey), history: message });
  if (operation === "message") {
    if (state.selected === pending.session) state.open(state.selected);
    useSessionExplore.setState(current => ({ notice: message.messageTruncated ? "길이 제한으로 메시지 일부를 남겼습니다. 원래 입력은 유지됩니다." : "메시지를 작업 기록에 남겼습니다.", message: current.message.trim() === pending.text && !message.messageTruncated ? "" : current.message }));
  }
  if (operation === "spawn") { useSessionExplore.setState({ spawn: message }); state.refresh(); }
  if (operation === "status") useSessionExplore.setState({ status: message });
}
export function disconnectSessionExplore() {
  if (Object.values(useSessionExplore.getState().pending).some(Boolean)) useSessionExplore.setState({ pending: {}, error: "연결이 끊겨 처리 결과를 확인할 수 없습니다. 입력을 보존했습니다." });
}

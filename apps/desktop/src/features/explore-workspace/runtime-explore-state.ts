import { create } from "zustand";
import { exploreRequestId, sendExploreCommand } from "../middleware/explore-workspace-gateway";
import { readFrame, text, type Frame, type Payload } from "./explore-model";

export type RuntimeKind = "browser" | "canvas";
type RuntimePane = { url: string; profile: string; pending: { id: string; action: string } | null; result: Payload | null; frame: Frame | null; error: string };
type RuntimeExploreState = {
  browser: RuntimePane;
  canvas: RuntimePane;
  script: string;
  definition: string;
  evaluation: string | null;
  width: number;
  patch: (kind: RuntimeKind, patch: Partial<RuntimePane>) => void;
  run: (kind: RuntimeKind, action: string, fields?: Payload) => void;
};
const empty = (): RuntimePane => ({ url: "", profile: "default", pending: null, result: null, frame: null, error: "" });
export const useRuntimeExplore = create<RuntimeExploreState>((set, get) => ({
  browser: empty(), canvas: empty(), script: "", definition: "", evaluation: null, width: 1280,
  patch: (kind, patch) => set(state => ({ [kind]: { ...state[kind], ...patch } })),
  run: (kind, action, fields = {}) => {
    const current = get()[kind];
    if (current.pending) return;
    const id = exploreRequestId();
    get().patch(kind, { pending: { id, action }, error: "" });
    if (!sendExploreCommand(kind, id, { ...fields, action, profile: current.profile.trim() || "default" })) {
      get().patch(kind, { pending: null, error: "요청을 보내지 못했습니다. 입력과 이전 화면은 유지됩니다." });
    }
  }
}));

export function receiveRuntimeExplore(message: Payload) {
  const state = useRuntimeExplore.getState();
  const kind = (["browser", "canvas"] as const).find(key => state[key].pending && state[key].pending.id === message.requestId);
  if (!kind) return;
  const current = state[kind], action = current.pending!.action;
  if (message.type === "error") { state.patch(kind, { pending: null, error: text(message.message) || "요청에 실패했습니다." }); return; }
  if (message.type !== kind + "_result") return;
  const frame = readFrame(message.snapshot), ok = message.ok === true;
  const stopped = kind === "browser" && (message.running === false || !message.activeTargetId);
  state.patch(kind, { pending: null, result: message, error: ok ? "" : text(message.error) || "동작을 완료하지 못했습니다.",
    ...(stopped ? { frame: null } : frame ? { frame } : {}),
    ...(ok && action === "a2ui_reset" ? { frame: null } : {})
  });
  if (ok && action === "eval") useRuntimeExplore.setState({ evaluation: text(message.evalResult) });
  const canCapture = kind === "browser" ? !!message.activeTargetId : message.visible === true;
  if (ok && canCapture && ["start", "open", "navigate", "present", "focus", "close", "eval", "a2ui_push", "a2ui_reset"].includes(action)) {
    useRuntimeExplore.getState().run(kind, "snapshot", { maxWidth: state.width, outputFormat: "png" });
  }
}
export function disconnectRuntimeExplore() {
  const state = useRuntimeExplore.getState();
  for (const kind of ["browser", "canvas"] as const) if (state[kind].pending) state.patch(kind, { pending: null, error: "연결이 끊겨 동작 완료 여부를 확인할 수 없습니다. 다시 연결한 뒤 상태를 확인해 주세요." });
}

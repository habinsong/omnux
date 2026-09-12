import { useEffect } from "react";
import { create } from "zustand";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { SLICE_TIMEOUT_MS } from "../middleware/slice-state";
import { sendAutomationCommand, type AutomationCommand } from "../middleware/automation-workspace-gateway";
import { array, automationPayload, emptyAutomationForm, formError, parseAutomation, parsePreview, parseRunDetail, string, type Automation, type AutomationForm, type Preview, type RunDetail } from "./automation-model";

type Slot = "list" | "scheduler" | "preview" | "change" | "detail";
type Pending = { id: string; type: AutomationCommand; fields: Record<string, unknown> };
type Confirmation = { title: string; message: string; action: "delete" | "resend"; id: string; timestamp?: number };
type State = {
  items: Automation[]; selectedId: string; form: AutomationForm; editId: string | null; editor: boolean;
  preview: Preview | null; detail: RunDetail | null; selectedTime: number | null; error: string; progress: string;
  scheduler: { enabled: boolean; error: string } | null; pending: Partial<Record<Slot, Pending>>; confirmation: Confirmation | null;
  request: (slot: Slot, type: AutomationCommand, fields?: Record<string, unknown>) => void;
  refresh: () => void; create: () => void; select: (id: string) => void; edit: () => void; save: () => void;
  patch: (patch: Partial<AutomationForm>) => void; inspect: () => void; toggle: (item: Automation) => void;
  run: (item: Automation) => void; read: (timestamp: number, pin?: boolean) => void; accept: () => void;
};
const id = () => `automation-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
export const useAutomationWorkspace = create<State>((set, get) => ({
  items: [], selectedId: "", form: emptyAutomationForm(), editId: null, editor: false, preview: null, detail: null, selectedTime: null,
  error: "", progress: "", scheduler: null, pending: {}, confirmation: null,
  request: (slot, type, fields = {}) => {
    if (slot === "change" && get().pending.change) return;
    const request = { id: id(), type, fields };
    set(state => ({ pending: { ...state.pending, [slot]: request }, ...(slot === "change" ? { error: "", progress: "" } : {}) }));
    if (!sendAutomationCommand(type, request.id, fields)) {
      set(state => ({ pending: { ...state.pending, [slot]: undefined }, error: "요청을 보내지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요." }));
      return;
    }
    // 응답이 오지 않으면 기한을 두고 푼다. 기한이 없으면 "불러오고 있습니다" 가 영원히 남고
    // 「다시 조회」 까지 눌리지 않아 화면에서 빠져나올 방법이 없다.
    setTimeout(() => {
      if (get().pending[slot]?.id !== request.id) return;
      set(state => ({ pending: { ...state.pending, [slot]: undefined }, progress: "", error: "응답이 없습니다. 연결을 확인한 뒤 다시 조회해 주세요." }));
    }, SLICE_TIMEOUT_MS);
  },
  refresh: () => { get().request("list", "get_routines"); get().request("scheduler", "get_routine_scheduler_status"); },
  create: () => { if (get().pending.change || get().editor) return; set({ editor: true, editId: null, selectedId: "", form: emptyAutomationForm(), preview: null, error: "", detail: null, selectedTime: null }); },
  select: selectedId => { if (!get().pending.change && !get().editor) set(state => ({ selectedId, editId: null, preview: null, detail: null, selectedTime: null, error: "", pending: { ...state.pending, detail: undefined } })); },
  edit: () => {
    const item = get().items.find(item => item.id === get().selectedId);
    if (item && !item.running && !get().pending.change) set({ editor: true, editId: item.id, form: { ...item.form, weekdays: [...item.form.weekdays] }, preview: null, error: "" });
  },
  patch: patch => set(state => ({ form: { ...state.form, ...patch }, preview: null, pending: { ...state.pending, preview: undefined } })),
  inspect: () => {
    const error = formError(get().form);
    if (error) { set({ error }); return; }
    get().request("preview", "preview_routine", automationPayload(get().form));
  },
  save: () => {
    const error = formError(get().form);
    if (error) { set({ error }); return; }
    const editing = get().editId;
    get().request("change", editing ? "update_routine" : "create_routine", { ...automationPayload(get().form), ...(editing ? { routineId: editing } : {}) });
  },
  toggle: item => get().request("change", "toggle_routine", { routineId: item.id, enabled: !item.enabled }),
  run: item => { if (!item.running) get().request("change", "run_routine", { routineId: item.id }); },
  read: (timestamp, pin = true) => {
    if (!get().selectedId) return;
    set({ selectedTime: pin ? timestamp : null, detail: null });
    get().request("detail", "get_routine_run_detail", { routineId: get().selectedId, timestamp });
  },
  accept: () => {
    const confirmation = get().confirmation;
    if (!confirmation) return;
    set({ confirmation: null });
    get().request("change", confirmation.action === "delete" ? "delete_routine" : "resend_routine_run_telegram", { routineId: confirmation.id, timestamp: confirmation.timestamp });
  }
}));
function receive(message: DesktopServerMessage) {
  const state = useAutomationWorkspace.getState();
  const entry = (Object.entries(state.pending) as Array<[Slot, Pending | undefined]>).find(([, pending]) => pending && pending.id === message.requestId);
  if (!entry) return;
  const [slot, request] = entry;
  if (message.type === "routine_progress") {
    if (slot === "change") useAutomationWorkspace.setState({ progress: string(message.message) });
    return;
  }
  const finish = (patch: Partial<State>) => useAutomationWorkspace.setState(current => ({ ...patch, pending: { ...current.pending, [slot]: undefined } }));
  if (message.type === "error" || (message.ok === false && message.type !== "routine_result")) {
    finish({ error: string(message.message) || string(message.error) || "자동화를 처리하지 못했습니다.", progress: "", ...(slot === "detail" ? { detail: null } : {}) });
    return;
  }
  if (message.type === "routines_state") { finish({ items: array(message.items).map(parseAutomation).filter(item => item.id) }); return; }
  if (message.type === "routine_scheduler_status") { finish({ scheduler: { enabled: message.enabled === true, error: string(message.lastError) } }); return; }
  if (message.type === "routine_preview") { finish({ preview: parsePreview(message) }); return; }
  if (message.type === "routine_run_detail") {
    const detail = parseRunDetail(message);
    const wantedTime = state.selectedTime ?? state.items.find(item => item.id === state.selectedId)?.runs[0]?.timestamp;
    finish(detail.id === state.selectedId && detail.timestamp === wantedTime ? { detail } : {});
    return;
  }
  if (message.type === "routine_result") {
    const item = message.routine ? parseAutomation(message.routine) : null;
    const saved = message.ok === true && (request?.type === "create_routine" || request?.type === "update_routine");
    finish({ progress: "", error: message.ok === false ? string(message.message) || "자동화를 처리하지 못했습니다." : "", ...(saved ? { editor: false, editId: null, preview: null, form: emptyAutomationForm() } : {}),
      ...(item?.id ? { ...(saved ? { selectedId: item.id } : {}), items: [item, ...state.items.filter(current => current.id !== item.id)] } : {}),
      ...(message.ok === true && request?.type === "delete_routine" ? { selectedId: "", detail: null, selectedTime: null, items: state.items.filter(current => current.id !== request.fields.routineId) } : {}) });
    state.refresh();
    if (request?.type === "run_routine" && item?.runs[0]) state.read(item.runs[0].timestamp, false);
  }
}
export function useAutomationWorkspaceSession() {
  useEffect(() => {
    const messages = subscribeDesktopMessages(receive);
    const connection = useDesktopShellStore.subscribe((state, previous) => {
      if (state.bridge.status === "closed" && previous.bridge.status !== "closed") {
        const pending = useAutomationWorkspace.getState().pending;
        useAutomationWorkspace.setState({ pending: {}, progress: "", ...(Object.values(pending).some(Boolean) ? { error: "연결이 끊겨 상태를 확인할 수 없습니다. 다시 연결한 뒤 실행 기록을 확인해 주세요." } : {}) });
      }
    });
    const auth = useDesktopAuthStore.subscribe((state, previous) => { if (state.auth.status === "authenticated" && previous.auth.status !== "authenticated") useAutomationWorkspace.getState().refresh(); });
    return () => { messages(); connection(); auth(); };
  }, []);
}

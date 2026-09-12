import { create } from "zustand";
import { useEffect } from "react";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { localPreviewUrl, sendBuildTerminalCommand } from "../middleware/build-workspace-gateway";
import { text } from "./build-model";

export type TerminalStatus = "idle" | "starting" | "running" | "exited" | "failed";

type Listener = (data: string) => void;

type State = {
  status: TerminalStatus;
  sessionId: string;
  command: string;
  workingDirectory: string;
  previewUrl: string;
  message: string;
  exitCode: number | null;
  /** 터미널 화면으로 흘려보낼 출력. 뷰가 붙기 전에 온 것은 여기 쌓였다가 붙을 때 한 번에 그려진다. */
  buffered: string;
  start: (conversationId: string, target: string, size: { cols: number; rows: number }) => void;
  send: (data: string) => void;
  stop: () => void;
  reset: () => void;
  attach: (listener: Listener) => () => void;
};

const listeners = new Set<Listener>();
const requestId = () => `build-terminal-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
let pendingStartId = "";

function emit(data: string) {
  if (listeners.size === 0) {
    useBuildTerminal.setState(state => ({ buffered: (state.buffered + data).slice(-200000) }));
    return;
  }
  for (const listener of listeners) listener(data);
}

export const useBuildTerminal = create<State>((set, get) => ({
  status: "idle",
  sessionId: "",
  command: "",
  workingDirectory: "",
  previewUrl: "",
  message: "",
  exitCode: null,
  buffered: "",
  start: (conversationId, target, size) => {
    if (!conversationId || get().status === "starting" || get().status === "running") return;
    pendingStartId = requestId();
    set({ status: "starting", message: "실행을 준비하고 있습니다.", sessionId: "", command: "", previewUrl: "", exitCode: null, buffered: "" });
    for (const listener of listeners) listener("\u001b[2J\u001b[H");
    const ok = sendBuildTerminalCommand("coding_terminal_start", { requestId: pendingStartId, conversationId, target, columns: size.cols, rows: size.rows });
    if (!ok) set({ status: "failed", message: "실행 요청을 보내지 못했습니다. 연결 상태를 확인해 주세요." });
  },
  send: data => {
    const { sessionId, status } = get();
    if (!sessionId || status !== "running" || !data) return;
    sendBuildTerminalCommand("coding_terminal_input", { sessionId, data });
  },
  stop: () => {
    const { sessionId } = get();
    if (!sessionId) return;
    sendBuildTerminalCommand("coding_terminal_stop", { requestId: requestId(), sessionId });
  },
  reset: () => set({ status: "idle", sessionId: "", command: "", workingDirectory: "", previewUrl: "", message: "", exitCode: null, buffered: "" }),
  attach: listener => {
    listeners.add(listener);
    const pending = get().buffered;
    if (pending) {
      listener(pending);
      set({ buffered: "" });
    }
    return () => { listeners.delete(listener); };
  }
}));

function receive(message: DesktopServerMessage) {
  if (message.type === "coding_terminal_started") {
    if (message.requestId !== pendingStartId) return;
    if (message.ok !== true) {
      useBuildTerminal.setState({ status: "failed", message: text(message.message) || "실행하지 못했습니다." });
      return;
    }
    const preview = localPreviewUrl(text(message.previewUrl));
    if (preview) {
      useBuildTerminal.setState({ status: "exited", previewUrl: preview, message: text(message.message), exitCode: 0 });
      return;
    }
    useBuildTerminal.setState({
      status: "running",
      sessionId: text(message.sessionId),
      command: text(message.command),
      workingDirectory: text(message.workingDirectory),
      message: text(message.message)
    });
    return;
  }
  if (message.type === "coding_terminal_output") {
    if (text(message.sessionId) !== useBuildTerminal.getState().sessionId) return;
    emit(text(message.data));
    return;
  }
  if (message.type === "coding_terminal_exit") {
    if (text(message.sessionId) !== useBuildTerminal.getState().sessionId) return;
    const code = typeof message.exitCode === "number" ? message.exitCode : null;
    emit(`\r\n\u001b[90m[프로그램이 끝났습니다. 종료 코드 ${code ?? "-"}]\u001b[0m\r\n`);
    useBuildTerminal.setState({ status: "exited", exitCode: code });
  }
}

export function useBuildTerminalSession() {
  useEffect(() => subscribeDesktopMessages(receive), []);
}

import { create } from "zustand";

type DialogTone = "default" | "danger";

type BaseDialogRequest = {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: DialogTone;
};

type ConfirmDialogRequest = BaseDialogRequest & {
  kind: "confirm";
  resolve: (value: boolean) => void;
};

type PromptDialogRequest = BaseDialogRequest & {
  kind: "prompt";
  defaultValue: string;
  placeholder: string;
  resolve: (value: string | null) => void;
};

export type DesktopDialogRequest = ConfirmDialogRequest | PromptDialogRequest;

type DialogState = {
  request: DesktopDialogRequest | null;
  open: (request: DesktopDialogRequest) => void;
  close: () => void;
};

let nextDialogId = 1;

export const useDesktopDialogStore = create<DialogState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null })
}));

function nextId() {
  nextDialogId += 1;
  return nextDialogId;
}

export function settleDesktopDialog(value: boolean | string | null) {
  const request = useDesktopDialogStore.getState().request;
  useDesktopDialogStore.getState().close();
  if (!request) return;
  if (request.kind === "confirm") {
    request.resolve(value === true);
    return;
  }
  request.resolve(typeof value === "string" ? value : null);
}

export function requestConfirmDialog(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
}) {
  return new Promise<boolean>((resolve) => {
    useDesktopDialogStore.getState().open({
      id: nextId(),
      kind: "confirm",
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel || "확인",
      cancelLabel: options.cancelLabel || "취소",
      tone: options.tone || "default",
      resolve
    });
  });
}

export function requestPromptDialog(options: {
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  return new Promise<string | null>((resolve) => {
    useDesktopDialogStore.getState().open({
      id: nextId(),
      kind: "prompt",
      title: options.title,
      message: options.message,
      defaultValue: options.defaultValue || "",
      placeholder: options.placeholder || "",
      confirmLabel: options.confirmLabel || "저장",
      cancelLabel: options.cancelLabel || "취소",
      tone: "default",
      resolve
    });
  });
}

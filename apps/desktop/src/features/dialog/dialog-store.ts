import { create } from "zustand";
import {
  buildPermissionKey,
  resolvePermissionPolicy,
  usePermissionPolicyStore,
  type PermissionAction
} from "./permission-policy-store";

type DialogTone = "default" | "danger";
export type PermissionDialogResult = "allow_once" | "always_allow_here" | null;

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

type PermissionDialogRequest = BaseDialogRequest & {
  kind: "permission";
  permissionAction: PermissionAction;
  permissionKey: string;
  actionLabel: string;
  files: string[];
  commands: string[];
  diff: string;
  approvalToken: string;
  allowAlwaysLabel: string;
  resolve: (value: PermissionDialogResult) => void;
};

export type DesktopDialogRequest = ConfirmDialogRequest | PromptDialogRequest | PermissionDialogRequest;

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
  if (request.kind === "prompt") {
    request.resolve(typeof value === "string" ? value : null);
    return;
  }
  request.resolve(value === "allow_once" || value === "always_allow_here" ? value : null);
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

export function requestPermissionDialog(options: {
  title: string;
  message: string;
  permissionAction?: PermissionAction;
  permissionKey?: string;
  actionLabel: string;
  files?: string[];
  commands?: string[];
  diff?: string;
  approvalToken?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  allowAlwaysLabel?: string;
  tone?: DialogTone;
}) {
  const permissionAction = options.permissionAction || "run";
  const files = options.files || [];
  const commands = options.commands || [];
  const permissionKey = options.permissionKey || buildPermissionKey(options.actionLabel, files, commands);
  const decision = resolvePermissionPolicy(permissionAction, permissionKey);
  if (decision === "allow") return Promise.resolve("always_allow_here" as const);
  if (decision === "deny") return Promise.resolve(null);

  return new Promise<PermissionDialogResult>((resolve) => {
    useDesktopDialogStore.getState().open({
      id: nextId(),
      kind: "permission",
      permissionAction,
      permissionKey,
      title: options.title,
      message: options.message,
      actionLabel: options.actionLabel,
      files,
      commands,
      diff: options.diff || "",
      approvalToken: options.approvalToken || "",
      confirmLabel: options.confirmLabel || "한 번 허용",
      cancelLabel: options.cancelLabel || "취소",
      allowAlwaysLabel: options.allowAlwaysLabel || "여기서 항상 허용",
      tone: options.tone || "danger",
      resolve: (value) => {
        if (value === "always_allow_here") {
          usePermissionPolicyStore.getState().rememberGrant({
            key: permissionKey,
            action: permissionAction,
            label: options.actionLabel,
            createdAt: new Date().toISOString(),
            files,
            commands
          });
        }
        resolve(value);
      }
    });
  });
}

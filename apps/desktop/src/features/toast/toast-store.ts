import { create } from "zustand";

export type DesktopToastTone = "info" | "success" | "warning" | "error";

export type DesktopToast = {
  id: string;
  tone: DesktopToastTone;
  title: string;
  message: string;
  createdAt: string;
};

type ToastState = {
  toasts: DesktopToast[];
  push: (toast: DesktopToast) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const MAX_TOASTS = 4;
let toastSeq = 0;

export const useDesktopToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => set((state) => ({ toasts: [toast, ...state.toasts].slice(0, MAX_TOASTS) })),
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  clear: () => set({ toasts: [] })
}));

export function pushDesktopToast(options: {
  tone?: DesktopToastTone;
  title?: string;
  message: string;
  durationMs?: number;
}) {
  const id = `${Date.now()}-${toastSeq += 1}`;
  const toast: DesktopToast = {
    id,
    tone: options.tone || "info",
    title: options.title || "알림",
    message: options.message,
    createdAt: new Date().toISOString()
  };
  useDesktopToastStore.getState().push(toast);
  if (typeof window !== "undefined" && options.durationMs !== 0) {
    window.setTimeout(() => useDesktopToastStore.getState().remove(id), options.durationMs ?? 3600);
  }
  return id;
}

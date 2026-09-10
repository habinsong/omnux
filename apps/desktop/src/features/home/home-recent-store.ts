import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { HOME_RECENT_PREFIX, requestDesktopHomeRecent } from "../middleware/home-recent-gateway";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";

export type RecentKind = "ask" | "build" | "plan";

export type RecentItem = {
  kind: RecentKind;
  id: string;
  title: string;
  preview: string;
  updatedUtc: string;
  mode?: string;
  project?: string;
};

type State = {
  items: RecentItem[];
  loading: boolean;
  load: () => void;
};

const buckets = new Map<string, RecentItem[]>();
let sequence = 0;

function str(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function readConversations(scope: string, mode: string, items: unknown): RecentItem[] {
  const kind: RecentKind = scope === "coding" ? "build" : "ask";
  if (!Array.isArray(items)) return [];
  const next: RecentItem[] = [];
  for (const row of items) {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const id = str(record.id);
    if (!id) continue;
    next.push({
      kind,
      id,
      title: str(record.title) || "제목 없음",
      preview: str(record.preview),
      updatedUtc: str(record.updatedUtc),
      mode: str(record.mode) || mode,
      project: str(record.project)
    });
  }
  return next;
}

function readPlans(items: unknown): RecentItem[] {
  if (!Array.isArray(items)) return [];
  const next: RecentItem[] = [];
  for (const row of items) {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const id = str(record.planId);
    if (!id) continue;
    next.push({
      kind: "plan",
      id,
      title: str(record.title) || "이름 없는 작업",
      preview: str(record.objective),
      updatedUtc: "",
      project: ""
    });
  }
  return next;
}

function publish() {
  const items = [...buckets.values()]
    .flat()
    .sort((left, right) => right.updatedUtc.localeCompare(left.updatedUtc))
    .slice(0, 8);
  useHomeRecentStore.setState({ items, loading: false });
}

function receive(message: DesktopServerMessage) {
  const requestId = str(message.requestId);
  if (!requestId.startsWith(HOME_RECENT_PREFIX)) return;
  const bucket = requestId.slice(HOME_RECENT_PREFIX.length).replace(/-\d+$/, "");
  if (message.type === "conversations") {
    buckets.set(bucket, readConversations(str(message.scope), str(message.mode), message.items));
    publish();
    return;
  }
  if (message.type === "plan_list_result") {
    const payload = message.payload && typeof message.payload === "object" ? (message.payload as Record<string, unknown>) : {};
    buckets.set("plans", readPlans(payload.items ?? message.items));
    publish();
  }
}

export const useHomeRecentStore = create<State>(() => ({
  items: [],
  loading: false,
  load: () => {
    sequence += 1;
    useHomeRecentStore.setState({ loading: true });
    if (!requestDesktopHomeRecent(sequence)) useHomeRecentStore.setState({ loading: false });
  }
}));

export function useHomeRecentBridge() {
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const connected = bridgeStatus === "connected" && authStatus === "authenticated";
  useEffect(() => subscribeDesktopMessages(receive), []);
  useEffect(() => {
    if (connected) useHomeRecentStore.getState().load();
  }, [connected]);
}

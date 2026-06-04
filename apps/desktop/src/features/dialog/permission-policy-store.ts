import { create } from "zustand";

export type PermissionAction = "read" | "write" | "run" | "network" | "delete";
export type PermissionDecision = "allow" | "ask" | "deny";

export type PermissionGrant = {
  key: string;
  action: PermissionAction;
  label: string;
  createdAt: string;
  files: string[];
  commands: string[];
};

type PermissionPolicySnapshot = {
  defaults: Record<PermissionAction, PermissionDecision>;
  grants: PermissionGrant[];
};

type PermissionPolicyState = PermissionPolicySnapshot & {
  setDefaultDecision: (action: PermissionAction, decision: PermissionDecision) => void;
  rememberGrant: (grant: PermissionGrant) => void;
  removeGrant: (key: string) => void;
  clearGrants: () => void;
};

const STORAGE_KEY = "omnux-desktop-permission-policy-v1";
const MAX_GRANTS = 40;

export const PERMISSION_ACTIONS: Array<{ action: PermissionAction; label: string; description: string }> = [
  { action: "read", label: "Read", description: "파일과 문맥 읽기" },
  { action: "write", label: "Write", description: "파일 수정과 저장" },
  { action: "run", label: "Run", description: "명령 실행" },
  { action: "network", label: "Network", description: "외부 요청" },
  { action: "delete", label: "Delete", description: "삭제와 정리" }
];

export const PERMISSION_DECISIONS: Array<{ decision: PermissionDecision; label: string }> = [
  { decision: "ask", label: "Ask" },
  { decision: "allow", label: "Allow" },
  { decision: "deny", label: "Deny" }
];

const DEFAULTS: Record<PermissionAction, PermissionDecision> = {
  read: "ask",
  write: "ask",
  run: "ask",
  network: "ask",
  delete: "ask"
};

function normalizeDecision(value: unknown): PermissionDecision {
  return value === "allow" || value === "deny" ? value : "ask";
}

function normalizeAction(value: unknown): PermissionAction {
  return value === "read" || value === "write" || value === "run" || value === "network" || value === "delete" ? value : "run";
}

function normalizeGrant(item: unknown): PermissionGrant | null {
  if (!item || typeof item !== "object") return null;
  const payload = item as Record<string, unknown>;
  const key = String(payload.key || "").trim();
  if (!key) return null;
  return {
    key,
    action: normalizeAction(payload.action),
    label: String(payload.label || key).trim(),
    createdAt: String(payload.createdAt || new Date().toISOString()),
    files: Array.isArray(payload.files) ? payload.files.map(String).filter(Boolean) : [],
    commands: Array.isArray(payload.commands) ? payload.commands.map(String).filter(Boolean) : []
  };
}

function readPolicy(): PermissionPolicySnapshot {
  if (typeof window === "undefined") {
    return { defaults: DEFAULTS, grants: [] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { defaults: DEFAULTS, grants: [] };
    const parsed = JSON.parse(raw) as Partial<PermissionPolicySnapshot>;
    const savedDefaults = (parsed.defaults || {}) as Partial<Record<PermissionAction, PermissionDecision>>;
    const defaults: Record<PermissionAction, PermissionDecision> = {
      read: normalizeDecision(savedDefaults.read),
      write: normalizeDecision(savedDefaults.write),
      run: normalizeDecision(savedDefaults.run),
      network: normalizeDecision(savedDefaults.network),
      delete: normalizeDecision(savedDefaults.delete)
    };
    const grants = Array.isArray(parsed.grants)
      ? parsed.grants.map(normalizeGrant).filter((item): item is PermissionGrant => Boolean(item)).slice(0, MAX_GRANTS)
      : [];
    return { defaults, grants };
  } catch (_error) {
    return { defaults: DEFAULTS, grants: [] };
  }
}

function savePolicy(snapshot: PermissionPolicySnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...snapshot, grants: snapshot.grants.slice(0, MAX_GRANTS) }));
}

const initialPolicy = readPolicy();

export const usePermissionPolicyStore = create<PermissionPolicyState>((set) => ({
  defaults: initialPolicy.defaults,
  grants: initialPolicy.grants,
  setDefaultDecision: (action, decision) =>
    set((state) => {
      const next = { ...state, defaults: { ...state.defaults, [action]: decision } };
      savePolicy({ defaults: next.defaults, grants: next.grants });
      return next;
    }),
  rememberGrant: (grant) =>
    set((state) => {
      const grants = [grant, ...state.grants.filter((item) => item.key !== grant.key)].slice(0, MAX_GRANTS);
      savePolicy({ defaults: state.defaults, grants });
      return { grants };
    }),
  removeGrant: (key) =>
    set((state) => {
      const grants = state.grants.filter((grant) => grant.key !== key);
      savePolicy({ defaults: state.defaults, grants });
      return { grants };
    }),
  clearGrants: () =>
    set((state) => {
      savePolicy({ defaults: state.defaults, grants: [] });
      return { grants: [] };
    })
}));

export function buildPermissionKey(actionLabel: string, files: string[], commands: string[]) {
  const filePart = files.map((item) => item.trim()).filter(Boolean).slice(0, 3).join("|");
  const commandPart = commands.map((item) => item.trim()).filter(Boolean).slice(0, 2).join("|");
  return [actionLabel.trim(), filePart, commandPart].filter(Boolean).join("::");
}

export function resolvePermissionPolicy(action: PermissionAction, key: string): PermissionDecision {
  const state = usePermissionPolicyStore.getState();
  if (key && state.grants.some((grant) => grant.key === key)) return "allow";
  return state.defaults[action] || "ask";
}

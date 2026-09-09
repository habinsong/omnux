import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import {
  requestDesktopExtensions,
  type ExtensionHookInput,
  type ExtensionRuleInput
} from "../middleware/extensions-gateway";
import {
  EMPTY_SNAPSHOT,
  parseExtensionSnapshot,
  parseHookTestOutcome,
  type ExtensionSnapshot,
  type HookRow,
  type HookTestOutcome,
  type RuleRow
} from "./extensions-model";

export type ExtensionStatus = { kind: "ok" | "error"; message: string } | null;

/** 편집 중 초안. 서버 스냅샷이 도착해도 이 값을 교체하지 않는다(PRJ-01/UI-03 회귀 방지). */
export type HookDraft = ExtensionHookInput;
export type RuleDraft = ExtensionRuleInput;

type ExtensionState = {
  snapshot: ExtensionSnapshot;
  loading: boolean;
  loaded: boolean;
  status: ExtensionStatus;
  hookDraft: HookDraft | null;
  ruleDraft: RuleDraft | null;
  testResult: HookTestOutcome | null;
  testingHookId: string;
  load: () => void;
  refresh: () => void;
  newHook: () => void;
  editHook: (hook: HookRow) => void;
  patchHookDraft: (patch: Partial<HookDraft>) => void;
  cancelHookDraft: () => void;
  saveHookDraft: () => void;
  toggleHook: (hook: HookRow, enabled: boolean) => void;
  deleteHook: (hookId: string) => void;
  testHook: (hook: HookRow, sample: { filePath: string; command: string; toolName: string }) => void;
  newRule: () => void;
  editRule: (rule: RuleRow) => void;
  patchRuleDraft: (patch: Partial<RuleDraft>) => void;
  cancelRuleDraft: () => void;
  saveRuleDraft: () => void;
  toggleRule: (rule: RuleRow, enabled: boolean) => void;
  deleteRule: (ruleId: string) => void;
  togglePlugin: (pluginId: string, enabled: boolean) => void;
  approve: (pendingId: string, scope: "once" | "session") => void;
  rejectApproval: (pendingId: string) => void;
  revokeApproval: (grantId: string) => void;
  addPluginRoot: (path: string) => void;
  removePluginRoot: (path: string) => void;
};

export const DEFAULT_HOOK_DRAFT: HookDraft = {
  id: "",
  event: "coding.file.pre",
  handler: "builtin",
  command: "",
  builtinId: "deny-path",
  builtinArgument: "",
  toolPattern: "",
  pathGlob: "",
  timeoutMs: 10000,
  failureMode: "open",
  enabled: true,
  description: ""
};

/** 세션 승인 유지 시간(분). 미들웨어에서 1~1440 범위로 다시 맞춰진다. */
export const SESSION_APPROVAL_MINUTES = 60;

export const DEFAULT_RULE_DRAFT: RuleDraft = {
  id: "",
  title: "",
  body: "",
  scope: "global",
  pathGlob: "",
  priority: 100,
  enabled: true
};

function sendFailure(set: (partial: Partial<ExtensionState>) => void, what: string) {
  set({ status: { kind: "error", message: `${what} 요청을 전송하지 못했다.` } });
}

export const useExtensionStore = create<ExtensionState>((set, get) => ({
  snapshot: EMPTY_SNAPSHOT,
  loading: false,
  loaded: false,
  status: null,
  hookDraft: null,
  ruleDraft: null,
  testResult: null,
  testingHookId: "",

  load: () => {
    if (get().loading) return;
    set({ loading: true });
    if (!requestDesktopExtensions.load()) {
      set({ loading: false });
      sendFailure(set, "확장 목록");
    }
  },
  refresh: () => {
    set({ loading: true, status: null });
    if (!requestDesktopExtensions.refresh()) {
      set({ loading: false });
      sendFailure(set, "확장 다시 읽기");
    }
  },

  newHook: () => set({ hookDraft: { ...DEFAULT_HOOK_DRAFT }, testResult: null, status: null }),
  editHook: (hook) =>
    set({
      hookDraft: {
        id: hook.id,
        event: hook.event,
        handler: hook.handler === "unknown" ? "builtin" : hook.handler,
        command: hook.command,
        builtinId: hook.builtinId || "deny-path",
        builtinArgument: hook.builtinArgument,
        toolPattern: hook.toolPattern,
        pathGlob: hook.pathGlob,
        timeoutMs: hook.timeoutMs,
        failureMode: hook.failureMode,
        enabled: hook.enabled,
        description: hook.description
      },
      status: null
    }),
  patchHookDraft: (patch) =>
    set((state) => (state.hookDraft ? { hookDraft: { ...state.hookDraft, ...patch } } : {})),
  cancelHookDraft: () => set({ hookDraft: null }),
  saveHookDraft: () => {
    const draft = get().hookDraft;
    if (!draft) return;
    if (!draft.id.trim()) {
      set({ status: { kind: "error", message: "훅 이름(id)을 입력하세요." } });
      return;
    }
    if (!requestDesktopExtensions.saveHook({ ...draft, id: draft.id.trim() })) sendFailure(set, "훅 저장");
  },
  toggleHook: (hook, enabled) => {
    if (!requestDesktopExtensions.toggleHook(hook.id, enabled)) sendFailure(set, "훅 전환");
  },
  deleteHook: (hookId) => {
    if (!requestDesktopExtensions.deleteHook(hookId)) sendFailure(set, "훅 삭제");
  },
  testHook: (hook, sample) => {
    set({ testingHookId: hook.id, testResult: null });
    const sent = requestDesktopExtensions.testHook({
      hookId: hook.id,
      event: hook.event,
      toolName: sample.toolName,
      filePath: sample.filePath,
      command: sample.command,
      prompt: ""
    });
    if (!sent) {
      set({ testingHookId: "" });
      sendFailure(set, "훅 시험 실행");
    }
  },

  newRule: () => set({ ruleDraft: { ...DEFAULT_RULE_DRAFT }, status: null }),
  editRule: (rule) =>
    set({
      ruleDraft: {
        id: rule.id,
        title: rule.title,
        body: rule.body,
        scope: rule.scope,
        pathGlob: rule.pathGlob,
        priority: rule.priority,
        enabled: rule.enabled
      },
      status: null
    }),
  patchRuleDraft: (patch) =>
    set((state) => (state.ruleDraft ? { ruleDraft: { ...state.ruleDraft, ...patch } } : {})),
  cancelRuleDraft: () => set({ ruleDraft: null }),
  saveRuleDraft: () => {
    const draft = get().ruleDraft;
    if (!draft) return;
    if (!draft.id.trim()) {
      set({ status: { kind: "error", message: "규칙 이름(id)을 입력하세요." } });
      return;
    }
    if (!draft.body.trim()) {
      set({ status: { kind: "error", message: "규칙 본문을 입력하세요." } });
      return;
    }
    if (!requestDesktopExtensions.saveRule({ ...draft, id: draft.id.trim() })) sendFailure(set, "규칙 저장");
  },
  toggleRule: (rule, enabled) => {
    if (!requestDesktopExtensions.saveRule({ ...rule, enabled })) sendFailure(set, "규칙 전환");
  },
  deleteRule: (ruleId) => {
    if (!requestDesktopExtensions.deleteRule(ruleId)) sendFailure(set, "규칙 삭제");
  },

  togglePlugin: (pluginId, enabled) => {
    if (!requestDesktopExtensions.togglePlugin(pluginId, enabled)) sendFailure(set, "플러그인 전환");
  },
  approve: (pendingId, scope) => {
    if (!requestDesktopExtensions.approve(pendingId, scope, SESSION_APPROVAL_MINUTES)) sendFailure(set, "승인");
  },
  rejectApproval: (pendingId) => {
    if (!requestDesktopExtensions.rejectApproval(pendingId)) sendFailure(set, "승인 거절");
  },
  revokeApproval: (grantId) => {
    if (!requestDesktopExtensions.revokeApproval(grantId)) sendFailure(set, "승인 취소");
  },
  addPluginRoot: (path) => {
    if (!path.trim()) {
      set({ status: { kind: "error", message: "폴더 경로를 입력하세요." } });
      return;
    }
    if (!requestDesktopExtensions.addPluginRoot(path.trim())) sendFailure(set, "플러그인 폴더 추가");
  },
  removePluginRoot: (path) => {
    if (!requestDesktopExtensions.removePluginRoot(path)) sendFailure(set, "플러그인 폴더 제거");
  }
}));

function payloadOf(message: DesktopServerMessage): Record<string, unknown> {
  const payload = message.payload;
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function errorsOf(payload: Record<string, unknown>): string[] {
  return Array.isArray(payload.errors)
    ? payload.errors.filter((item): item is string => typeof item === "string")
    : [];
}

const MUTATION_LABELS: Record<string, string> = {
  extensions_hook_save_result: "훅 저장",
  extensions_hook_delete_result: "훅 삭제",
  extensions_hook_toggle_result: "훅 전환",
  extensions_rule_save_result: "규칙 저장",
  extensions_rule_delete_result: "규칙 삭제",
  extensions_plugin_toggle_result: "플러그인 전환",
  extensions_plugin_root_add_result: "플러그인 폴더 추가",
  extensions_plugin_root_remove_result: "플러그인 폴더 제거",
  extensions_approval_approve_result: "승인",
  extensions_approval_reject_result: "승인 거절",
  extensions_approval_revoke_result: "승인 취소"
};

/** 변경 후 초안을 닫아도 되는 요청. 실패면 초안을 유지해 입력을 잃지 않는다. */
const DRAFT_CLOSERS: Record<string, "hook" | "rule"> = {
  extensions_hook_save_result: "hook",
  extensions_rule_save_result: "rule"
};

export function useExtensionPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      const type = String(message.type || "");
      if (!type.startsWith("extensions_")) return;

      if (type === "extensions_snapshot") {
        // 스냅샷은 목록만 갱신한다. 편집 중 초안은 건드리지 않는다.
        useExtensionStore.setState({
          snapshot: parseExtensionSnapshot(payloadOf(message)),
          loading: false,
          loaded: true
        });
        return;
      }

      if (type === "extensions_hook_test_result") {
        useExtensionStore.setState({
          testResult: parseHookTestOutcome(payloadOf(message)),
          testingHookId: ""
        });
        return;
      }

      const label = MUTATION_LABELS[type];
      if (!label) return;

      const payload = payloadOf(message);
      const ok = payload.ok === true;
      const errors = errorsOf(payload);
      useExtensionStore.setState({
        status: {
          kind: ok ? "ok" : "error",
          message: ok ? `${label}을(를) 마쳤습니다.` : errors.join(" / ") || `${label}에 실패했습니다.`
        }
      });

      if (ok) {
        const closes = DRAFT_CLOSERS[type];
        if (closes === "hook") useExtensionStore.setState({ hookDraft: null });
        if (closes === "rule") useExtensionStore.setState({ ruleDraft: null });
        requestDesktopExtensions.load();
      }
    });
  }, []);
}

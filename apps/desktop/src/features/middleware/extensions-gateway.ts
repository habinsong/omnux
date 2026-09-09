import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// 확장 계층(훅·플러그인·규칙). 미들웨어의 WsExtensionCommandDispatcher 와 1:1 대응한다.
registerDesktopRequestTypes(
  "extensions_get",
  "extensions_refresh",
  "extensions_hook_save",
  "extensions_hook_delete",
  "extensions_hook_toggle",
  "extensions_rule_save",
  "extensions_rule_delete",
  "extensions_plugin_toggle",
  "extensions_plugin_root_add",
  "extensions_plugin_root_remove",
  "extensions_hook_test",
  "extensions_approval_approve",
  "extensions_approval_reject",
  "extensions_approval_revoke"
);

export type ExtensionHandlerKind = "command" | "builtin" | "prompt" | "agent" | "unknown";
export type ExtensionFailureMode = "open" | "closed";

export interface ExtensionHookInput {
  id: string;
  event: string;
  handler: ExtensionHandlerKind;
  command: string;
  builtinId: string;
  builtinArgument: string;
  toolPattern: string;
  pathGlob: string;
  timeoutMs: number;
  failureMode: ExtensionFailureMode;
  enabled: boolean;
  description: string;
}

export interface ExtensionRuleInput {
  id: string;
  title: string;
  body: string;
  scope: "global" | "project";
  pathGlob: string;
  priority: number;
  enabled: boolean;
}

export interface ExtensionHookTestInput {
  hookId: string;
  event: string;
  toolName: string;
  filePath: string;
  command: string;
  prompt: string;
}

function withRequestId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const requestDesktopExtensions = {
  load() {
    return sendDesktopRequest({ type: "extensions_get", requestId: withRequestId("ext-get") });
  },
  refresh() {
    return sendDesktopRequest({ type: "extensions_refresh", requestId: withRequestId("ext-refresh") });
  },
  saveHook(hook: ExtensionHookInput) {
    return sendDesktopRequest({
      type: "extensions_hook_save",
      requestId: withRequestId("ext-hook-save"),
      hook
    });
  },
  deleteHook(hookId: string) {
    return sendDesktopRequest({
      type: "extensions_hook_delete",
      requestId: withRequestId("ext-hook-del"),
      hookId
    });
  },
  toggleHook(hookId: string, enabled: boolean) {
    return sendDesktopRequest({
      type: "extensions_hook_toggle",
      requestId: withRequestId("ext-hook-toggle"),
      hookId,
      enabled
    });
  },
  saveRule(rule: ExtensionRuleInput) {
    return sendDesktopRequest({
      type: "extensions_rule_save",
      requestId: withRequestId("ext-rule-save"),
      rule
    });
  },
  deleteRule(ruleId: string) {
    return sendDesktopRequest({
      type: "extensions_rule_delete",
      requestId: withRequestId("ext-rule-del"),
      ruleId
    });
  },
  togglePlugin(pluginId: string, enabled: boolean) {
    return sendDesktopRequest({
      type: "extensions_plugin_toggle",
      requestId: withRequestId("ext-plugin-toggle"),
      pluginId,
      enabled
    });
  },
  addPluginRoot(path: string) {
    return sendDesktopRequest({
      type: "extensions_plugin_root_add",
      requestId: withRequestId("ext-root-add"),
      path
    });
  },
  removePluginRoot(path: string) {
    return sendDesktopRequest({
      type: "extensions_plugin_root_remove",
      requestId: withRequestId("ext-root-remove"),
      path
    });
  },
  approve(pendingId: string, scope: "once" | "session", sessionMinutes: number) {
    return sendDesktopRequest({
      type: "extensions_approval_approve",
      requestId: withRequestId("ext-approve"),
      pendingId,
      scope,
      sessionMinutes
    });
  },
  rejectApproval(pendingId: string) {
    return sendDesktopRequest({
      type: "extensions_approval_reject",
      requestId: withRequestId("ext-reject"),
      pendingId
    });
  },
  revokeApproval(grantId: string) {
    return sendDesktopRequest({
      type: "extensions_approval_revoke",
      requestId: withRequestId("ext-revoke"),
      grantId
    });
  },
  testHook(input: ExtensionHookTestInput) {
    return sendDesktopRequest({
      type: "extensions_hook_test",
      requestId: withRequestId("ext-hook-test"),
      ...input
    });
  }
};

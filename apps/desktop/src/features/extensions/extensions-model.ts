import type { ExtensionFailureMode, ExtensionHandlerKind } from "../middleware/extensions-gateway";

/** 서버 스냅샷의 화면용 표현. 필드는 미들웨어 ExtensionWsJson 과 1:1 대응한다. */
export type HookEventMeta = {
  id: string;
  label: string;
  description: string;
  canBlock: boolean;
  canRewriteInput: boolean;
  canAddContext: boolean;
  /** 미들웨어에 실제 호출 지점이 있는지. false 면 훅을 걸어도 지금은 실행되지 않는다. */
  wired: boolean;
};

export type BuiltinMeta = {
  id: string;
  label: string;
  argumentLabel: string;
  description: string;
  requiresArgument: boolean;
};

export type HookRow = {
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
  source: string;
  description: string;
};

export type RuleRow = {
  id: string;
  title: string;
  body: string;
  scope: "global" | "project";
  pathGlob: string;
  priority: number;
  enabled: boolean;
  source: string;
};

export type PluginRow = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  homepage: string;
  rootPath: string;
  enabled: boolean;
  valid: boolean;
  hookCount: number;
  ruleCount: number;
  errors: string[];
};

export type PendingApprovalRow = {
  id: string;
  event: string;
  target: string;
  reason: string;
  hookId: string;
  requestedUtc: string;
  requestCount: number;
};

export type ApprovalGrantRow = {
  id: string;
  event: string;
  target: string;
  scope: "once" | "session";
  grantedUtc: string;
  expiresUtc: string;
};

export type HookTestOutcome = {
  hookId: string;
  event: string;
  status: string;
  outcome: string;
  reason: string;
  additionalContext: string;
  exitCode: number;
  durationMs: number;
  stderr: string;
};

export type ExtensionSnapshot = {
  configPath: string;
  updatedUtc: string;
  configExists: boolean;
  configError: string;
  events: HookEventMeta[];
  builtins: BuiltinMeta[];
  hooks: HookRow[];
  rules: RuleRow[];
  plugins: PluginRow[];
  pluginRoots: string[];
  pluginErrors: string[];
  pendingApprovals: PendingApprovalRow[];
  approvalGrants: ApprovalGrantRow[];
  approvalError: string;
};

export const EMPTY_SNAPSHOT: ExtensionSnapshot = {
  configPath: "",
  updatedUtc: "",
  configExists: false,
  configError: "",
  events: [],
  builtins: [],
  hooks: [],
  rules: [],
  plugins: [],
  pluginRoots: [],
  pluginErrors: [],
  pendingApprovals: [],
  approvalGrants: [],
  approvalError: ""
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function flag(value: unknown): boolean {
  return value === true;
}

function count(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as Record<string, unknown>[]) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function handlerOf(value: unknown): ExtensionHandlerKind {
  const raw = text(value);
  return raw === "command" || raw === "builtin" || raw === "prompt" || raw === "agent" ? raw : "unknown";
}

/** 서버 payload → 화면 모델. 알 수 없는 값은 추측하지 않고 기본값으로 표시한다. */
export function parseExtensionSnapshot(payload: Record<string, unknown>): ExtensionSnapshot {
  return {
    configPath: text(payload.configPath),
    updatedUtc: text(payload.updatedUtc),
    configExists: flag(payload.configExists),
    configError: text(payload.configError),
    events: list(payload.events).map((item) => ({
      id: text(item.id),
      label: text(item.label),
      description: text(item.description),
      canBlock: flag(item.canBlock),
      canRewriteInput: flag(item.canRewriteInput),
      canAddContext: flag(item.canAddContext),
      wired: flag(item.wired)
    })),
    builtins: list(payload.builtins).map((item) => ({
      id: text(item.id),
      label: text(item.label),
      argumentLabel: text(item.argumentLabel),
      description: text(item.description),
      requiresArgument: flag(item.requiresArgument)
    })),
    hooks: list(payload.hooks).map((item) => ({
      id: text(item.id),
      event: text(item.event),
      handler: handlerOf(item.handler),
      command: text(item.command),
      builtinId: text(item.builtinId),
      builtinArgument: text(item.builtinArgument),
      toolPattern: text(item.toolPattern),
      pathGlob: text(item.pathGlob),
      timeoutMs: count(item.timeoutMs, 10000),
      failureMode: text(item.failureMode) === "closed" ? "closed" : "open",
      enabled: flag(item.enabled),
      source: text(item.source),
      description: text(item.description)
    })),
    rules: list(payload.rules).map((item) => ({
      id: text(item.id),
      title: text(item.title),
      body: text(item.body),
      scope: text(item.scope) === "project" ? "project" : "global",
      pathGlob: text(item.pathGlob),
      priority: count(item.priority, 100),
      enabled: flag(item.enabled),
      source: text(item.source)
    })),
    plugins: list(payload.plugins).map((item) => ({
      id: text(item.id),
      name: text(item.name),
      version: text(item.version),
      description: text(item.description),
      author: text(item.author),
      license: text(item.license),
      homepage: text(item.homepage),
      rootPath: text(item.rootPath),
      enabled: flag(item.enabled),
      valid: flag(item.valid),
      hookCount: count(item.hookCount, 0),
      ruleCount: count(item.ruleCount, 0),
      errors: strings(item.errors)
    })),
    pluginRoots: strings(payload.pluginRoots),
    pluginErrors: strings(payload.pluginErrors),
    pendingApprovals: list(payload.pendingApprovals).map((item) => ({
      id: text(item.id),
      event: text(item.event),
      target: text(item.target),
      reason: text(item.reason),
      hookId: text(item.hookId),
      requestedUtc: text(item.requestedUtc),
      requestCount: count(item.requestCount, 1)
    })),
    approvalGrants: list(payload.approvalGrants).map((item) => ({
      id: text(item.id),
      event: text(item.event),
      target: text(item.target),
      scope: text(item.scope) === "session" ? "session" : "once",
      grantedUtc: text(item.grantedUtc),
      expiresUtc: text(item.expiresUtc)
    })),
    approvalError: text(payload.approvalError)
  };
}

export function parseHookTestOutcome(payload: Record<string, unknown>): HookTestOutcome {
  return {
    hookId: text(payload.hookId),
    event: text(payload.event),
    status: text(payload.status) || "not-run",
    outcome: text(payload.outcome) || "none",
    reason: text(payload.reason),
    additionalContext: text(payload.additionalContext),
    exitCode: count(payload.exitCode, -1),
    durationMs: count(payload.durationMs, 0),
    stderr: text(payload.stderr)
  };
}

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Input, Textarea, cn } from "../../components/ui/primitives";
import { useExtensionStore } from "./extensions-store";
import type { HookRow, PendingApprovalRow, PluginRow, RuleRow } from "./extensions-model";

/* ============================================================================
   확장 화면의 네 칸 내용.
   모두 같은 규칙을 쓴다.
     · 한 줄에 이름 하나. 누르면 그 줄 아래에서만 자세히 열린다.
     · 편집은 목록 위가 아니라 목록을 덮는 한 겹으로 연다.
     · 가로로 넘치는 값은 break-all 로 접는다.
   ============================================================================ */

/* ---------- 공통 조각 ---------- */

export function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="min-w-0 divide-y divide-border">{children}</ul>;
}

export function Row({
  title,
  detail,
  right,
  open,
  onToggle,
  children
}: {
  title: React.ReactNode;
  detail?: React.ReactNode;
  right?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{title}</span>
          {detail ? <span className="block truncate text-[10px] text-muted-foreground">{detail}</span> : null}
        </span>
        {right ? <span className="flex shrink-0 items-center gap-1.5">{right}</span> : null}
      </button>
      {open ? <div className="min-w-0 space-y-2 px-3 pb-3">{children}</div> : null}
    </li>
  );
}

export function Field({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <p className="flex min-w-0 gap-2 text-[11px]">
      <span className="w-20 shrink-0 text-muted-foreground">{name}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-foreground">{value}</span>
    </p>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="px-3 py-8 text-center text-xs text-muted-foreground">{text}</p>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-medium text-muted-foreground">{children}</span>;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!on);
      }}
      className={cn(
        "h-5 w-9 shrink-0 rounded-full p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
        on ? "bg-primary" : "bg-muted"
      )}
    >
      <span className={cn("block h-4 w-4 rounded-full bg-background transition-transform", on ? "translate-x-4" : "translate-x-0")} />
    </button>
  );
}

function stamp(value: string): string {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

/* ---------- 훅 ---------- */

export function HooksPanel() {
  const hooks = useExtensionStore((state) => state.snapshot.hooks);
  const events = useExtensionStore((state) => state.snapshot.events);
  const draft = useExtensionStore((state) => state.hookDraft);
  const testResult = useExtensionStore((state) => state.testResult);
  const testingId = useExtensionStore((state) => state.testingHookId);
  const store = useExtensionStore;
  const [openId, setOpenId] = useState("");

  if (draft) return <HookEditor />;

  const eventLabel = (id: string) => events.find((event) => event.id === id)?.label || id;
  const wired = (id: string) => events.find((event) => event.id === id)?.wired !== false;

  return (
    <Shell
      footer={
        <Button variant="primary" size="sm" onClick={() => store.getState().newHook()}>
          <Plus size={12} aria-hidden="true" /> 훅 추가
        </Button>
      }
    >
      {hooks.length === 0 ? (
        <Empty text="등록된 훅이 없습니다." />
      ) : (
        <Rows>
          {hooks.map((hook) => (
            <HookRowView
              key={hook.id}
              hook={hook}
              label={eventLabel(hook.event)}
              wired={wired(hook.event)}
              open={openId === hook.id}
              onToggleOpen={() => setOpenId(openId === hook.id ? "" : hook.id)}
              testing={testingId === hook.id}
              result={testResult && testResult.hookId === hook.id ? testResult : null}
            />
          ))}
        </Rows>
      )}
    </Shell>
  );
}

function HookRowView({
  hook,
  label,
  wired,
  open,
  onToggleOpen,
  testing,
  result
}: {
  hook: HookRow;
  label: string;
  wired: boolean;
  open: boolean;
  onToggleOpen: () => void;
  testing: boolean;
  result: { status: string; outcome: string; reason: string; exitCode: number; durationMs: number; stderr: string } | null;
}) {
  const store = useExtensionStore;
  const [sample, setSample] = useState({ toolName: "", filePath: "", command: "" });
  const handler =
    hook.handler === "builtin" ? `기본 검사 ${hook.builtinId}` : hook.handler === "command" ? hook.command || "명령 없음" : hook.handler;

  return (
    <Row
      title={hook.description || hook.id || "이름 없는 훅"}
      detail={`${label} · ${handler}`}
      open={open}
      onToggle={onToggleOpen}
      right={
        <>
          {!wired ? <Badge tone="warning">미연결</Badge> : null}
          {hook.source ? <Badge>{hook.source}</Badge> : null}
          <Toggle on={hook.enabled} label={`${hook.description || hook.id} 사용`} onChange={(next) => store.getState().toggleHook(hook, next)} />
        </>
      }
    >
      {!wired ? <p className="text-[11px] text-warning">이 시점은 아직 미들웨어에 연결되지 않아 훅이 실행되지 않습니다.</p> : null}
      <Field name="식별자" value={hook.id} />
      <Field name="시점" value={hook.event} />
      <Field name="처리" value={handler} />
      {hook.builtinArgument ? <Field name="인자" value={hook.builtinArgument} /> : null}
      {hook.toolPattern ? <Field name="도구" value={hook.toolPattern} /> : null}
      {hook.pathGlob ? <Field name="경로" value={hook.pathGlob} /> : null}
      <Field name="시간 제한" value={`${hook.timeoutMs}ms`} />
      <Field name="실패 시" value={hook.failureMode === "closed" ? "막음" : "통과"} />

      <div className="grid min-w-0 gap-1.5 sm:grid-cols-3">
        <Input className="h-7 text-[11px]" placeholder="도구 이름" value={sample.toolName} onChange={(event) => setSample({ ...sample, toolName: event.target.value })} />
        <Input className="h-7 text-[11px]" placeholder="파일 경로" value={sample.filePath} onChange={(event) => setSample({ ...sample, filePath: event.target.value })} />
        <Input className="h-7 text-[11px]" placeholder="명령" value={sample.command} onChange={(event) => setSample({ ...sample, command: event.target.value })} />
      </div>

      {result ? (
        <div className="min-w-0 space-y-1 rounded-md border border-border bg-muted/40 p-2">
          <p className="text-[11px]">
            결과 <b>{result.outcome}</b> · {result.status} · 종료코드 {result.exitCode} · {result.durationMs}ms
          </p>
          {result.reason ? <p className="min-w-0 break-words text-[11px] text-muted-foreground">{result.reason}</p> : null}
          {result.stderr ? (
            <pre className="max-h-28 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-1.5 font-mono text-[10px] text-muted-foreground">
              {result.stderr}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-wrap gap-1.5">
        <Button variant="outline" size="sm" disabled={testing} onClick={() => store.getState().testHook(hook, sample)}>
          {testing ? "실행 중" : "지금 실행해 보기"}
        </Button>
        {!hook.source ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => store.getState().editHook(hook)}>
              수정
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => store.getState().deleteHook(hook.id)}
            >
              <Trash2 size={12} aria-hidden="true" /> 삭제
            </Button>
          </>
        ) : (
          <span className="self-center text-[11px] text-muted-foreground">플러그인이 등록한 훅은 여기서 고칠 수 없습니다.</span>
        )}
      </div>
    </Row>
  );
}

function HookEditor() {
  const draft = useExtensionStore((state) => state.hookDraft);
  const events = useExtensionStore((state) => state.snapshot.events);
  const builtins = useExtensionStore((state) => state.snapshot.builtins);
  const store = useExtensionStore;
  if (!draft) return null;

  const patch = store.getState().patchHookDraft;
  const builtin = builtins.find((item) => item.id === draft.builtinId);
  const event = events.find((item) => item.id === draft.event);

  return (
    <Shell
      footer={
        <>
          <Button variant="primary" size="sm" onClick={() => store.getState().saveHookDraft()}>
            저장
          </Button>
          <Button variant="ghost" size="sm" onClick={() => store.getState().cancelHookDraft()}>
            그만두기
          </Button>
        </>
      }
    >
      <div className="min-w-0 space-y-3 p-3">
        <label className="block min-w-0 space-y-1">
          <Label>설명</Label>
          <Input className="h-8 text-xs" value={draft.description} placeholder="이 훅이 무엇을 막는지" onChange={(e) => patch({ description: e.target.value })} />
        </label>

        <label className="block min-w-0 space-y-1">
          <Label>언제</Label>
          <select
            className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            value={draft.event}
            onChange={(e) => patch({ event: e.target.value })}
          >
            {events.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {item.wired ? "" : " (미연결)"}
              </option>
            ))}
          </select>
          {event ? <span className="block min-w-0 break-words text-[11px] text-muted-foreground">{event.description}</span> : null}
        </label>

        <div className="min-w-0 space-y-1">
          <Label>무엇으로</Label>
          <div className="flex min-w-0 gap-1.5">
            {(["builtin", "command"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={draft.handler === kind}
                onClick={() => patch({ handler: kind })}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
                  draft.handler === kind ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"
                )}
              >
                {kind === "builtin" ? "기본 검사" : "직접 만든 명령"}
              </button>
            ))}
          </div>
        </div>

        {draft.handler === "builtin" ? (
          <>
            <label className="block min-w-0 space-y-1">
              <Label>기본 검사</Label>
              <select
                className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                value={draft.builtinId}
                onChange={(e) => patch({ builtinId: e.target.value })}
              >
                {builtins.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              {builtin ? <span className="block min-w-0 break-words text-[11px] text-muted-foreground">{builtin.description}</span> : null}
            </label>
            {builtin?.requiresArgument ? (
              <label className="block min-w-0 space-y-1">
                <Label>{builtin.argumentLabel || "인자"}</Label>
                <Input className="h-8 font-mono text-xs" value={draft.builtinArgument} onChange={(e) => patch({ builtinArgument: e.target.value })} />
              </label>
            ) : null}
          </>
        ) : (
          <label className="block min-w-0 space-y-1">
            <Label>실행할 명령</Label>
            <Textarea rows={2} className="font-mono text-xs" value={draft.command} onChange={(e) => patch({ command: e.target.value })} />
          </label>
        )}

        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="block min-w-0 space-y-1">
            <Label>도구 이름 조건</Label>
            <Input className="h-8 font-mono text-xs" placeholder="비우면 모두" value={draft.toolPattern} onChange={(e) => patch({ toolPattern: e.target.value })} />
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>파일 경로 조건</Label>
            <Input className="h-8 font-mono text-xs" placeholder="비우면 모두" value={draft.pathGlob} onChange={(e) => patch({ pathGlob: e.target.value })} />
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>시간 제한 (ms)</Label>
            <Input
              className="h-8 text-xs"
              inputMode="numeric"
              value={String(draft.timeoutMs)}
              onChange={(e) => patch({ timeoutMs: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })}
            />
          </label>
          <div className="min-w-0 space-y-1">
            <Label>실패했을 때</Label>
            <div className="flex min-w-0 gap-1.5">
              {(["open", "closed"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={draft.failureMode === mode}
                  onClick={() => patch({ failureMode: mode })}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
                    draft.failureMode === mode ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  {mode === "open" ? "그냥 통과" : "작업 막기"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <Toggle on={draft.enabled} label="훅 사용" onChange={(next) => patch({ enabled: next })} />
          <span className="text-[11px] text-muted-foreground">{draft.enabled ? "사용함" : "꺼 둠"}</span>
        </div>
      </div>
    </Shell>
  );
}

/* ---------- 승인 ---------- */

export function ApprovalsPanel() {
  const pending = useExtensionStore((state) => state.snapshot.pendingApprovals);
  const grants = useExtensionStore((state) => state.snapshot.approvalGrants);
  const error = useExtensionStore((state) => state.snapshot.approvalError);
  const store = useExtensionStore;
  const [openId, setOpenId] = useState("");

  return (
    <Shell>
      {error ? <p className="border-b border-border bg-destructive/10 px-3 py-2 text-[11px] text-destructive">{error}</p> : null}

      <p className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        기다리는 중 {pending.length}건
      </p>
      {pending.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">승인을 기다리는 작업이 없습니다.</p>
      ) : (
        <Rows>
          {pending.map((item: PendingApprovalRow) => (
            <Row
              key={item.id}
              title={item.target || item.event}
              detail={`${item.event} · ${stamp(item.requestedUtc)}${item.requestCount > 1 ? ` · ${item.requestCount}번째` : ""}`}
              open={openId === item.id}
              onToggle={() => setOpenId(openId === item.id ? "" : item.id)}
              right={<Badge tone="warning">대기</Badge>}
            >
              {item.reason ? <p className="min-w-0 break-words text-[11px] text-muted-foreground">{item.reason}</p> : null}
              <Field name="훅" value={item.hookId || "-"} />
              <div className="flex min-w-0 flex-wrap gap-1.5">
                <Button variant="primary" size="sm" onClick={() => store.getState().approve(item.id, "once")}>
                  한 번만 허용
                </Button>
                <Button variant="outline" size="sm" onClick={() => store.getState().approve(item.id, "session")}>
                  이번 접속 동안 허용
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => store.getState().rejectApproval(item.id)}
                >
                  거절
                </Button>
              </div>
            </Row>
          ))}
        </Rows>
      )}

      <p className="border-y border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        허용해 둔 것 {grants.length}건
      </p>
      {grants.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">허용해 둔 항목이 없습니다.</p>
      ) : (
        <Rows>
          {grants.map((grant) => (
            <li key={grant.id} className="flex min-w-0 items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs">{grant.target || grant.event}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {grant.scope === "session" ? "이번 접속" : "한 번"} · {stamp(grant.grantedUtc)}
                  {grant.expiresUtc ? ` → ${stamp(grant.expiresUtc)}` : ""}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => store.getState().revokeApproval(grant.id)}
              >
                거두기
              </Button>
            </li>
          ))}
        </Rows>
      )}
    </Shell>
  );
}

/* ---------- 규칙 ---------- */

export function RulesPanel() {
  const rules = useExtensionStore((state) => state.snapshot.rules);
  const draft = useExtensionStore((state) => state.ruleDraft);
  const store = useExtensionStore;
  const [openId, setOpenId] = useState("");

  if (draft) {
    const patch = store.getState().patchRuleDraft;
    return (
      <Shell
        footer={
          <>
            <Button variant="primary" size="sm" onClick={() => store.getState().saveRuleDraft()}>
              저장
            </Button>
            <Button variant="ghost" size="sm" onClick={() => store.getState().cancelRuleDraft()}>
              그만두기
            </Button>
          </>
        }
      >
        <div className="min-w-0 space-y-3 p-3">
          <label className="block min-w-0 space-y-1">
            <Label>제목</Label>
            <Input className="h-8 text-xs" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>내용</Label>
            <Textarea rows={6} className="text-xs" value={draft.body} onChange={(e) => patch({ body: e.target.value })} />
          </label>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <Label>범위</Label>
              <div className="flex min-w-0 gap-1.5">
                {(["global", "project"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    aria-pressed={draft.scope === scope}
                    onClick={() => patch({ scope })}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
                      draft.scope === scope ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {scope === "global" ? "전체" : "이 프로젝트"}
                  </button>
                ))}
              </div>
            </div>
            <label className="block min-w-0 space-y-1">
              <Label>우선순위 (작을수록 먼저)</Label>
              <Input
                className="h-8 text-xs"
                inputMode="numeric"
                value={String(draft.priority)}
                onChange={(e) => patch({ priority: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })}
              />
            </label>
            <label className="block min-w-0 space-y-1 sm:col-span-2">
              <Label>파일 경로 조건</Label>
              <Input className="h-8 font-mono text-xs" placeholder="비우면 모두" value={draft.pathGlob} onChange={(e) => patch({ pathGlob: e.target.value })} />
            </label>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Toggle on={draft.enabled} label="규칙 사용" onChange={(next) => patch({ enabled: next })} />
            <span className="text-[11px] text-muted-foreground">{draft.enabled ? "사용함" : "꺼 둠"}</span>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      footer={
        <Button variant="primary" size="sm" onClick={() => store.getState().newRule()}>
          <Plus size={12} aria-hidden="true" /> 규칙 추가
        </Button>
      }
    >
      {rules.length === 0 ? (
        <Empty text="등록된 규칙이 없습니다." />
      ) : (
        <Rows>
          {rules.map((rule: RuleRow) => (
            <Row
              key={rule.id}
              title={rule.title || rule.id}
              detail={`${rule.scope === "global" ? "전체" : "이 프로젝트"} · 우선순위 ${rule.priority}${rule.pathGlob ? ` · ${rule.pathGlob}` : ""}`}
              open={openId === rule.id}
              onToggle={() => setOpenId(openId === rule.id ? "" : rule.id)}
              right={
                <>
                  {rule.source ? <Badge>{rule.source}</Badge> : null}
                  <Toggle on={rule.enabled} label={`${rule.title} 사용`} onChange={(next) => store.getState().toggleRule(rule, next)} />
                </>
              }
            >
              <p className="min-w-0 whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-[11px]">{rule.body}</p>
              {!rule.source ? (
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => store.getState().editRule(rule)}>
                    수정
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => store.getState().deleteRule(rule.id)}
                  >
                    <Trash2 size={12} aria-hidden="true" /> 삭제
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">플러그인이 등록한 규칙은 여기서 고칠 수 없습니다.</p>
              )}
            </Row>
          ))}
        </Rows>
      )}
    </Shell>
  );
}

/* ---------- 플러그인 ---------- */

export function PluginsPanel() {
  const plugins = useExtensionStore((state) => state.snapshot.plugins);
  const roots = useExtensionStore((state) => state.snapshot.pluginRoots);
  const errors = useExtensionStore((state) => state.snapshot.pluginErrors);
  const store = useExtensionStore;
  const [openId, setOpenId] = useState("");
  const [rootDraft, setRootDraft] = useState("");

  const addRoot = () => {
    const value = rootDraft.trim();
    if (value.length === 0) return;
    store.getState().addPluginRoot(value);
    setRootDraft("");
  };

  return (
    <Shell
      footer={
        <>
          <Input
            className="h-8 min-w-0 flex-1 font-mono text-xs"
            placeholder="플러그인 폴더 경로"
            aria-label="플러그인 폴더 경로"
            value={rootDraft}
            onChange={(event) => setRootDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addRoot();
            }}
          />
          <Button variant="primary" size="sm" onClick={addRoot} disabled={rootDraft.trim().length === 0}>
            폴더 추가
          </Button>
        </>
      }
    >
      {errors.length > 0 ? (
        <ul className="min-w-0 border-b border-border bg-destructive/10 px-3 py-2">
          {errors.map((message) => (
            <li key={message} className="min-w-0 break-words text-[11px] text-destructive">
              {message}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        찾는 폴더 {roots.length}곳
      </p>
      {roots.length === 0 ? (
        <p className="px-3 py-3 text-center text-xs text-muted-foreground">등록한 폴더가 없습니다.</p>
      ) : (
        <ul className="min-w-0 divide-y divide-border">
          {roots.map((root) => (
            <li key={root} className="flex min-w-0 items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 break-all font-mono text-[11px]">{root}</span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => store.getState().removePluginRoot(root)}
              >
                빼기
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="border-y border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        플러그인 {plugins.length}개
      </p>
      {plugins.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">읽어 온 플러그인이 없습니다.</p>
      ) : (
        <Rows>
          {plugins.map((plugin: PluginRow) => (
            <Row
              key={plugin.id}
              title={plugin.name || plugin.id}
              detail={`${plugin.version || "버전 없음"} · 훅 ${plugin.hookCount} · 규칙 ${plugin.ruleCount}`}
              open={openId === plugin.id}
              onToggle={() => setOpenId(openId === plugin.id ? "" : plugin.id)}
              right={
                <>
                  {!plugin.valid ? <Badge tone="destructive">오류</Badge> : null}
                  <Toggle on={plugin.enabled} label={`${plugin.name} 사용`} onChange={(next) => store.getState().togglePlugin(plugin.id, next)} />
                </>
              }
            >
              {plugin.description ? <p className="min-w-0 break-words text-[11px] text-muted-foreground">{plugin.description}</p> : null}
              <Field name="폴더" value={plugin.rootPath} />
              {plugin.author ? <Field name="만든이" value={plugin.author} /> : null}
              {plugin.license ? <Field name="라이선스" value={plugin.license} /> : null}
              {plugin.homepage ? <Field name="홈페이지" value={plugin.homepage} /> : null}
              {plugin.errors.length > 0 ? (
                <ul className="min-w-0 space-y-0.5 rounded-md bg-destructive/10 p-2">
                  {plugin.errors.map((message) => (
                    <li key={message} className="min-w-0 break-words text-[11px] text-destructive">
                      {message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Row>
          ))}
        </Rows>
      )}
    </Shell>
  );
}

/* ---------- 칸 껍데기 ---------- */

function Shell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      {footer ? <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t border-border p-2">{footer}</div> : null}
    </div>
  );
}

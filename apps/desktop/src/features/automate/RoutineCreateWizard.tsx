import { useState, type ReactNode } from "react";
import { CalendarClock, Check, Clock3, FileText, ListChecks, MessageCircle, MousePointer2, ShieldCheck, Sparkles } from "lucide-react";
import {
  ROUTINE_AGENT_MODEL_OPTIONS,
  ROUTINE_AGENT_PROVIDER_OPTIONS,
  ROUTINE_WEEKDAY_OPTIONS,
  useAutomateStore,
  type RoutineCreateForm,
  type RoutinePreview
} from "./automate-store";
import { Button, Input, Textarea, cn } from "../../components/ui/primitives";
import { PERMISSION_ACTIONS, PERMISSION_DECISIONS, type PermissionDecision } from "../dialog/permission-policy-store";

const STEPS = [
  { key: "request", label: "요청", hint: "무엇을 자동화할지 적습니다." },
  { key: "execution", label: "실행", hint: "답변 경로와 브라우저 에이전트 옵션을 정합니다." },
  { key: "schedule", label: "스케줄", hint: "요청 원문 자동 해석 또는 수동 예약을 선택합니다." },
  { key: "advanced", label: "권한·알림", hint: "루틴별 권한, 재시도, 텔레그램 응답을 정합니다." }
];

const EXECUTION_MODES = [
  { value: "", label: "자동" },
  { value: "web", label: "일반 답변" },
  { value: "url", label: "URL 참조" },
  { value: "script", label: "스크립트" },
  { value: "browser_agent", label: "브라우저 에이전트" }
];

const SCHEDULE_KINDS = [
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" }
];

const NOTIFY_POLICIES = [
  { value: "always", label: "항상 알림" },
  { value: "on_change", label: "변경 시" },
  { value: "error_only", label: "오류만" },
  { value: "never", label: "알리지 않음" }
];

const ROUTINE_TEMPLATES: Array<{ key: string; label: string; description: string; patch: Partial<RoutineCreateForm> }> = [
  {
    key: "morning-brief",
    label: "아침 브리핑",
    description: "매일 오전 주요 정보 요약",
    patch: {
      title: "아침 브리핑",
      request: "매일 오전 8시에 주요 뉴스와 오늘 할 일을 짧게 요약해줘",
      executionMode: "web",
      scheduleSourceMode: "manual",
      scheduleKind: "daily",
      scheduleTime: "08:00",
      notifyTelegram: true,
      notifyPolicy: "always"
    }
  },
  {
    key: "site-check",
    label: "사이트 점검",
    description: "URL 상태와 변경점 확인",
    patch: {
      title: "사이트 점검",
      request: "매일 오전 9시에 https://example.com 상태와 주요 변경점을 확인해줘",
      executionMode: "url",
      scheduleSourceMode: "manual",
      scheduleKind: "daily",
      scheduleTime: "09:00",
      notifyTelegram: true,
      notifyPolicy: "on_change"
    }
  },
  {
    key: "browser-agent",
    label: "브라우저 작업",
    description: "로그인 페이지나 동적 UI 점검",
    patch: {
      title: "브라우저 작업",
      request: "지정한 페이지를 열고 주요 버튼과 화면 상태를 확인해줘",
      executionMode: "browser_agent",
      agentProvider: "codex",
      agentModel: "gpt-5.4",
      agentToolProfile: "playwright_only",
      agentUsePlaywright: true,
      scheduleSourceMode: "auto",
      notifyTelegram: true
    }
  },
  {
    key: "weekly-report",
    label: "주간 리포트",
    description: "매주 금요일 결과 정리",
    patch: {
      title: "주간 리포트",
      request: "매주 금요일 오후 5시에 이번 주 진행 상황과 남은 일을 요약해줘",
      executionMode: "web",
      scheduleSourceMode: "manual",
      scheduleKind: "weekly",
      scheduleTime: "17:00",
      weekdays: [5],
      notifyTelegram: true,
      notifyPolicy: "always"
    }
  }
];

const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground transition-colors duration-200 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center rounded-md border px-3 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98]",
        active ? "border-primary bg-primary/12 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <span className="truncate">{children}</span>
    </button>
  );
}

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm transition-colors duration-200 hover:bg-accent/60">
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border-strong"
        )}
      >
        {checked ? <Check size={11} aria-hidden="true" /> : null}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}

function inferVisibleExecutionMode(form: RoutineCreateForm) {
  const explicit = `${form.executionMode || ""}`.trim();
  if (explicit) return explicit;
  const request = form.request.trim();
  if (/https?:\/\//i.test(request)) return "url";
  if (/(뉴스|news|헤드라인|속보|브리핑|기사|랭킹|이슈|실시간|최신|최근|오늘|현재|지금)/i.test(request)) return "web";
  return "script";
}

function modeLabel(value: string) {
  if (value === "browser_agent") return "브라우저 에이전트";
  if (value === "url") return "URL 참조";
  if (value === "web") return "일반 답변";
  return "스크립트";
}

function toolProfileLabel(value: string | undefined) {
  return value === "desktop_control" ? "데스크톱 제어" : "Playwright 전용";
}

function buildTelegramCommandPreview(form: RoutineCreateForm) {
  const request = form.request.trim() || "<요청>";
  if (inferVisibleExecutionMode(form) !== "browser_agent") {
    return `/routine create ${request}`;
  }
  const model = (form.agentModel || "gpt-5.4").trim();
  const startUrl = (form.agentStartUrl || "").trim();
  const toolProfile = (form.agentToolProfile || "playwright_only").trim();
  return [
    "/routine create browser",
    `--model ${model}`,
    startUrl ? `--url ${startUrl}` : "",
    `--tool-profile ${toolProfile}`,
    request
  ].filter(Boolean).join(" ");
}

function TemplateGrid({ onApply }: { onApply: (patch: Partial<RoutineCreateForm>) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <ListChecks size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={FIELD_LABEL}>템플릿</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ROUTINE_TEMPLATES.map((template) => (
          <button
            key={template.key}
            type="button"
            onClick={() => onApply(template.patch)}
            className="min-w-0 rounded-md border border-border bg-muted/30 p-2 text-left transition-colors duration-200 hover:bg-accent/60 active:scale-[0.98]"
          >
            <span className="block truncate text-xs font-semibold">{template.label}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{template.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TriggerTiles({ form, patch }: { form: RoutineCreateForm; patch: (patch: Partial<RoutineCreateForm>) => void }) {
  const manualSchedule = (form.scheduleSourceMode || "auto") === "manual";
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <CalendarClock size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={FIELD_LABEL}>시작 방식</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => patch({ scheduleSourceMode: "manual", scheduleKind: form.scheduleKind || "daily", scheduleTime: form.scheduleTime || "08:00", runImmediately: false })}
          className={cn(
            "min-w-0 rounded-md border p-2 text-left transition-colors duration-200 active:scale-[0.98]",
            manualSchedule && !form.runImmediately ? "border-primary/50 bg-primary/10" : "border-border bg-muted/30 hover:bg-accent/60"
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold"><CalendarClock size={13} className="shrink-0" aria-hidden="true" /> <span className="truncate">스케줄</span></span>
          <span className="block truncate text-[11px] text-muted-foreground">정해진 시간에 실행</span>
        </button>
        <button
          type="button"
          onClick={() => patch({ notifyTelegram: true, notifyPolicy: form.notifyPolicy || "always" })}
          className={cn(
            "min-w-0 rounded-md border p-2 text-left transition-colors duration-200 active:scale-[0.98]",
            form.notifyTelegram ? "border-primary/50 bg-primary/10" : "border-border bg-muted/30 hover:bg-accent/60"
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold"><MessageCircle size={13} className="shrink-0" aria-hidden="true" /> <span className="truncate">Telegram</span></span>
          <span className="block truncate text-[11px] text-muted-foreground">실행 결과 응답</span>
        </button>
        <button
          type="button"
          onClick={() => patch({ runImmediately: true, scheduleSourceMode: "auto" })}
          className={cn(
            "min-w-0 rounded-md border p-2 text-left transition-colors duration-200 active:scale-[0.98]",
            form.runImmediately ? "border-primary/50 bg-primary/10" : "border-border bg-muted/30 hover:bg-accent/60"
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold"><MousePointer2 size={13} className="shrink-0" aria-hidden="true" /> <span className="truncate">수동 테스트</span></span>
          <span className="block truncate text-[11px] text-muted-foreground">저장 직후 1회 실행</span>
        </button>
        <button
          type="button"
          disabled
          className="min-w-0 cursor-not-allowed rounded-md border border-border bg-muted/20 p-2 text-left opacity-60"
          title="file-change trigger는 백엔드 계약 확인 후 연결"
        >
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold"><FileText size={13} className="shrink-0" aria-hidden="true" /> <span className="truncate">파일 변경</span></span>
          <span className="block truncate text-[11px] text-muted-foreground">계약 필요</span>
        </button>
      </div>
    </div>
  );
}

function TelegramCommandPreview({ form }: { form: RoutineCreateForm }) {
  const preview = buildTelegramCommandPreview(form);
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="mb-1 flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
        <MessageCircle size={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">Telegram 명령 미리보기</span>
      </div>
      <code className="block truncate rounded border border-border bg-background/70 px-2 py-1.5 font-mono text-[11px] text-foreground">{preview}</code>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">저장 후 실행은 `/routine run &lt;routine-id&gt;` 형식입니다.</p>
    </div>
  );
}

function permissionDecisionClass(decision: PermissionDecision, active: boolean) {
  if (!active) return "text-muted-foreground hover:bg-accent hover:text-foreground";
  if (decision === "allow") return "bg-success/15 text-success";
  if (decision === "deny") return "bg-destructive/15 text-destructive";
  return "bg-warning/15 text-warning";
}

function PermissionFields({ form, patch }: { form: RoutineCreateForm; patch: (patch: Partial<RoutineCreateForm>) => void }) {
  const permissions = form.permissions || {};
  const setDecision = (action: keyof NonNullable<RoutineCreateForm["permissions"]>, decision: PermissionDecision) => {
    patch({ permissions: { ...permissions, [action]: decision } });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/25 p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={FIELD_LABEL}>루틴별 권한</span>
        </div>
        <span className="truncate text-[11px] text-muted-foreground">전역 기본값에서 시작</span>
      </div>
      <div className="space-y-2">
        {PERMISSION_ACTIONS.map((item) => {
          const current = (permissions[item.action] || "ask") as PermissionDecision;
          return (
            <div key={item.action} className="grid gap-2 rounded-md border border-border bg-background/40 px-2.5 py-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <span className="block truncate text-xs font-medium">{item.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{item.description}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                {PERMISSION_DECISIONS.map((decision) => {
                  const active = current === decision.decision;
                  return (
                    <button
                      key={decision.decision}
                      type="button"
                      onClick={() => setDecision(item.action, decision.decision)}
                      className={cn(
                        "rounded px-2 py-1 text-xs font-medium transition-colors duration-200 active:scale-[0.98]",
                        permissionDecisionClass(decision.decision, active)
                      )}
                    >
                      {decision.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExecutionFields({ form, patch }: { form: RoutineCreateForm; patch: (patch: Partial<RoutineCreateForm>) => void }) {
  const visibleMode = inferVisibleExecutionMode(form);
  const isBrowserAgent = visibleMode === "browser_agent";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className={FIELD_LABEL}>실행 모드</span>
        <span className="truncate text-[11px] text-muted-foreground">{form.executionMode ? "명시 선택" : `자동 감지: ${modeLabel(visibleMode)}`}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {EXECUTION_MODES.map((mode) => (
          <Chip
            key={mode.value || "auto"}
            active={(form.executionMode || "") === mode.value}
            onClick={() => patch({
              executionMode: mode.value,
              ...(mode.value === "browser_agent" ? {
                agentProvider: form.agentProvider || "codex",
                agentModel: form.agentModel || "gpt-5.4",
                agentToolProfile: form.agentToolProfile || "playwright_only",
                agentUsePlaywright: true
              } : {})
            })}
          >
            {mode.label}
          </Chip>
        ))}
      </div>
      {!form.executionMode ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          URL이 있으면 URL 참조, 최신 정보 질의면 일반 답변, 그 외는 스크립트로 처리합니다.
        </div>
      ) : null}
      {isBrowserAgent ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block min-w-0 space-y-1">
            <span className={FIELD_LABEL}>에이전트 제공자</span>
            <select className={SELECT_CLASS} value={form.agentProvider || "codex"} onChange={(event) => patch({ agentProvider: event.target.value })}>
              {ROUTINE_AGENT_PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 space-y-1">
            <span className={FIELD_LABEL}>에이전트 모델</span>
            <select className={SELECT_CLASS} value={form.agentModel || "gpt-5.4"} onChange={(event) => patch({ agentModel: event.target.value })}>
              {ROUTINE_AGENT_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 space-y-1 md:col-span-2">
            <span className={FIELD_LABEL}>시작 URL</span>
            <Input value={form.agentStartUrl || ""} placeholder="비워두면 요청 원문에 포함된 첫 URL 사용" onChange={(event) => patch({ agentStartUrl: event.target.value })} />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className={FIELD_LABEL}>타임아웃(초)</span>
            <Input
              type="number"
              min={120}
              max={1800}
              value={form.agentTimeoutSeconds || 120}
              onChange={(event) => patch({ agentTimeoutSeconds: Math.min(1800, Math.max(120, Number(event.target.value) || 120)) })}
            />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className={FIELD_LABEL}>도구 프로필</span>
            <select className={SELECT_CLASS} value={form.agentToolProfile || "playwright_only"} onChange={(event) => patch({ agentToolProfile: event.target.value, agentUsePlaywright: true })}>
              <option value="playwright_only">Playwright 전용</option>
              <option value="desktop_control">데스크톱 제어</option>
            </select>
          </label>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground md:col-span-2">
            현재 선택: {form.agentProvider || "codex"} / {form.agentModel || "gpt-5.4"} · {toolProfileLabel(form.agentToolProfile)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleFields({ form, patch, toggleWeekday }: { form: RoutineCreateForm; patch: (patch: Partial<RoutineCreateForm>) => void; toggleWeekday: (day: number) => void }) {
  const sourceMode = form.scheduleSourceMode || "auto";
  const manual = sourceMode === "manual";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className={FIELD_LABEL}>스케줄 기준</span>
        <span className="truncate text-[11px] text-muted-foreground">{manual ? "수동 스케줄 우선" : "요청 원문 우선"}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip active={!manual} onClick={() => patch({ scheduleSourceMode: "auto" })}>자동(요청 원문)</Chip>
        <Chip active={manual} onClick={() => patch({ scheduleSourceMode: "manual" })}>수동</Chip>
      </div>
      {!manual ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          요청에 적은 매일, 요일, 시간 표현을 그대로 사용합니다. 스케줄 표현이 없으면 매일 08:00 기준으로 처리됩니다.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {SCHEDULE_KINDS.map((kind) => (
              <Chip key={kind.value} active={form.scheduleKind === kind.value} onClick={() => patch({ scheduleKind: kind.value })}>
                {kind.label}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block min-w-0 space-y-1">
              <span className={FIELD_LABEL}>실행 시간</span>
              <Input type="time" value={form.scheduleTime || "08:00"} onChange={(event) => patch({ scheduleTime: event.target.value })} />
            </label>
            <label className="block min-w-0 space-y-1">
              <span className={FIELD_LABEL}>시간대</span>
              <Input value={form.timezoneId || "Asia/Seoul"} onChange={(event) => patch({ timezoneId: event.target.value })} />
            </label>
          </div>
          {form.scheduleKind === "weekly" ? (
            <div className="space-y-1">
              <span className={FIELD_LABEL}>요일</span>
              <div className="flex flex-wrap gap-2">
                {ROUTINE_WEEKDAY_OPTIONS.map((day) => (
                  <Chip key={day.value} active={form.weekdays.includes(day.value)} onClick={() => toggleWeekday(day.value)}>
                    {day.label}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          {form.scheduleKind === "monthly" ? (
            <label className="block max-w-[160px] space-y-1">
              <span className={FIELD_LABEL}>실행 날짜</span>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.dayOfMonth || 1}
                onChange={(event) => patch({ dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value) || 1)) })}
              />
            </label>
          ) : null}
        </div>
      )}
    </div>
  );
}

function AdvancedFields({ form, patch }: { form: RoutineCreateForm; patch: (patch: Partial<RoutineCreateForm>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block min-w-0 space-y-1">
          <span className={FIELD_LABEL}>최대 재시도</span>
          <Input type="number" min={0} max={5} value={form.maxRetries ?? 1} onChange={(event) => patch({ maxRetries: Math.max(0, Math.min(5, Number(event.target.value) || 0)) })} />
        </label>
        <label className="block min-w-0 space-y-1">
          <span className={FIELD_LABEL}>재시도 간격(초)</span>
          <Input type="number" min={0} max={300} value={form.retryDelaySeconds ?? 15} onChange={(event) => patch({ retryDelaySeconds: Math.max(0, Math.min(300, Number(event.target.value) || 0)) })} />
        </label>
      </div>
      <label className="block min-w-0 space-y-1">
        <span className={FIELD_LABEL}>알림 정책</span>
        <select className={SELECT_CLASS} value={form.notifyPolicy || "always"} onChange={(event) => patch({ notifyPolicy: event.target.value })}>
          {NOTIFY_POLICIES.map((policy) => (
            <option key={policy.value} value={policy.value}>{policy.label}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CheckRow checked={!!form.notifyTelegram} onChange={(value) => patch({ notifyTelegram: value })}>
          실행 결과 텔레그램 응답
        </CheckRow>
        <CheckRow checked={!!form.runImmediately} onChange={(value) => patch({ runImmediately: value })}>
          저장 직후 테스트 실행
        </CheckRow>
      </div>
    </div>
  );
}

function PreviewPanel({ preview }: { preview: RoutinePreview | null }) {
  if (!preview) return null;
  return (
    <div className={cn("space-y-2 rounded-lg border p-3 text-sm", preview.warnings.length > 0 ? "border-warning/40 bg-warning/10" : "border-border bg-muted/30")}>
      <div className="flex min-w-0 items-center gap-2">
        <Clock3 size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 text-xs text-muted-foreground">스케줄</span>
        <strong className="truncate">{preview.scheduleText || "-"}</strong>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 text-xs text-muted-foreground">실행</span>
        <strong className="truncate">{`${modeLabel(preview.resolvedExecutionMode)} / ${preview.executionRoute || "-"}`}</strong>
      </div>
      {preview.warnings.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-warning">
          {preview.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-success">사전 확인에서 즉시 막을 항목은 없습니다.</p>
      )}
    </div>
  );
}

export function RoutineCreateWizard({ canRequest }: { canRequest: boolean }) {
  const form = useAutomateStore((state) => state.createForm);
  const preview = useAutomateStore((state) => state.preview);
  const creating = useAutomateStore((state) => state.creating);
  const patch = useAutomateStore((state) => state.patchCreateForm);
  const toggleWeekday = useAutomateStore((state) => state.toggleWeekday);
  const previewRoutine = useAutomateStore((state) => state.previewRoutine);
  const createRoutine = useAutomateStore((state) => state.createRoutine);
  const resetForm = useAutomateStore((state) => state.resetCreateForm);

  const [step, setStep] = useState(0);
  const requestValid = form.request.trim().length >= 5;
  const requestTouched = form.request.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {STEPS.map((definition, index) => {
          const active = step === index;
          const done = index < step;
          return (
            <button
              key={definition.key}
              type="button"
              disabled={index > 0 && !requestValid}
              onClick={() => {
                if (index === 0 || requestValid) setStep(index);
              }}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors duration-200 active:scale-[0.98] disabled:opacity-40",
                active ? "border-primary/50 bg-primary/10 text-foreground" : done ? "border-border bg-muted/40 text-muted-foreground" : "border-border text-muted-foreground"
              )}
            >
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", active ? "bg-primary text-primary-foreground" : done ? "bg-success text-white" : "bg-muted text-muted-foreground")}>
                {done ? <Check size={11} aria-hidden="true" /> : index + 1}
              </span>
              <span className="truncate">{definition.label}</span>
            </button>
          );
        })}
      </div>
      <p className="truncate text-[11px] text-muted-foreground">
        STEP {step + 1} / {STEPS.length} · {STEPS[step].hint}
      </p>

      {step === 0 ? (
        <div className="space-y-3">
          <TemplateGrid onApply={(templatePatch) => patch(templatePatch)} />
          <label className="block space-y-1">
            <span className={FIELD_LABEL}>루틴 이름</span>
            <Input value={form.title} placeholder="비워두면 요청 기반으로 자동 생성" onChange={(event) => patch({ title: event.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className={FIELD_LABEL}>요청 원문</span>
            <Textarea rows={4} value={form.request} placeholder="예: 매일 오전 8시에 주요 기사와 서버 상태를 요약해줘" onChange={(event) => patch({ request: event.target.value })} />
          </label>
          {!requestValid && requestTouched ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">요청 원문은 최소 5자 이상이어야 합니다.</p>
          ) : null}
          <TriggerTiles form={form} patch={patch} />
          <TelegramCommandPreview form={form} />
        </div>
      ) : null}

      {step === 1 ? <ExecutionFields form={form} patch={patch} /> : null}
      {step === 2 ? <ScheduleFields form={form} patch={patch} toggleWeekday={toggleWeekday} /> : null}
      {step === 3 ? (
        <div className="space-y-4">
          <PermissionFields form={form} patch={patch} />
          <AdvancedFields form={form} patch={patch} />
        </div>
      ) : null}

      <PreviewPanel preview={preview} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button variant="outline" size="sm" disabled={step === 0 || creating} onClick={() => setStep(step - 1)}>
          이전
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" size="sm" disabled={!requestValid || creating} onClick={() => requestValid && setStep(step + 1)}>
            다음 단계
          </Button>
        ) : (
          <Button variant="primary" size="sm" disabled={!canRequest || !requestValid || creating} onClick={createRoutine}>
            {creating ? "저장 중..." : form.runImmediately ? "루틴 저장 + 테스트" : "루틴 저장"}
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={!canRequest || !requestValid || creating} onClick={() => previewRoutine("create")}>
          미리보기
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto" disabled={creating} onClick={resetForm}>
          초기화
        </Button>
      </div>
    </div>
  );
}

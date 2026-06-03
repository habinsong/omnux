import { useEffect } from "react";
import { Bot, Clock, FileText, MessageCircle, Play, Plus, RefreshCcw, Sparkles, Trash2, X } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { useAutomatePageBridge, useAutomateStore } from "./automate-store";
import { RoutineCreateWizard } from "./RoutineCreateWizard";
import { Badge, Button, EmptyState, IconButton, SectionLabel, cn } from "../../components/ui/primitives";

const TRIGGER_META = {
  schedule: { label: "예약", icon: Clock, tint: "bg-indigo-500/12 text-indigo-500" },
  telegram: { label: "텔레그램", icon: MessageCircle, tint: "bg-sky-500/12 text-sky-500" },
  manual: { label: "수동", icon: Play, tint: "bg-emerald-500/12 text-emerald-500" },
  file: { label: "파일 변경", icon: FileText, tint: "bg-amber-500/12 text-amber-500" }
};

const AUTOMATION_TEMPLATES = [
  { id: "t1", name: "모닝 프로젝트 브리프", desc: "변경 사항의 일일 요약.", trigger: "schedule", request: "매일 아침 프로젝트 변경 사항을 요약해줘.", scheduleKind: "daily", scheduleTime: "08:00", notifyTelegram: false },
  { id: "t2", name: "저장소 상태 점검", desc: "빌드·테스트 후 실패 보고.", trigger: "schedule", request: "매일 저장소를 빌드하고 테스트 실패를 요약해줘.", scheduleKind: "daily", scheduleTime: "09:00", notifyTelegram: false },
  { id: "t3", name: "최근 변경 요약", desc: "알기 쉬운 커밋 요약.", trigger: "telegram", request: "최근 변경 사항을 알기 쉬운 문장으로 요약해줘.", scheduleKind: "daily", scheduleTime: "08:30", notifyTelegram: true },
  { id: "t4", name: "텔레그램 명령 봇", desc: "채팅에서 omnux 실행.", trigger: "telegram", request: "텔레그램에서 요청한 작업을 실행하고 결과를 요약해줘.", scheduleKind: "daily", scheduleTime: "08:00", notifyTelegram: true },
  { id: "t5", name: "일일 빌드 점검", desc: "문제를 일찍 발견하세요.", trigger: "schedule", request: "매일 빌드 상태를 점검하고 실패 원인을 정리해줘.", scheduleKind: "daily", scheduleTime: "10:00", notifyTelegram: false },
  { id: "t6", name: "모델 비교 리포트", desc: "프롬프트로 모델 비교.", trigger: "manual", request: "같은 프롬프트에 대한 여러 모델 응답을 비교해줘.", scheduleKind: "daily", scheduleTime: "08:00", notifyTelegram: false }
] as const;

type Routine = ReturnType<typeof useAutomateStore.getState>["routines"][number];

function messageLooksDangerous(message: string) {
  return /(오류|실패|unauthorized|error|failed)/i.test(message);
}

function routineTrigger(routine: Routine) {
  const kind = routine.scheduleKind.toLowerCase();
  if (kind.includes("telegram") || routine.notifyTelegram) return "telegram";
  if (kind === "manual") return "manual";
  return "schedule";
}

function routineWhen(routine: Routine) {
  if (routine.scheduleSummary) return routine.scheduleSummary;
  if (routine.scheduleKind === "weekly" && routine.weekdays.length > 0) return "매주";
  if (routine.scheduleKind === "monthly" && routine.dayOfMonth) return `매월 · ${routine.dayOfMonth}일`;
  if (routine.scheduleKind === "daily" && routine.scheduleTime) return `매일 · ${routine.scheduleTime}`;
  return routine.runCommand || routine.resolvedExecutionMode || "-";
}

function Toggle({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50",
        on ? "bg-primary" : "bg-border-strong"
      )}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200", on ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );
}

export function AutomatePage() {
  useAutomatePageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const telegramConfigured = useDesktopAuthStore((state) => state.auth.telegramConfigured);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const setActivePage = useDesktopNavigationStore((state) => state.setActivePage);
  const store = useAutomateStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (canRequest) store.loadRoutines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  const openTemplate = (template: (typeof AUTOMATION_TEMPLATES)[number]) => {
    store.resetCreateForm();
    store.patchCreateForm({
      title: template.name,
      request: template.request,
      scheduleKind: template.scheduleKind,
      scheduleTime: template.scheduleTime,
      notifyTelegram: !!template.notifyTelegram
    });
    store.setCreatePanelOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">자동화</h1>
          <p className="text-sm text-muted-foreground">어떤 작업이든 루틴으로 만드세요 — 예약, 텔레그램 명령, 파일 변경으로.</p>
        </div>
        {!store.createPanelOpen ? (
          <Button variant="primary" onClick={() => store.setCreatePanelOpen(true)}>
            <Plus size={16} aria-hidden="true" /> 새 자동화
          </Button>
        ) : null}
      </div>

      {store.createPanelOpen ? (
        <CardBoundary title="새 자동화" card="navigation" onError={recordCardError} hideTitle>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles size={16} aria-hidden="true" /> 새 자동화
            </div>
            <IconButton icon={X} label="닫기" onClick={() => store.setCreatePanelOpen(false)} />
          </div>
          <p className="text-xs text-muted-foreground">단계별로 입력하면 누락 위험을 줄입니다. 미리보기로 스케줄/실행 경로를 사전 확인할 수 있습니다.</p>
          <RoutineCreateWizard canRequest={canRequest} />
        </CardBoundary>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-500/12 text-sky-500">
            <MessageCircle size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <b className="text-sm">{telegramConfigured ? "텔레그램이 연결되었습니다" : "루틴은 실제 미들웨어 상태로 동작합니다."}</b>
            <div className="text-xs text-muted-foreground">
              {telegramConfigured ? "휴대폰에서 omnux를 실행하세요." : "생성, 실행, 삭제, toggle 결과는 백엔드 응답으로 확정합니다."}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setActivePage("settings")}>관리</Button>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>내 자동화</SectionLabel>
          <Button variant="outline" size="sm" onClick={store.loadRoutines} disabled={!canRequest || store.pending}>
            <RefreshCcw size={14} aria-hidden="true" /> {store.pending ? "조회 중" : "새로고침"}
          </Button>
        </div>
        {store.lastMessage ? (
          <p className={cn("rounded-md px-3 py-2 text-xs", messageLooksDangerous(store.lastMessage) ? "border border-destructive/30 bg-destructive/10 text-destructive" : "border border-border bg-muted/40 text-muted-foreground")}>
            {store.lastMessage}
          </p>
        ) : null}
        {store.routines.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="아직 자동화가 없습니다"
            description="새 자동화를 만들어 반복 작업을 omnux에게 맡기세요."
            action={
              <Button variant="primary" size="sm" onClick={() => store.setCreatePanelOpen(true)}>
                <Plus size={15} aria-hidden="true" /> 새 자동화
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {store.routines.map((routine) => {
              const meta = TRIGGER_META[routineTrigger(routine)];
              const TriggerIcon = meta.icon;
              const selected = routine.id === store.selectedRoutineId;
              return (
                <article
                  key={routine.id}
                  onClick={() => store.selectRoutine(routine.id)}
                  className={cn(
                    "cursor-pointer rounded-lg border bg-card p-4 shadow-[var(--shadow-card)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5",
                    selected ? "border-primary/50 ring-1 ring-primary/30" : "border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meta.tint)}>
                        <TriggerIcon size={17} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <b className="block truncate text-sm">{routine.title}</b>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Badge tone="outline">{meta.label}</Badge>
                          <span className="truncate">{routineWhen(routine)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                      <IconButton icon={Play} label="지금 실행" onClick={() => store.runRoutine(routine.id)} disabled={!canRequest || store.pending} />
                      <Toggle on={routine.enabled} disabled={!canRequest || store.pending} label={routine.enabled ? "비활성화" : "활성화"} onClick={() => store.toggleRoutine(routine.id, !routine.enabled)} />
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">"{routine.request || routine.preview || "루틴 설명 없음"}"</p>
                  <div className="mt-3 flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                    <Badge tone={routine.enabled ? "success" : "default"}>{routine.enabled ? "enabled" : "disabled"}</Badge>
                    {routine.notifyTelegram ? <Badge tone="outline">telegram</Badge> : null}
                    {routine.lastStatus ? <Badge tone="outline">{routine.lastStatus}</Badge> : null}
                    <Button variant="ghost" size="sm" className="ml-auto h-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => store.deleteRoutine(routine.id)} disabled={!canRequest || store.pending}>
                      <Trash2 size={14} aria-hidden="true" /> 삭제
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel>템플릿으로 시작</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AUTOMATION_TEMPLATES.map((template) => {
            const meta = TRIGGER_META[template.trigger];
            const TemplateIcon = meta.icon;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => openTemplate(template)}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left shadow-[var(--shadow-card)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong"
              >
                <div className="flex items-center gap-2.5">
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", meta.tint)}>
                    <TemplateIcon size={16} aria-hidden="true" />
                  </span>
                  <b className="text-sm">{template.name}</b>
                </div>
                <p className="text-xs text-muted-foreground">{template.desc}</p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

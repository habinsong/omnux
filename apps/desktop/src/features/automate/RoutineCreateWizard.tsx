import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useAutomateStore } from "./automate-store";
import { Button, Input, Textarea, cn } from "../../components/ui/primitives";

// dashboard routine-create-wizard.js 이식: 3-step progressive-disclosure 루틴 생성 폼.
// 폼 상태는 automate-store가 소유하고, 이 컴포넌트는 currentStep만 로컬로 가진다.
const STEPS = [
  { key: "request", label: "요청", hint: "무엇을 자동화할지 적습니다." },
  { key: "schedule", label: "스케줄", hint: "언제 실행할지 정합니다." },
  { key: "advanced", label: "고급", hint: "테스트 실행 / 텔레그램 알림." }
];
const SCHEDULE_KINDS = [
  { value: "manual", label: "수동" },
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" }
];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200",
        active ? "border-primary bg-primary/12 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm">
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border-strong"
        )}
      >
        {checked ? <Check size={11} aria-hidden="true" /> : null}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {children}
    </label>
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
  const timed = form.scheduleKind === "daily" || form.scheduleKind === "weekly" || form.scheduleKind === "monthly";

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex items-center gap-2">
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
                "flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors duration-200 disabled:opacity-40",
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
      <p className="text-[11px] text-muted-foreground">
        STEP {step + 1} / {STEPS.length} · {STEPS[step].hint}
      </p>

      {step === 0 ? (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className={FIELD_LABEL}>루틴 이름</span>
            <Input value={form.title} placeholder="비워두면 요청 기반으로 자동 생성" onChange={(event) => patch({ title: event.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className={FIELD_LABEL}>요청 원문</span>
            <Textarea rows={3} value={form.request} placeholder="예: 매일 오전 8시에 주요 기사와 서버 상태를 요약해줘" onChange={(event) => patch({ request: event.target.value })} />
          </label>
          {!requestValid && requestTouched ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">요청 원문은 최소 5자 이상이어야 합니다.</p>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3">
          <span className={FIELD_LABEL}>스케줄</span>
          <div className="flex flex-wrap gap-2">
            {SCHEDULE_KINDS.map((kind) => (
              <Chip key={kind.value} active={form.scheduleKind === kind.value} onClick={() => patch({ scheduleKind: kind.value })}>
                {kind.label}
              </Chip>
            ))}
          </div>
          {timed ? (
            <label className="block space-y-1">
              <span className={FIELD_LABEL}>시각</span>
              <Input type="time" value={form.scheduleTime} onChange={(event) => patch({ scheduleTime: event.target.value })} className="max-w-[160px]" />
            </label>
          ) : null}
          {form.scheduleKind === "weekly" ? (
            <div className="space-y-1">
              <span className={FIELD_LABEL}>요일</span>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((label, day) => (
                  <Chip key={day} active={form.weekdays.includes(day)} onClick={() => toggleWeekday(day)}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          {form.scheduleKind === "monthly" ? (
            <label className="block space-y-1">
              <span className={FIELD_LABEL}>일자 (1-31)</span>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.dayOfMonth}
                onChange={(event) => patch({ dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value) || 1)) })}
                className="max-w-[120px]"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-2">
          <CheckRow checked={form.runImmediately} onChange={(v) => patch({ runImmediately: v })}>
            생성 직후 테스트 실행 (기본: 저장만)
          </CheckRow>
          <CheckRow checked={form.notifyTelegram} onChange={(v) => patch({ notifyTelegram: v })}>
            실행 결과를 텔레그램으로 알림
          </CheckRow>
        </div>
      ) : null}

      {preview ? (
        <div className={cn("space-y-2 rounded-lg border p-3 text-sm", preview.warnings.length > 0 ? "border-warning/40 bg-warning/10" : "border-border bg-muted/30")}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">실행</span>
            <strong>{`${preview.resolvedExecutionMode || "-"} / ${preview.executionRoute || "-"}`}</strong>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">스케줄</span>
            <strong>{preview.scheduleText || "-"}</strong>
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
      ) : null}

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
            {creating ? "생성 중..." : form.runImmediately ? "루틴 생성 + 테스트" : "루틴 저장"}
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={!canRequest || !requestValid || creating} onClick={previewRoutine}>
          미리보기
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto" disabled={creating} onClick={resetForm}>
          초기화
        </Button>
      </div>
    </div>
  );
}

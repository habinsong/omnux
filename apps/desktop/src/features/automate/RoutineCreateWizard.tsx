import { useState } from "react";
import { useAutomateStore } from "./automate-store";

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
    <div className="routine-wizard">
      <div className="routine-wizard-stepnav">
        {STEPS.map((definition, index) => (
          <button
            key={definition.key}
            type="button"
            className={`routine-wizard-step${step === index ? " active" : ""}${index < step ? " done" : ""}`}
            disabled={index > 0 && !requestValid}
            onClick={() => {
              if (index === 0 || requestValid) {
                setStep(index);
              }
            }}
          >
            <span className="routine-wizard-step-index">{index + 1}</span>
            <span>{definition.label}</span>
          </button>
        ))}
      </div>
      <div className="routine-wizard-hint">
        STEP {step + 1} / {STEPS.length} · {STEPS[step].hint}
      </div>

      {step === 0 ? (
        <div className="routine-wizard-body">
          <label className="routine-field">
            <span className="routine-field-label">루틴 이름</span>
            <input
              className="field"
              value={form.title}
              placeholder="비워두면 요청 기반으로 자동 생성"
              onChange={(event) => patch({ title: event.target.value })}
            />
          </label>
          <label className="routine-field">
            <span className="routine-field-label">요청 원문</span>
            <textarea
              className="field"
              style={{ minHeight: 96 }}
              value={form.request}
              placeholder="예: 매일 오전 8시에 주요 기사와 서버 상태를 요약해줘"
              onChange={(event) => patch({ request: event.target.value })}
            />
          </label>
          {!requestValid && requestTouched ? (
            <div className="section-error">요청 원문은 최소 5자 이상이어야 합니다.</div>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="routine-wizard-body">
          <span className="routine-field-label">스케줄</span>
          <div className="routine-wizard-kinds">
            {SCHEDULE_KINDS.map((kind) => (
              <button
                key={kind.value}
                type="button"
                className={`chip${form.scheduleKind === kind.value ? " active" : ""}`}
                onClick={() => patch({ scheduleKind: kind.value })}
              >
                {kind.label}
              </button>
            ))}
          </div>
          {timed ? (
            <label className="routine-field">
              <span className="routine-field-label">시각</span>
              <input
                className="field"
                type="time"
                value={form.scheduleTime}
                onChange={(event) => patch({ scheduleTime: event.target.value })}
              />
            </label>
          ) : null}
          {form.scheduleKind === "weekly" ? (
            <div className="routine-field">
              <span className="routine-field-label">요일</span>
              <div className="routine-wizard-kinds">
                {WEEKDAYS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    className={`chip${form.weekdays.includes(day) ? " active" : ""}`}
                    onClick={() => toggleWeekday(day)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {form.scheduleKind === "monthly" ? (
            <label className="routine-field">
              <span className="routine-field-label">일자 (1-31)</span>
              <input
                className="field"
                type="number"
                min={1}
                max={31}
                value={form.dayOfMonth}
                onChange={(event) => patch({ dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value) || 1)) })}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="routine-wizard-body">
          <label className="routine-check">
            <input
              type="checkbox"
              checked={form.runImmediately}
              onChange={(event) => patch({ runImmediately: event.target.checked })}
            />
            <span>생성 직후 테스트 실행 (기본: 저장만)</span>
          </label>
          <label className="routine-check">
            <input
              type="checkbox"
              checked={form.notifyTelegram}
              onChange={(event) => patch({ notifyTelegram: event.target.checked })}
            />
            <span>실행 결과를 텔레그램으로 알림</span>
          </label>
        </div>
      ) : null}

      {preview ? (
        <div className={`routine-wizard-preview${preview.warnings.length > 0 ? " warn" : ""}`}>
          <div>
            <span>실행</span>
            <strong>{`${preview.resolvedExecutionMode || "-"} / ${preview.executionRoute || "-"}`}</strong>
          </div>
          <div>
            <span>스케줄</span>
            <strong>{preview.scheduleText || "-"}</strong>
          </div>
          {preview.warnings.length > 0 ? (
            <ul>
              {preview.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ) : (
            <div className="routine-wizard-preview-ok">사전 확인에서 즉시 막을 항목은 없습니다.</div>
          )}
        </div>
      ) : null}

      <div className="log-toolbar" style={{ marginTop: 12, flexWrap: "wrap" }}>
        <button className="secondary-button" type="button" disabled={step === 0 || creating} onClick={() => setStep(step - 1)}>
          이전
        </button>
        {step < STEPS.length - 1 ? (
          <button
            className="secondary-button"
            type="button"
            disabled={!requestValid || creating}
            onClick={() => {
              if (requestValid) {
                setStep(step + 1);
              }
            }}
          >
            다음 단계
          </button>
        ) : (
          <button className="secondary-button" type="button" disabled={!canRequest || !requestValid || creating} onClick={createRoutine}>
            {creating ? "생성 중..." : form.runImmediately ? "루틴 생성 + 테스트" : "루틴 저장"}
          </button>
        )}
        <button className="secondary-button" type="button" disabled={!canRequest || !requestValid || creating} onClick={previewRoutine}>
          미리보기
        </button>
        <button className="secondary-button" type="button" disabled={creating} onClick={resetForm}>
          초기화
        </button>
      </div>
    </div>
  );
}

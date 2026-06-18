import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";
import { SELECT_CLASS, parseCronScheduleKind, parseCronSessionTarget, parseCronWakeMode } from "./OperationsPage.shared";
import type { CronJobForm } from "./ops-store";

type CronAddFormProps = {
  readonly form: CronJobForm;
  readonly mutating: boolean;
  readonly canRequest: boolean;
  readonly onField: <K extends keyof CronJobForm>(key: K, value: CronJobForm[K]) => void;
  readonly onSubmit: () => void;
};

export function CronAddForm({ form, mutating, canRequest, onField, onSubmit }: CronAddFormProps) {
  return (
    <div className="space-y-2.5 rounded-md border border-border bg-background/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Plus size={13} className="shrink-0 text-primary" aria-hidden="true" /> 새 예약 작업
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <CronFieldLabel>이름 *</CronFieldLabel>
          <Input value={form.name} placeholder="아침 브리핑" onChange={(event) => onField("name", event.target.value)} />
        </label>
        <label className="block">
          <CronFieldLabel>설명 (선택)</CronFieldLabel>
          <Input value={form.description || ""} placeholder="매일 아침 요약 전송" onChange={(event) => onField("description", event.target.value)} />
        </label>
      </div>
      <ScheduleFields form={form} onField={onField} />
      <DispatchFields form={form} onField={onField} />
      <label className="block">
        <CronFieldLabel>요청 내용</CronFieldLabel>
        <Textarea rows={2} value={form.payloadText || ""} placeholder="오늘의 일정과 할 일을 요약해줘" onChange={(event) => onField("payloadText", event.target.value)} className="text-xs" />
      </label>
      <label className="block">
        <CronFieldLabel>모델 (선택)</CronFieldLabel>
        <Input value={form.payloadModel || ""} placeholder="기본 모델 사용 시 비워둠" onChange={(event) => onField("payloadModel", event.target.value)} className="font-mono text-xs" />
      </label>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={form.enabled !== false} onChange={(event) => onField("enabled", event.target.checked)} />
          생성 즉시 활성화
        </label>
        <Button variant="primary" size="sm" onClick={onSubmit} disabled={!canRequest || mutating || !form.name.trim()}>
          {mutating ? <Spinner size={14} /> : <Plus size={14} aria-hidden="true" />} 생성
        </Button>
      </div>
    </div>
  );
}

function ScheduleFields({ form, onField }: Pick<CronAddFormProps, "form" | "onField">) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="block">
        <CronFieldLabel>스케줄</CronFieldLabel>
        <select className={cn(SELECT_CLASS, "w-full")} value={form.scheduleKind} onChange={(event) => onField("scheduleKind", parseCronScheduleKind(event.target.value))}>
          <option value="cron">매일 지정 시각</option>
          <option value="every">반복 간격</option>
          <option value="at">특정 일시 (1회)</option>
        </select>
      </label>
      {form.scheduleKind === "cron" ? (
        <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-1.5">
          <label className="block">
            <CronFieldLabel>시</CronFieldLabel>
            <Input type="number" min={0} max={23} value={form.scheduleHour ?? 8} onChange={(event) => onField("scheduleHour", Number(event.target.value))} />
          </label>
          <label className="block">
            <CronFieldLabel>분</CronFieldLabel>
            <Input type="number" min={0} max={59} value={form.scheduleMinute ?? 0} onChange={(event) => onField("scheduleMinute", Number(event.target.value))} />
          </label>
          <label className="block">
            <CronFieldLabel>시간대 (선택)</CronFieldLabel>
            <Input value={form.scheduleTz || ""} placeholder="Asia/Seoul" onChange={(event) => onField("scheduleTz", event.target.value)} />
          </label>
        </div>
      ) : null}
      {form.scheduleKind === "every" ? (
        <label className="block">
          <CronFieldLabel>반복 간격 (초)</CronFieldLabel>
          <Input type="number" min={1} value={form.scheduleEverySeconds ?? 3600} onChange={(event) => onField("scheduleEverySeconds", Number(event.target.value))} />
        </label>
      ) : null}
      {form.scheduleKind === "at" ? (
        <label className="block">
          <CronFieldLabel>실행 일시 (UTC 기준)</CronFieldLabel>
          <Input type="datetime-local" value={form.scheduleAt || ""} onChange={(event) => onField("scheduleAt", event.target.value)} />
        </label>
      ) : null}
    </div>
  );
}

function DispatchFields({ form, onField }: Pick<CronAddFormProps, "form" | "onField">) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <label className="block">
        <CronFieldLabel>세션</CronFieldLabel>
        <select className={cn(SELECT_CLASS, "w-full")} value={form.sessionTarget || "main"} onChange={(event) => onField("sessionTarget", parseCronSessionTarget(event.target.value))}>
          <option value="main">기본 세션</option>
          <option value="isolated">분리 세션</option>
        </select>
      </label>
      <label className="block">
        <CronFieldLabel>깨우기</CronFieldLabel>
        <select className={cn(SELECT_CLASS, "w-full")} value={form.wakeMode || "next-heartbeat"} onChange={(event) => onField("wakeMode", parseCronWakeMode(event.target.value))}>
          <option value="next-heartbeat">다음 신호</option>
          <option value="now">즉시</option>
        </select>
      </label>
      <label className="block">
        <CronFieldLabel>작업 종류</CronFieldLabel>
        <select className={cn(SELECT_CLASS, "w-full")} value={form.payloadKind || "chat"} onChange={(event) => onField("payloadKind", event.target.value)}>
          <option value="chat">채팅</option>
          <option value="coding">코딩</option>
        </select>
      </label>
    </div>
  );
}

function CronFieldLabel({ children }: { readonly children: ReactNode }) {
  return <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{children}</span>;
}

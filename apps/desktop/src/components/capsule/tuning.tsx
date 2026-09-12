import { ExpandChoice, ExpandDivider } from "./capsule";
import { REASONING_LEVEL_LABEL, resolveCapability, webSearchRouteLabel, type ReasoningLevel } from "../../features/ask/model-registry";

export type ContextBudget = "compact" | "standard" | "full";

export const CONTEXT_BUDGET_LABEL: Record<ContextBudget, string> = {
  compact: "간결",
  standard: "기본",
  full: "넓게"
};

const CONTEXT_CHOICES: { value: ContextBudget; label: string }[] = [
  { value: "compact", label: CONTEXT_BUDGET_LABEL.compact },
  { value: "standard", label: CONTEXT_BUDGET_LABEL.standard },
  { value: "full", label: CONTEXT_BUDGET_LABEL.full }
];

/**
 * 작성칸 위 아이콘 줄에 들어가는 추론 강도·컨텍스트 선택.
 * 추론 강도는 고른 모델이 실제로 지원할 때만 나온다(모델별 허용 단계도 레지스트리에서 읽는다).
 */
export function TuningChoices({
  provider,
  model,
  reasoning,
  context,
  openId,
  disabled = false,
  webSearch = false,
  onToggle,
  onReasoning,
  onContext
}: {
  provider: string;
  model: string | null;
  reasoning: ReasoningLevel | "auto";
  context: ContextBudget;
  openId: "reasoning" | "context" | null;
  disabled?: boolean;
  webSearch?: boolean;
  onToggle: (id: "reasoning" | "context") => void;
  onReasoning: (value: ReasoningLevel) => void;
  onContext: (value: ContextBudget) => void;
}) {
  const capability = resolveCapability(provider, model);
  const levels = capability.levels;
  const activeLevel = reasoning === "auto" ? capability.defaultLevel : reasoning;
  const reasoningLabel =
    capability.reasoningControl && activeLevel ? `추론 ${REASONING_LEVEL_LABEL[activeLevel as ReasoningLevel]}` : "";

  return (
    <>
      {capability.reasoningControl ? (
        <>
          <ExpandDivider />
          <ExpandChoice
            label={reasoningLabel}
            title="추론 강도"
            open={openId === "reasoning"}
            disabled={disabled}
            options={levels
              .filter((level) => level !== activeLevel)
              .map((level) => ({ value: level, label: REASONING_LEVEL_LABEL[level] }))}
            onToggle={() => onToggle("reasoning")}
            onSelect={(value) => onReasoning(value as ReasoningLevel)}
          />
        </>
      ) : null}
      <ExpandDivider />
      <ExpandChoice
        label={`컨텍스트 ${CONTEXT_BUDGET_LABEL[context]}`}
        title="컨텍스트 예산"
        open={openId === "context"}
        disabled={disabled}
        options={CONTEXT_CHOICES.filter((choice) => choice.value !== context)}
        onToggle={() => onToggle("context")}
        onSelect={(value) => onContext(value as ContextBudget)}
      />
      {webSearch ? (
        <>
          <ExpandDivider />
          <span
            title={webSearchRouteLabel(capability)}
            className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-none text-muted-foreground/80"
          >
            {capability.nativeWebSearch ? "웹 검색 내장" : "웹 검색 보조"}
          </span>
        </>
      ) : null}
    </>
  );
}

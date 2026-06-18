import { Save, Trash2 } from "lucide-react";
import { Button, Textarea } from "../../components/ui/primitives";
import { useUserRulesBridge, useUserRulesStore } from "./settings-user-rules-store";

/**
 * 사용자 전역 규칙/페르소나 (P1-2) — 모든 질문 답변에 상시 주입되는 짧은 지침.
 * 스킬(작업방식 단발 적용)과 구분: 규칙은 항상 적용된다. 주입 캡 600자(저장 4,000자).
 */
export function SettingsUserRulesPanel({ canRequest }: { canRequest: boolean }) {
  useUserRulesBridge(canRequest);
  const store = useUserRulesStore();
  const dirty = store.text !== store.savedText;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        모든 답변에 항상 적용되는 지침입니다. 예: "답변은 반말로", "코드 예시는 TypeScript 우선",
        "불릿 3개 이하로 짧게". 앞 600자가 프롬프트에 주입됩니다.
      </p>
      <Textarea
        rows={6}
        value={store.text}
        placeholder={"예)\n- 답변은 짧고 직설적으로\n- 표보다 불릿을 선호\n- 내 이름은 하빈"}
        disabled={!canRequest || store.loading}
        onChange={(event) => store.setText(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={store.save} disabled={!canRequest || store.pending || !dirty}>
          <Save size={14} aria-hidden="true" /> 저장
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10"
          onClick={store.remove}
          disabled={!canRequest || store.pending || !store.exists}
        >
          <Trash2 size={14} aria-hidden="true" /> 삭제
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {store.loading ? "불러오는 중…" : store.message || (store.exists ? `저장됨 · ${store.text.length.toLocaleString()}자` : "저장된 규칙 없음")}
        </span>
      </div>
    </div>
  );
}

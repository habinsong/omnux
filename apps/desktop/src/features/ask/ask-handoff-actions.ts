import { requestDesktopExplore } from "../middleware/desktop-message-gateway";
import { saveAskNotebookReply } from "./ask-notebook-save";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import type { AskState, AskSet } from "./ask-types";
import { buildPlanObjectiveFromMessage } from "./ask-session-helpers";

export function createAskHandoffActions(set: AskSet, get: () => AskState): Pick<AskState, "saveInputAsRoutine" | "createPlanFromInput" | "runActionSuggestion" | "saveMessageToNotebook" | "createPlanFromMessage"> {
  const navigate = (page: "planning" | "automate", input: string) => {
    if (!input.trim()) return;
    useDesktopNavigationStore.getState().setActivePage(page, { input, create: true });
  };
  return {
    saveInputAsRoutine: () => navigate("automate", get().input.trim()),
    createPlanFromInput: () => navigate("planning", get().input.trim()),
    runActionSuggestion: suggestion => {
      if (suggestion.kind === "plan") navigate("planning", suggestion.prompt);
      else if (suggestion.kind === "routine") {
        useDesktopNavigationStore.getState().setActivePage("automate", {
          input: suggestion.prompt, create: true,
          scheduleKind: suggestion.scheduleKind, scheduleTime: suggestion.scheduleTime,
          scheduleWeekdays: suggestion.scheduleWeekdays, scheduleDayOfMonth: suggestion.scheduleDayOfMonth
        });
      } else if (!requestDesktopExplore.sessionsSpawn(suggestion.prompt)) {
        set({ lastError: "에이전트 실행 요청을 보내지 못했습니다." });
      }
    },
    saveMessageToNotebook: (index, text, meta = "") => saveAskNotebookReply(index, text, meta, get().activeConversationId),
    createPlanFromMessage: (index, text, meta = "") => navigate("planning", buildPlanObjectiveFromMessage(index, text, meta))
  };
}

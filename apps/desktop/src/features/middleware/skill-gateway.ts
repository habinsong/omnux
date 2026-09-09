import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// 커스텀 스킬 엔진 (backend_hidden_features #5, 정적 대시보드 skills 흐름).
registerDesktopRequestTypes("skills_list", "skill_get", "skill_save", "skill_delete", "skill_active_clear");

export type SkillScope = "project" | "global";

export interface SkillSaveInput {
  name: string;
  scope: SkillScope;
  description: string;
  body: string;
  allowOverwrite?: boolean;
}

export const requestDesktopSkill = {
  list(requestId?: string) {
    return sendDesktopRequest({ type: "skills_list", requestId });
  },
  get(name: string, scope: SkillScope, requestId?: string) {
    return sendDesktopRequest({ type: "skill_get", skillName: name, skillScope: scope, requestId });
  },
  save(input: SkillSaveInput, requestId?: string) {
    return sendDesktopRequest({
      type: "skill_save",
      requestId,
      skillName: input.name.trim(),
      skillScope: input.scope,
      skillDescription: input.description,
      skillBody: input.body,
      skillAllowOverwrite: !!input.allowOverwrite
    });
  },
  remove(name: string, scope: SkillScope, requestId?: string) {
    return sendDesktopRequest({ type: "skill_delete", skillName: name, skillScope: scope, requestId });
  },
  clearActive(conversationId: string) {
    return sendDesktopRequest({ type: "skill_active_clear", conversationId: conversationId.trim() });
  }
};

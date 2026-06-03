import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// 커스텀 스킬 엔진 (backend_hidden_features #5, 옛 omninode-dashboard skills).
registerDesktopRequestTypes("skills_list", "skill_get", "skill_save", "skill_delete");

export type SkillScope = "project" | "global";

export interface SkillSaveInput {
  name: string;
  scope: SkillScope;
  description: string;
  body: string;
  allowOverwrite?: boolean;
}

export const requestDesktopSkill = {
  list() {
    return sendDesktopRequest({ type: "skills_list" });
  },
  get(name: string, scope: SkillScope) {
    return sendDesktopRequest({ type: "skill_get", skillName: name, skillScope: scope });
  },
  save(input: SkillSaveInput) {
    return sendDesktopRequest({
      type: "skill_save",
      skillName: input.name.trim(),
      skillScope: input.scope,
      skillDescription: input.description,
      skillBody: input.body,
      skillAllowOverwrite: !!input.allowOverwrite
    });
  },
  remove(name: string, scope: SkillScope) {
    return sendDesktopRequest({ type: "skill_delete", skillName: name, skillScope: scope });
  }
};

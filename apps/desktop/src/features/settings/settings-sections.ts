/**
 * 다른 화면이 "설정의 이 항목" 으로 보낼 때 쓰는 이름표.
 * 화면 파일에서 떼어 둔다. 이름표를 늘려도 화면 코드는 손대지 않는다.
 * 예전 항목 키도 그대로 받는다. 저장해 둔 링크가 깨지지 않게 한다.
 */
export const SETTINGS_ALIASES: Record<string, string> = {
  // 일반
  appearance: "general-preferences",
  theme: "general-preferences",
  detail: "general-preferences",
  startup: "general-startup",
  "start-on-launch": "general-startup",
  launch: "general-startup",
  shortcuts: "general-shortcuts",
  shortcut: "general-shortcuts",
  hotkeys: "general-shortcuts",
  keyboard: "general-shortcuts",
  speech: "general-speech",
  tts: "general-speech",
  voice: "general-speech",
  "default-project": "general-default-project",
  project: "general-default-project",
  rules: "general-user-rules",
  "user-rules": "general-user-rules",

  // 모델
  models: "models-select",
  "model-select": "models-select",
  cerebras: "models-select",
  "models-cerebras": "models-select",
  keys: "models-keys",
  "api-keys": "models-keys",
  cli: "models-cli",
  priority: "models-priority",
  "model-priority": "models-priority",
  "models-priority": "models-priority",
  usage: "models-usage",

  // 보안
  otp: "security-otp",
  auth: "security-otp",
  totp: "security-otp",
  "general-otp": "security-otp",
  external: "security-external",
  lan: "security-external",
  "int-external": "security-external",
  permissions: "security-permissions",
  permission: "security-permissions",
  policy: "security-permissions",
  "general-permissions": "security-permissions",

  // 연동
  telegram: "int-telegram",
  sync: "int-sync",
  gist: "int-sync",
  "memory-sync": "int-sync",

  // 데이터
  memory: "data-notes",
  "memory-notes": "data-notes",
  notes: "data-notes",
  backup: "data-backup",
  "memory-backup": "data-backup",

  // 정보
  status: "about-status",
  "general-status": "about-status",
  about: "about-app"
};

import { create } from "zustand";

export type ThemeMode = "glass" | "light" | "dark";
export type DetailLevel = "simple" | "advanced";
export type ModelProviderId = "groq" | "gemini" | "cerebras" | "nvidia" | "copilot" | "codex";
export type ShortcutAction =
  | "palette"
  | "paletteAlt"
  | "send"
  | "focusComposer"
  | "newConversation"
  | "searchConversations"
  | "toggleTheme"
  | "toggleAutoSpeak"
  | "stopSpeaking"
  | "pageHome"
  | "pageAsk"
  | "pageBuild"
  | "pageAutomate"
  | "pageActivity"
  | "pageNotebooks"
  | "pageSettings"
  | "pageOperations";

export type ShortcutPreferences = Record<ShortcutAction, string>;

export type ShortcutDefinition = {
  action: ShortcutAction;
  group: string;
  label: string;
  description: string;
};

type PreferenceState = {
  theme: ThemeMode;
  detailLevel: DetailLevel;
  startOnLaunchPreference: boolean;
  modelProviderPriority: ModelProviderId[];
  shortcuts: ShortcutPreferences;
  setTheme: (theme: ThemeMode) => void;
  cycleTheme: () => void;
  setDetailLevel: (detailLevel: DetailLevel) => void;
  setStartOnLaunchPreference: (enabled: boolean) => void;
  setModelProviderPriority: (priority: ModelProviderId[]) => void;
  moveModelProvider: (provider: ModelProviderId, targetProvider: ModelProviderId) => void;
  resetModelProviderPriority: () => void;
  setShortcut: (action: ShortcutAction, shortcut: string) => void;
  resetShortcut: (action: ShortcutAction) => void;
  resetShortcuts: () => void;
};

export const THEME_ORDER: ThemeMode[] = ["glass", "light", "dark"];
export const THEME_LABEL: Record<ThemeMode, string> = { glass: "글래스", light: "라이트", dark: "다크" };
export const DETAIL_LABEL: Record<DetailLevel, string> = { simple: "간단히", advanced: "고급" };
export const MODEL_PROVIDER_ORDER: ModelProviderId[] = ["groq", "gemini", "codex", "copilot", "cerebras", "nvidia"];
export const MODEL_PROVIDER_LABEL: Record<ModelProviderId, string> = {
  groq: "Groq",
  gemini: "Gemini",
  cerebras: "Cerebras",
  nvidia: "NVIDIA NIM",
  copilot: "Copilot",
  codex: "Codex"
};
export const MODEL_PROVIDER_KIND: Record<ModelProviderId, "API" | "CLI"> = {
  groq: "API",
  gemini: "API",
  cerebras: "API",
  nvidia: "API",
  copilot: "CLI",
  codex: "CLI"
};
export const DEFAULT_SHORTCUTS: ShortcutPreferences = {
  palette: "mod+k",
  paletteAlt: "mod+p",
  send: "mod+enter",
  focusComposer: "mod+/",
  newConversation: "mod+n",
  searchConversations: "mod+shift+f",
  toggleTheme: "mod+shift+l",
  toggleAutoSpeak: "mod+shift+a",
  stopSpeaking: "mod+shift+s",
  pageHome: "mod+1",
  pageAsk: "mod+2",
  pageBuild: "mod+3",
  pageAutomate: "mod+4",
  pageActivity: "mod+5",
  pageNotebooks: "mod+6",
  pageSettings: "mod+,",
  pageOperations: "mod+."
};

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { action: "palette", group: "전역", label: "명령 팔레트", description: "팔레트를 열거나 닫습니다." },
  { action: "paletteAlt", group: "전역", label: "명령 팔레트 보조", description: "대체 팔레트 단축키입니다." },
  { action: "toggleTheme", group: "전역", label: "테마 순환", description: "글래스·라이트·다크를 순환합니다." },
  { action: "toggleAutoSpeak", group: "음성", label: "자동 읽기 전환", description: "Ask/Build 응답 자동 읽기를 켜거나 끕니다." },
  { action: "stopSpeaking", group: "음성", label: "읽기 중지", description: "현재 재생 중인 TTS를 멈춥니다." },
  { action: "send", group: "작성", label: "작성 내용 전송", description: "Ask/Build 작성창의 현재 내용을 전송합니다." },
  { action: "focusComposer", group: "작성", label: "작성창 포커스", description: "현재 Ask/Build 작성창으로 커서를 옮깁니다." },
  { action: "newConversation", group: "작성", label: "새 대화/작업", description: "현재 Ask/Build 화면에서 새 항목을 만듭니다." },
  { action: "searchConversations", group: "작성", label: "보관함 검색", description: "현재 Ask/Build 보관함 검색 입력으로 이동합니다." },
  { action: "pageHome", group: "페이지", label: "홈", description: "홈 화면으로 이동합니다." },
  { action: "pageAsk", group: "페이지", label: "질문", description: "Ask 화면으로 이동합니다." },
  { action: "pageBuild", group: "페이지", label: "빌드", description: "Build 화면으로 이동합니다." },
  { action: "pageAutomate", group: "페이지", label: "자동화", description: "Automate 화면으로 이동합니다." },
  { action: "pageActivity", group: "페이지", label: "활동", description: "Activity 화면으로 이동합니다." },
  { action: "pageNotebooks", group: "페이지", label: "노트북", description: "Notebook 화면으로 이동합니다." },
  { action: "pageSettings", group: "페이지", label: "설정", description: "Settings 화면으로 이동합니다." },
  { action: "pageOperations", group: "페이지", label: "운영", description: "Operations 화면으로 이동합니다." }
];

const THEME_STORAGE_KEY = "omnux-theme";
const DETAIL_STORAGE_KEY = "omnux-detail-level";
const START_ON_LAUNCH_STORAGE_KEY = "omnux-start-on-launch-preference";
const MODEL_PRIORITY_STORAGE_KEY = "omnux-model-provider-priority-v1";
const SHORTCUT_STORAGE_KEY = "omnux-desktop-shortcuts-v1";
const MODIFIER_KEYS = new Set(["control", "ctrl", "shift", "alt", "option", "meta", "cmd", "command", "mod"]);
const KEY_LABELS: Record<string, string> = {
  enter: "Enter",
  escape: "Esc",
  " ": "Space",
  space: "Space",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Del",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  ",": ",",
  ".": ".",
  "/": "/"
};

function normalizeTheme(value: string | null): ThemeMode {
  return value === "light" || value === "dark" || value === "glass" ? value : "glass";
}

function normalizeDetail(value: string | null): DetailLevel {
  return value === "advanced" ? "advanced" : "simple";
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "glass";
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "glass";
  }
}

function readStoredDetail(): DetailLevel {
  if (typeof window === "undefined") return "simple";
  try {
    return normalizeDetail(window.localStorage.getItem(DETAIL_STORAGE_KEY));
  } catch {
    return "simple";
  }
}

function readStoredStartOnLaunchPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(START_ON_LAUNCH_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function normalizeModelProviderPriority(value: unknown): ModelProviderId[] {
  const seen = new Set<ModelProviderId>();
  const raw = Array.isArray(value) ? value : [];
  const next: ModelProviderId[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (!MODEL_PROVIDER_ORDER.includes(item as ModelProviderId)) continue;
    const provider = item as ModelProviderId;
    if (seen.has(provider)) continue;
    seen.add(provider);
    next.push(provider);
  }
  for (const provider of MODEL_PROVIDER_ORDER) {
    if (!seen.has(provider)) next.push(provider);
  }
  return next;
}

function readStoredModelProviderPriority(): ModelProviderId[] {
  if (typeof window === "undefined") return MODEL_PROVIDER_ORDER;
  try {
    const raw = window.localStorage.getItem(MODEL_PRIORITY_STORAGE_KEY);
    return normalizeModelProviderPriority(raw ? JSON.parse(raw) : MODEL_PROVIDER_ORDER);
  } catch {
    return MODEL_PROVIDER_ORDER;
  }
}

function isMacOs(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || "");
}

export function normalizeShortcut(value: string): string {
  const rawParts = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/⌘/g, " mod ")
    .replace(/⌃/g, " ctrl ")
    .replace(/⌥/g, " alt ")
    .replace(/⇧/g, " shift ")
    .split(/[\s+]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers: string[] = [];
  let key = "";
  for (const raw of rawParts) {
    const part =
      raw === "command" || raw === "cmd" || raw === "meta" ? "mod" :
      raw === "control" ? "ctrl" :
      raw === "option" ? "alt" :
      raw === "esc" ? "escape" :
      raw === "spacebar" ? "space" :
      raw;
    if (part === "mod" || part === "ctrl" || part === "alt" || part === "shift") {
      if (!modifiers.includes(part)) modifiers.push(part);
    } else {
      key = part === " " ? "space" : part;
    }
  }
  if (!key || MODIFIER_KEYS.has(key)) return "";
  const ordered = ["mod", "ctrl", "alt", "shift"].filter((modifier) => modifiers.includes(modifier));
  return [...ordered, key].join("+");
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): string {
  const key = String(event.key || "").toLowerCase();
  if (!key || MODIFIER_KEYS.has(key)) return "";
  const isMac = isMacOs();
  const parts: string[] = [];
  if (event.metaKey) parts.push(isMac ? "mod" : "cmd");
  if (event.ctrlKey && !(isMac && event.metaKey)) parts.push(isMac ? "ctrl" : "mod");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(key === " " ? "space" : key === "esc" ? "escape" : key);
  return normalizeShortcut(parts.join("+"));
}

export function shortcutMatches(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, shortcut: string): boolean {
  const normalized = normalizeShortcut(shortcut);
  return Boolean(normalized) && shortcutFromEvent(event) === normalized;
}

export function shortcutDisplay(value: string): string {
  const normalized = normalizeShortcut(value);
  if (!normalized) return "미지정";
  const isMac = isMacOs();
  return normalized
    .split("+")
    .map((part) => {
      if (part === "mod") return isMac ? "⌘" : "Ctrl";
      if (part === "ctrl") return isMac ? "⌃" : "Ctrl";
      if (part === "alt") return isMac ? "⌥" : "Alt";
      if (part === "shift") return isMac ? "⇧" : "Shift";
      if (KEY_LABELS[part]) return KEY_LABELS[part];
      return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(isMac ? "" : "+");
}

function readStoredShortcuts(): ShortcutPreferences {
  if (typeof window === "undefined") return DEFAULT_SHORTCUTS;
  try {
    const raw = window.localStorage.getItem(SHORTCUT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<Record<ShortcutAction, string>> : {};
    return SHORTCUT_DEFINITIONS.reduce<ShortcutPreferences>((acc, definition) => {
      acc[definition.action] = normalizeShortcut(parsed[definition.action] || DEFAULT_SHORTCUTS[definition.action]);
      return acc;
    }, { ...DEFAULT_SHORTCUTS });
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

function saveShortcuts(next: ShortcutPreferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* localStorage 불가 시 화면 상태만 유지한다. */
  }
}

export function applyDesktopTheme(next: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", next === "dark");
  root.classList.toggle("theme-light", next === "light");
}

function saveTheme(next: ThemeMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* localStorage 불가 시 화면 상태만 유지한다. */
  }
}

function saveDetail(next: DetailLevel) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DETAIL_STORAGE_KEY, next);
  } catch {
    /* localStorage 불가 시 화면 상태만 유지한다. */
  }
}

function saveStartOnLaunchPreference(next: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(START_ON_LAUNCH_STORAGE_KEY, String(next));
  } catch {
    /* localStorage 불가 시 화면 상태만 유지한다. */
  }
}

function saveModelProviderPriority(next: ModelProviderId[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODEL_PRIORITY_STORAGE_KEY, JSON.stringify(normalizeModelProviderPriority(next)));
  } catch {
    /* localStorage 불가 시 화면 상태만 유지한다. */
  }
}

export function getPreferredModelProvider(priority?: ModelProviderId[]): ModelProviderId {
  return normalizeModelProviderPriority(priority || readStoredModelProviderPriority())[0] || MODEL_PROVIDER_ORDER[0];
}

export const useDesktopPreferenceStore = create<PreferenceState>((set, get) => ({
  theme: readStoredTheme(),
  detailLevel: readStoredDetail(),
  startOnLaunchPreference: readStoredStartOnLaunchPreference(),
  modelProviderPriority: readStoredModelProviderPriority(),
  shortcuts: readStoredShortcuts(),
  setTheme: (theme) => {
    applyDesktopTheme(theme);
    saveTheme(theme);
    set({ theme });
  },
  cycleTheme: () => {
    const current = get().theme;
    const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
    get().setTheme(next);
  },
  setDetailLevel: (detailLevel) => {
    saveDetail(detailLevel);
    set({ detailLevel });
  },
  setStartOnLaunchPreference: (enabled) => {
    saveStartOnLaunchPreference(enabled);
    set({ startOnLaunchPreference: enabled });
  },
  setModelProviderPriority: (priority) => {
    const next = normalizeModelProviderPriority(priority);
    saveModelProviderPriority(next);
    set({ modelProviderPriority: next });
  },
  moveModelProvider: (provider, targetProvider) => {
    if (provider === targetProvider) return;
    const current = normalizeModelProviderPriority(get().modelProviderPriority);
    const without = current.filter((item) => item !== provider);
    const targetIndex = without.indexOf(targetProvider);
    if (targetIndex < 0) return;
    const next = [...without.slice(0, targetIndex), provider, ...without.slice(targetIndex)];
    get().setModelProviderPriority(next);
  },
  resetModelProviderPriority: () => {
    saveModelProviderPriority(MODEL_PROVIDER_ORDER);
    set({ modelProviderPriority: MODEL_PROVIDER_ORDER });
  },
  setShortcut: (action, shortcut) => {
    const normalized = normalizeShortcut(shortcut);
    const next = { ...get().shortcuts, [action]: normalized };
    saveShortcuts(next);
    set({ shortcuts: next });
  },
  resetShortcut: (action) => {
    const next = { ...get().shortcuts, [action]: DEFAULT_SHORTCUTS[action] };
    saveShortcuts(next);
    set({ shortcuts: next });
  },
  resetShortcuts: () => {
    saveShortcuts(DEFAULT_SHORTCUTS);
    set({ shortcuts: DEFAULT_SHORTCUTS });
  }
}));

import { create } from "zustand";

// 브라우저 SpeechSynthesis 기반 응답 읽어주기(자동 읽기). 백엔드 불필요한 순수 프런트 기능.
export type SpeechRecognitionResultEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

export type SpeechRecognitionErrorEventLike = {
  error?: string;
};

export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export type SpeechPreferences = {
  autoSpeak: boolean;
  lang: string;
  voiceURI: string;
  rate: number;
  pitch: number;
  volume: number;
  stripMarkdown: boolean;
};

type SpeechState = {
  autoSpeak: boolean;
  speakingKey: string | null;
  preferences: SpeechPreferences;
  voices: SpeechSynthesisVoice[];
  setAutoSpeak: (enabled: boolean) => void;
  toggleAutoSpeak: () => void;
  updatePreferences: (patch: Partial<SpeechPreferences>) => void;
  resetPreferences: () => void;
  refreshVoices: () => void;
  speak: (key: string, text: string) => void;
  toggle: (key: string, text: string) => void;
  stop: () => void;
};

const SPEECH_STORAGE_KEY = "omnux-desktop-speech-v1";

export const DEFAULT_SPEECH_PREFERENCES: SpeechPreferences = {
  autoSpeak: false,
  lang: "ko-KR",
  voiceURI: "",
  rate: 1,
  pitch: 1,
  volume: 1,
  stripMarkdown: true
};

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

export const isSpeechSupported = (): boolean => synth() !== null;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeSpeechPreferences(value: unknown): SpeechPreferences {
  const source = value && typeof value === "object" ? (value as Partial<SpeechPreferences>) : {};
  return {
    autoSpeak: source.autoSpeak === true,
    lang: typeof source.lang === "string" && source.lang.trim() ? source.lang : DEFAULT_SPEECH_PREFERENCES.lang,
    voiceURI: typeof source.voiceURI === "string" ? source.voiceURI : "",
    rate: clampNumber(source.rate, 0.5, 2, DEFAULT_SPEECH_PREFERENCES.rate),
    pitch: clampNumber(source.pitch, 0.5, 2, DEFAULT_SPEECH_PREFERENCES.pitch),
    volume: clampNumber(source.volume, 0, 1, DEFAULT_SPEECH_PREFERENCES.volume),
    stripMarkdown: source.stripMarkdown !== false
  };
}

function readSpeechPreferences(): SpeechPreferences {
  if (typeof window === "undefined") return DEFAULT_SPEECH_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(SPEECH_STORAGE_KEY);
    return raw ? normalizeSpeechPreferences(JSON.parse(raw)) : DEFAULT_SPEECH_PREFERENCES;
  } catch {
    return DEFAULT_SPEECH_PREFERENCES;
  }
}

function saveSpeechPreferences(preferences: SpeechPreferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPEECH_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* localStorage 불가 시 현재 세션 상태만 유지한다. */
  }
}

function listSpeechVoices(): SpeechSynthesisVoice[] {
  const speech = synth();
  if (!speech) return [];
  try {
    return speech.getVoices() || [];
  } catch {
    return [];
  }
}

export function sanitizeForSpeech(text: string, stripMarkdown = true): string {
  let cleaned = String(text || "");
  if (!cleaned) return "";
  if (stripMarkdown) {
    cleaned = cleaned.replace(/```[\s\S]*?```/g, " ");
    cleaned = cleaned.replace(/`([^`]+)`/g, "$1");
    cleaned = cleaned.replace(/^\s{0,3}#+\s+/gm, "");
    cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, "");
    cleaned = cleaned.replace(/^\s*>\s+/gm, "");
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");
    cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1");
    cleaned = cleaned.replace(/__([^_]+)__/g, "$1");
    cleaned = cleaned.replace(/_([^_]+)_/g, "$1");
    cleaned = cleaned.replace(/~~([^~]+)~~/g, "$1");
    cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, " ");
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    cleaned = cleaned.replace(/https?:\/\/\S+/g, " ");
  }
  return cleaned.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
}

export function isSpeechInputSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function extractSpeechTranscript(event: SpeechRecognitionResultEventLike): string {
  const chunks: string[] = [];
  for (let i = 0; i < event.results.length; i += 1) {
    const result = event.results[i];
    if (result?.[0]?.transcript) chunks.push(result[0].transcript);
  }
  return chunks.join(" ").trim();
}

export function getSpeechInputErrorMessage(errorName: string): string {
  const normalized = errorName.toLowerCase();
  if (normalized === "not-allowed" || normalized === "permissiondenied") {
    return "마이크 권한이 차단되었습니다. 브라우저 권한을 허용하세요.";
  }
  if (normalized === "notreadableerror" || normalized === "trackstarterror") {
    return "마이크를 다른 앱에서 사용 중이거나 접근할 수 없습니다.";
  }
  if (normalized === "network") {
    return "음성 인식 서비스에 연결하지 못했습니다.";
  }
  if (normalized === "no-speech" || normalized === "aborted" || normalized === "aborterror") {
    return "입력된 음성이 없습니다. 다시 눌러 말하세요.";
  }
  if (normalized === "invalid-state" || normalized === "invalidstateerror") {
    return "이미 음성 입력이 실행 중입니다.";
  }
  return "음성 입력을 시작하지 못했습니다.";
}

const initialPreferences = readSpeechPreferences();

export const useSpeechStore = create<SpeechState>((set, get) => ({
  autoSpeak: initialPreferences.autoSpeak,
  speakingKey: null,
  preferences: initialPreferences,
  voices: [],
  setAutoSpeak: (enabled) => get().updatePreferences({ autoSpeak: enabled }),
  toggleAutoSpeak: () => get().updatePreferences({ autoSpeak: !get().preferences.autoSpeak }),
  updatePreferences: (patch) => {
    const next = normalizeSpeechPreferences({ ...get().preferences, ...patch });
    saveSpeechPreferences(next);
    set({ preferences: next, autoSpeak: next.autoSpeak });
  },
  resetPreferences: () => {
    saveSpeechPreferences(DEFAULT_SPEECH_PREFERENCES);
    set({ preferences: DEFAULT_SPEECH_PREFERENCES, autoSpeak: DEFAULT_SPEECH_PREFERENCES.autoSpeak });
  },
  refreshVoices: () => set({ voices: listSpeechVoices() }),
  speak: (key, text) => {
    const speech = synth();
    const preferences = get().preferences;
    const body = sanitizeForSpeech(text, preferences.stripMarkdown);
    if (!speech || !body) return;
    speech.cancel();
    const utterance = new SpeechSynthesisUtterance(body);
    utterance.lang = preferences.lang || (/[가-힣]/.test(body) ? "ko-KR" : "en-US");
    utterance.rate = clampNumber(preferences.rate, 0.5, 2, DEFAULT_SPEECH_PREFERENCES.rate);
    utterance.pitch = clampNumber(preferences.pitch, 0.5, 2, DEFAULT_SPEECH_PREFERENCES.pitch);
    utterance.volume = clampNumber(preferences.volume, 0, 1, DEFAULT_SPEECH_PREFERENCES.volume);
    if (preferences.voiceURI) {
      const voice = listSpeechVoices().find((item) => item.voiceURI === preferences.voiceURI);
      if (voice) {
        utterance.voice = voice;
        if (voice.lang) utterance.lang = voice.lang;
      }
    }
    utterance.onend = () => {
      if (useSpeechStore.getState().speakingKey === key) set({ speakingKey: null });
    };
    utterance.onerror = () => {
      if (useSpeechStore.getState().speakingKey === key) set({ speakingKey: null });
    };
    set({ speakingKey: key });
    speech.speak(utterance);
  },
  toggle: (key, text) => {
    if (get().speakingKey === key) {
      synth()?.cancel();
      set({ speakingKey: null });
      return;
    }
    get().speak(key, text);
  },
  stop: () => {
    synth()?.cancel();
    set({ speakingKey: null });
  }
}));

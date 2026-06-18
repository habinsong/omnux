import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowUp, Check, Cloud, Cpu, Database, Download, Eye, FolderGit2, GripVertical, HardDrive, Info, Keyboard, KeyRound, Moon, Play, Power, RefreshCw, RotateCcw, Search, Settings2, Share2, ShieldCheck, Sparkles, Star, Sun, Trash2, Upload, UploadCloud, Volume2, VolumeX } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import type { ShellCard } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useSettingsPageBridge, useSettingsStore } from "./settings-store";
import type { MemorySearchResultItem } from "./settings-memory";
import { CliAuthCard, LlmKeysCard, LlmModelSelectCard, LlmUsageCard, useLlmSettingsLoad } from "./LlmModelsPanel";
import { Badge, Button, Input, cn } from "../../components/ui/primitives";
import { SettingsTelegramPanel } from "./SettingsTelegramPanel";
import { SettingsOtpPanel } from "./SettingsOtpPanel";
import { SettingsUserRulesPanel } from "./SettingsUserRulesPanel";
import { SettingsExternalAccessPanel } from "./SettingsExternalAccessPanel";
import { useStartOnLaunchStore } from "./start-on-launch-store";
import { useTelegramSettingsBridge, useTelegramSettingsStore } from "./settings-telegram-store";
import { useTotpSettingsBridge } from "./settings-totp-store";
import { useProviderCredentialsBridge } from "./settings-provider-credentials-store";
import { useExternalAccessBridge } from "./settings-external-store";
import {
  DEFAULT_SHORTCUTS,
  DETAIL_LABEL,
  MODEL_PROVIDER_KIND,
  MODEL_PROVIDER_LABEL,
  SHORTCUT_DEFINITIONS,
  THEME_LABEL,
  THEME_ORDER,
  normalizeShortcut,
  shortcutDisplay,
  shortcutFromEvent,
  useDesktopPreferenceStore,
  type DetailLevel,
  type ModelProviderId,
  type ShortcutAction,
  type ThemeMode
} from "../shell/preference-store";
import { useProjectsPageBridge, useProjectsStore } from "../projects/projects-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { PERMISSION_ACTIONS, PERMISSION_DECISIONS, usePermissionPolicyStore, type PermissionDecision } from "../dialog/permission-policy-store";
import { isSpeechSupported, useSpeechStore, type SpeechPreferences } from "../ask/ask-speech";

type CardErrorHandler = (card: ShellCard, message: string, componentStack?: string | null) => void;
type Store = ReturnType<typeof useSettingsStore.getState>;

const BACKUP_SCOPE_LABELS: Record<string, string> = {
  conversations: "대화",
  routines: "루틴",
  "routing-policy": "라우팅 정책",
  "memory-notes": "메모리 노트",
  plans: "계획",
  tasks: "작업 그래프",
  notebooks: "노트북",
  "skills/global": "전역 스킬",
  "commands/global": "전역 명령",
  "skills/project": "프로젝트 스킬",
  "commands/project": "프로젝트 명령"
};

function memoryTierTone(tier: string): "success" | "primary" | "warning" | "outline" {
  if (tier === "working") return "success";
  if (tier === "short_term") return "primary";
  if (tier === "episodic") return "warning";
  return "outline";
}

function formatAccessTime(value: number): string {
  if (!value) return "access -";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "access -";
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function MemorySearchResultRow({ result, canRequest, loading, onOpen }: { result: MemorySearchResultItem; canRequest: boolean; loading: boolean; onOpen: (result: MemorySearchResultItem) => void }) {
  const lineLabel = result.startLine > 0 ? `L${result.startLine}-${result.endLine || result.startLine}` : "";
  const tier = result.memoryTier || "tier -";
  return (
    <article className="rounded-md border border-border bg-card/60 px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium">{result.path}</span>
          <small className="block truncate text-[11px] text-muted-foreground">{result.snippet}</small>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Badge tone="outline">{result.score.toFixed(2)}</Badge>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onOpen(result)} disabled={!canRequest || loading} title="검색 결과 상세 읽기">
            <Eye size={13} aria-hidden="true" /> 열기
          </Button>
        </span>
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
        <Badge
          tone={memoryTierTone(result.memoryTier)}
          title={result.memoryTier === "long_term" ? "오래된 long_term 결과도 score floor 정책으로 유지될 수 있습니다." : undefined}
        >
          {tier}
        </Badge>
        {result.source ? <Badge tone="outline">{result.source}</Badge> : null}
        {lineLabel ? <Badge tone="outline">{lineLabel}</Badge> : null}
        <Badge tone="outline">{formatAccessTime(result.lastAccessedAtUnixMs)}</Badge>
      </div>
    </article>
  );
}

function SetRow({ title, desc, right }: { title: string; desc: string; right: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <b className="block text-sm">{title}</b>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

function StatusCard({ bridgeStatus, authStatus, lastMessage, loading, onError }: { bridgeStatus: string; authStatus: string; lastMessage: string; loading: boolean; onError: CardErrorHandler }) {
  return (
    <CardBoundary title="연결 상태" card="operations" onError={onError}>
      <SetRow title="미들웨어 브릿지" desc="데스크톱 앱이 실제 WebSocket 세션으로 요청을 보낼 수 있는지 표시합니다." right={<Badge tone={bridgeStatus === "connected" ? "success" : "warning"}>{bridgeStatus}</Badge>} />
      <SetRow title="인증 상태" desc="인증되지 않은 상태에서는 백그라운드 요청을 보내지 않습니다." right={<Badge tone={authStatus === "authenticated" ? "success" : "warning"}>{authStatus}</Badge>} />
      <SetRow title="최근 응답" desc={lastMessage || "아직 설정 응답이 없습니다."} right={<Badge tone="default">{loading ? "loading" : "idle"}</Badge>} />
    </CardBoundary>
  );
}

function DesktopPreferencesCard({ onError }: { onError: CardErrorHandler }) {
  const theme = useDesktopPreferenceStore((state) => state.theme);
  const detailLevel = useDesktopPreferenceStore((state) => state.detailLevel);
  const setTheme = useDesktopPreferenceStore((state) => state.setTheme);
  const setDetailLevel = useDesktopPreferenceStore((state) => state.setDetailLevel);
  const themeIcons: Record<ThemeMode, typeof Sparkles> = { glass: Sparkles, light: Sun, dark: Moon };

  return (
    <CardBoundary title="앱 표시" card="navigation" onError={onError}>
      <div className="space-y-2">
        <div className="min-w-0">
          <b className="block text-sm">테마</b>
          <span className="block truncate text-xs text-muted-foreground">상단바와 같은 전역 테마를 저장합니다.</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {THEME_ORDER.map((item) => {
            const Icon = themeIcons[item];
            const on = item === theme;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setTheme(item)}
                className={cn(
                  "flex min-w-0 items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors duration-200 active:scale-[0.98]",
                  on ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon size={14} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{THEME_LABEL[item]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="min-w-0">
          <b className="block text-sm">상세도</b>
          <span className="block truncate text-xs text-muted-foreground">페이지가 지원하는 경우 핵심 보기와 고급 보기를 구분합니다.</span>
        </div>
        <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
          {(["simple", "advanced"] as DetailLevel[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setDetailLevel(item)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                item === detailLevel ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {DETAIL_LABEL[item]}
            </button>
          ))}
        </div>
      </div>
    </CardBoundary>
  );
}

function StartOnLaunchCard({ onError }: { onError: CardErrorHandler }) {
  const launchState = useStartOnLaunchStore((state) => state.state);
  const loading = useStartOnLaunchStore((state) => state.loading);
  const pending = useStartOnLaunchStore((state) => state.pending);
  const lastError = useStartOnLaunchStore((state) => state.lastError);
  const load = useStartOnLaunchStore((state) => state.load);
  const setEnabled = useStartOnLaunchStore((state) => state.setEnabled);
  const preferenceEnabled = useDesktopPreferenceStore((state) => state.startOnLaunchPreference);
  const setPreferenceEnabled = useDesktopPreferenceStore((state) => state.setStartOnLaunchPreference);
  const effectiveEnabled = launchState.supported ? launchState.enabled : preferenceEnabled;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (launchState.supported) {
      setPreferenceEnabled(launchState.enabled);
    }
  }, [launchState.enabled, launchState.supported, setPreferenceEnabled]);

  const toggle = async () => {
    if (!launchState.supported || pending) return;
    const result = await setEnabled(!launchState.enabled);
    if (result?.supported) {
      setPreferenceEnabled(result.enabled);
    }
  };

  return (
    <CardBoundary title="시작 시 실행" card="navigation" onError={onError}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-sm">로그인 시 omnux 열기</b>
          <span className="block truncate text-xs text-muted-foreground">실제 데스크톱 앱에서 OS 자동 시작 항목을 조회하고 설정합니다.</span>
        </div>
        <Badge tone={launchState.supported ? (effectiveEnabled ? "success" : "outline") : "warning"} className="shrink-0">
          {loading ? "조회 중" : launchState.supported ? (effectiveEnabled ? "활성" : "꺼짐") : "미지원"}
        </Badge>
      </div>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!launchState.supported || pending || loading}
        className={cn(
          "flex w-full min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-200 active:scale-[0.98]",
          effectiveEnabled ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground hover:bg-accent hover:text-foreground",
          (!launchState.supported || pending || loading) && "cursor-not-allowed opacity-60"
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{effectiveEnabled ? "자동 시작 켜짐" : "자동 시작 꺼짐"}</span>
          <span className="block truncate text-[11px]">{launchState.message || "상태를 조회하면 설정 위치가 표시됩니다."}</span>
        </span>
        <Power size={16} className="shrink-0" aria-hidden="true" />
      </button>
      {launchState.configuredPath ? (
        <p className="truncate rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">{launchState.configuredPath}</p>
      ) : null}
      {lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{lastError}</p> : null}
    </CardBoundary>
  );
}

function ModelPriorityCard({ onError }: { onError: CardErrorHandler }) {
  const priority = useDesktopPreferenceStore((state) => state.modelProviderPriority);
  const setPriority = useDesktopPreferenceStore((state) => state.setModelProviderPriority);
  const moveModelProvider = useDesktopPreferenceStore((state) => state.moveModelProvider);
  const resetPriority = useDesktopPreferenceStore((state) => state.resetModelProviderPriority);
  const [dragging, setDragging] = useState<ModelProviderId | null>(null);

  const moveBy = (provider: ModelProviderId, delta: -1 | 1) => {
    const index = priority.indexOf(provider);
    const target = priority[index + delta];
    if (!target) return;
    const next = [...priority];
    next.splice(index, 1);
    next.splice(index + delta, 0, provider);
    setPriority(next);
  };

  const dropOn = (target: ModelProviderId) => {
    if (dragging) moveModelProvider(dragging, target);
    setDragging(null);
  };

  return (
    <CardBoundary title="모델 우선순위" card="middleware" onError={onError}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-sm">Provider priority</b>
          <span className="block truncate text-xs text-muted-foreground">드래그해서 앱 전역 기본 모델 선호 순서를 저장합니다.</span>
        </div>
        <Button variant="outline" size="sm" onClick={resetPriority}>
          <RotateCcw size={14} aria-hidden="true" /> 기본값
        </Button>
      </div>
      <div className="space-y-1.5" data-testid="model-priority-list">
        {priority.map((provider, index) => (
          <article
            key={provider}
            draggable
            onDragStart={() => setDragging(provider)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dropOn(provider)}
            className={cn(
              "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border bg-card/60 px-2.5 py-2 transition-colors duration-200",
              dragging === provider ? "border-primary/50 bg-primary/10" : "border-border"
            )}
          >
            <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
              <GripVertical size={15} aria-hidden="true" />
              <span className="w-5 text-right font-mono text-xs tabular-nums">{index + 1}</span>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{MODEL_PROVIDER_LABEL[provider]}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{MODEL_PROVIDER_KIND[provider]} · {provider}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Badge tone={index === 0 ? "primary" : "outline"} className="hidden sm:inline-flex">{index === 0 ? "primary" : MODEL_PROVIDER_KIND[provider]}</Badge>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${MODEL_PROVIDER_LABEL[provider]} 위로`} onClick={() => moveBy(provider, -1)} disabled={index === 0}>
                <ArrowUp size={14} aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${MODEL_PROVIDER_LABEL[provider]} 아래로`} onClick={() => moveBy(provider, 1)} disabled={index === priority.length - 1}>
                <ArrowDown size={14} aria-hidden="true" />
              </Button>
            </span>
          </article>
        ))}
      </div>
      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        세부 intent별 provider chain은 `라우팅 정책` 화면에서 override합니다. 이 순서는 Settings와 빠른 기본 선택에 쓰이는 전역 선호도입니다.
      </p>
    </CardBoundary>
  );
}

function RangeField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="block min-w-0 space-y-1 text-xs font-semibold text-muted-foreground">
      <span className="flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        <span className="shrink-0 font-mono text-[11px] text-foreground">{value.toFixed(step < 1 ? 2 : 0).replace(/\.00$/, "")}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-primary"
      />
    </label>
  );
}

function SpeechSettingsCard({ onError }: { onError: CardErrorHandler }) {
  const preferences = useSpeechStore((state) => state.preferences);
  const voices = useSpeechStore((state) => state.voices);
  const speakingKey = useSpeechStore((state) => state.speakingKey);
  const updatePreferences = useSpeechStore((state) => state.updatePreferences);
  const resetPreferences = useSpeechStore((state) => state.resetPreferences);
  const refreshVoices = useSpeechStore((state) => state.refreshVoices);
  const speak = useSpeechStore((state) => state.speak);
  const stop = useSpeechStore((state) => state.stop);
  const supported = isSpeechSupported();

  useEffect(() => {
    if (!supported) return;
    refreshVoices();
    const speech = window.speechSynthesis;
    const handleVoices = () => refreshVoices();
    speech.addEventListener?.("voiceschanged", handleVoices);
    return () => speech.removeEventListener?.("voiceschanged", handleVoices);
  }, [refreshVoices, supported]);

  const update = <K extends keyof SpeechPreferences>(key: K, value: SpeechPreferences[K]) => {
    updatePreferences({ [key]: value });
  };
  const sampleKey = "settings-tts-sample";
  const sampleSpeaking = speakingKey === sampleKey;

  return (
    <CardBoundary title="음성 출력 (TTS)" card="navigation" onError={onError}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-sm">Ask/Build 응답 읽기</b>
          <span className="block truncate text-xs text-muted-foreground">자동 읽기와 수동 읽기 버튼이 같은 음성 설정을 사용합니다.</span>
        </div>
        <Badge tone={supported ? "success" : "warning"} className="shrink-0">
          {supported ? "speech ready" : "unsupported"}
        </Badge>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <button
          type="button"
          onClick={() => update("autoSpeak", !preferences.autoSpeak)}
          disabled={!supported}
          className={cn(
            "flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-200 active:scale-[0.98]",
            preferences.autoSpeak ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">자동 읽기</span>
            <span className="block truncate text-[11px]">새 assistant 응답을 자동으로 재생</span>
          </span>
          {preferences.autoSpeak ? <Volume2 size={16} className="shrink-0" aria-hidden="true" /> : <VolumeX size={16} className="shrink-0" aria-hidden="true" />}
        </button>
        <label className="block min-w-0 space-y-1 text-xs font-semibold text-muted-foreground">
          언어
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            value={preferences.lang}
            onChange={(event) => update("lang", event.target.value)}
            disabled={!supported}
          >
            <option value="ko-KR">한국어 (ko-KR)</option>
            <option value="en-US">English (en-US)</option>
            <option value="ja-JP">日本語 (ja-JP)</option>
            <option value="zh-CN">中文 (zh-CN)</option>
          </select>
        </label>
      </div>

      <label className="block min-w-0 space-y-1 text-xs font-semibold text-muted-foreground">
        음성
        <select
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          value={preferences.voiceURI}
          onChange={(event) => update("voiceURI", event.target.value)}
          disabled={!supported || voices.length === 0}
        >
          <option value="">시스템 기본 음성</option>
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} · {voice.lang}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        <RangeField label="속도" value={preferences.rate} min={0.5} max={2} step={0.05} onChange={(value) => update("rate", value)} />
        <RangeField label="음높이" value={preferences.pitch} min={0.5} max={2} step={0.05} onChange={(value) => update("pitch", value)} />
        <RangeField label="볼륨" value={preferences.volume} min={0} max={1} step={0.05} onChange={(value) => update("volume", value)} />
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", preferences.stripMarkdown ? "border-primary bg-primary text-primary-foreground" : "border-border-strong")}>
          {preferences.stripMarkdown ? <Check size={11} aria-hidden="true" /> : null}
        </span>
        <input type="checkbox" className="sr-only" checked={preferences.stripMarkdown} onChange={(event) => update("stripMarkdown", event.target.checked)} />
        <span className="min-w-0 truncate">마크다운 기호와 코드 블록을 읽기 전에 정리</span>
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => speak(sampleKey, "omnux 음성 출력 샘플입니다. 자동 읽기와 수동 읽기는 이 설정을 함께 사용합니다.")}
          disabled={!supported}
        >
          <Play size={14} aria-hidden="true" /> 샘플
        </Button>
        <Button variant="outline" size="sm" onClick={stop} disabled={!sampleSpeaking && !speakingKey}>
          <VolumeX size={14} aria-hidden="true" /> 정지
        </Button>
        <Button variant="ghost" size="sm" onClick={resetPreferences}>
          <RotateCcw size={14} aria-hidden="true" /> 기본값
        </Button>
      </div>

      {!supported ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">현재 WebView가 SpeechSynthesis를 제공하지 않아 TTS 재생을 사용할 수 없습니다.</p>
      ) : null}
    </CardBoundary>
  );
}

function ShortcutPreferencesCard({ onError }: { onError: CardErrorHandler }) {
  const shortcuts = useDesktopPreferenceStore((state) => state.shortcuts);
  const setShortcut = useDesktopPreferenceStore((state) => state.setShortcut);
  const resetShortcut = useDesktopPreferenceStore((state) => state.resetShortcut);
  const resetShortcuts = useDesktopPreferenceStore((state) => state.resetShortcuts);
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const next = shortcutFromEvent(event);
      if (!next) return;
      setShortcut(capturing, next);
      setCapturing(null);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [capturing, setShortcut]);

  const conflicts = useMemo(() => {
    const map = new Map<string, ShortcutAction[]>();
    SHORTCUT_DEFINITIONS.forEach((definition) => {
      const shortcut = normalizeShortcut(shortcuts[definition.action]);
      if (!shortcut) return;
      map.set(shortcut, [...(map.get(shortcut) || []), definition.action]);
    });
    return map;
  }, [shortcuts]);
  const groups = useMemo(() => {
    const map = new Map<string, typeof SHORTCUT_DEFINITIONS>();
    SHORTCUT_DEFINITIONS.forEach((definition) => {
      map.set(definition.group, [...(map.get(definition.group) || []), definition]);
    });
    return Array.from(map.entries());
  }, []);

  return (
    <CardBoundary title="단축키" card="navigation" onError={onError}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-sm">사용자 단축키</b>
          <span className="block truncate text-xs text-muted-foreground">팔레트, 페이지 이동, 작성창, TTS 조작을 로컬에 저장합니다.</span>
        </div>
        <Button variant="outline" size="sm" onClick={resetShortcuts}>
          <RotateCcw size={14} aria-hidden="true" /> 전체 기본값
        </Button>
      </div>

      <div className="space-y-3">
        {groups.map(([group, definitions]) => (
          <section key={group} className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Keyboard size={13} aria-hidden="true" /> <span className="truncate">{group}</span>
            </div>
            <div className="space-y-1">
              {definitions.map((definition) => {
                const shortcut = normalizeShortcut(shortcuts[definition.action]);
                const conflict = shortcut && (conflicts.get(shortcut)?.length || 0) > 1;
                const isCapturing = capturing === definition.action;
                const changed = shortcut !== DEFAULT_SHORTCUTS[definition.action];
                return (
                  <article key={definition.action} className={cn("grid gap-2 rounded-md border px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto]", conflict ? "border-warning/40 bg-warning/5" : "border-border bg-muted/20")}>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{definition.label}</span>
                        {conflict ? <Badge tone="warning" className="shrink-0">충돌</Badge> : null}
                        {changed ? <Badge tone="outline" className="shrink-0">custom</Badge> : null}
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{definition.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCapturing(definition.action)}
                        className={cn(
                          "min-w-[92px] rounded-md border px-2.5 py-1.5 text-center font-mono text-xs transition-colors duration-200 active:scale-[0.98]",
                          isCapturing ? "border-primary bg-primary/10 text-primary" : "border-border bg-card/70 text-foreground hover:bg-accent"
                        )}
                      >
                        {isCapturing ? "입력 중..." : shortcutDisplay(shortcut)}
                      </button>
                      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => resetShortcut(definition.action)} disabled={!changed}>
                        복원
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {capturing ? (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">새 단축키 조합을 누르세요. 같은 조합은 충돌로 표시됩니다.</p>
      ) : null}
    </CardBoundary>
  );
}

function permissionTone(decision: PermissionDecision): "success" | "warning" | "destructive" {
  if (decision === "allow") return "success";
  if (decision === "deny") return "destructive";
  return "warning";
}

function formatPermissionTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function GlobalPermissionsCard({ onError }: { onError: CardErrorHandler }) {
  const defaults = usePermissionPolicyStore((state) => state.defaults);
  const grants = usePermissionPolicyStore((state) => state.grants);
  const setDefaultDecision = usePermissionPolicyStore((state) => state.setDefaultDecision);
  const removeGrant = usePermissionPolicyStore((state) => state.removeGrant);
  const clearGrants = usePermissionPolicyStore((state) => state.clearGrants);

  return (
    <CardBoundary title="전역 권한" card="navigation" onError={onError}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-sm">기본 승인 방식</b>
          <span className="block truncate text-xs text-muted-foreground">위험 작업은 기본 Ask로 시작하며, 필요한 범위만 저장합니다.</span>
        </div>
        <Badge tone="outline" className="shrink-0">
          <ShieldCheck size={12} aria-hidden="true" /> saved {grants.length}
        </Badge>
      </div>

      <div className="space-y-2">
        {PERMISSION_ACTIONS.map((item) => (
          <div key={item.action} className="grid gap-2 rounded-md border border-border bg-muted/25 px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{item.label}</span>
                <Badge tone={permissionTone(defaults[item.action])}>{defaults[item.action]}</Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">{item.description}</p>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-background/50 p-0.5">
              {PERMISSION_DECISIONS.map((decision) => {
                const on = defaults[item.action] === decision.decision;
                return (
                  <button
                    key={decision.decision}
                    type="button"
                    onClick={() => setDefaultDecision(item.action, decision.decision)}
                    className={cn(
                      "rounded px-2 py-1 text-xs font-medium transition-colors duration-200 active:scale-[0.98]",
                      on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {decision.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <b className="truncate text-sm">저장된 허용</b>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={clearGrants} disabled={grants.length === 0}>
            모두 해제
          </Button>
        </div>
        {grants.length > 0 ? (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {grants.map((grant) => (
              <div key={grant.key} className="grid gap-2 rounded-md border border-border bg-card/60 px-2.5 py-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge tone="success" className="shrink-0">{grant.action}</Badge>
                    <span className="truncate text-xs font-medium">{grant.label}</span>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{grant.files[0] || grant.commands[0] || grant.key}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{formatPermissionTime(grant.createdAt)}</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => removeGrant(grant.key)}>
                  해제
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">저장된 항상 허용 항목이 없습니다.</p>
        )}
      </div>
    </CardBoundary>
  );
}

function DefaultProjectCard({ canRequest, onError }: { canRequest: boolean; onError: CardErrorHandler }) {
  useProjectsPageBridge();
  const projectStore = useProjectsStore();
  const mainProject = projectStore.projects.find((project) => project.isMain) || null;
  const selectedProject = projectStore.projects.find((project) => project.projectKey === projectStore.selectedProjectKey) || mainProject || projectStore.projects[0] || null;

  useEffect(() => {
    if (canRequest) projectStore.loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  const chooseProject = (projectKey: string) => {
    const project = projectStore.projects.find((item) => item.projectKey === projectKey);
    if (project) projectStore.selectProject(project);
  };

  const makeMain = () => {
    if (!selectedProject) return;
    projectStore.selectProject(selectedProject);
    projectStore.updateSelectedProject(true);
  };

  return (
    <CardBoundary title="기본 프로젝트" card="navigation" onError={onError}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-sm">대표 프로젝트</b>
          <span className="block truncate text-xs text-muted-foreground">홈·Build·Ask에서 기본으로 이어갈 프로젝트를 고릅니다.</span>
        </div>
        <Badge tone={mainProject ? "primary" : "outline"} className="shrink-0">
          <Star size={12} aria-hidden="true" /> {mainProject?.name || "미지정"}
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="block min-w-0 space-y-1 text-xs font-semibold text-muted-foreground">
          프로젝트
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            value={selectedProject?.projectKey || ""}
            onChange={(event) => chooseProject(event.target.value)}
            disabled={!canRequest || projectStore.loading || projectStore.projects.length === 0}
          >
            {projectStore.projects.length === 0 ? <option value="">등록된 프로젝트 없음</option> : null}
            {projectStore.projects.map((project) => (
              <option key={project.projectKey} value={project.projectKey}>{project.isMain ? "★ " : ""}{project.name}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button variant="outline" size="sm" onClick={projectStore.loadProjects} disabled={!canRequest || projectStore.loading}>
            <RefreshCw size={14} aria-hidden="true" /> 조회
          </Button>
          <Button variant="primary" size="sm" onClick={makeMain} disabled={!canRequest || projectStore.pending || !selectedProject || selectedProject.isMain}>
            <FolderGit2 size={14} aria-hidden="true" /> 대표 지정
          </Button>
        </div>
      </div>
      {projectStore.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{projectStore.lastError}</p> : null}
      {selectedProject ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <div className="truncate text-sm font-medium">{selectedProject.name}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">{selectedProject.path || "path -"}</div>
        </div>
      ) : (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Projects에서 로컬 폴더를 먼저 등록하세요.</p>
      )}
    </CardBoundary>
  );
}

function CerebrasCard({ store, canRequest, onError }: { store: Store; canRequest: boolean; onError: CardErrorHandler }) {
  return (
    <CardBoundary title="Cerebras 카탈로그" card="middleware" onError={onError}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-sm">Cerebras</b>
          <span className="block truncate text-xs text-muted-foreground">현재 설정: {store.cerebrasModels.selected || "-"}</span>
        </div>
        <Button variant="outline" size="sm" onClick={store.loadCerebrasModels} disabled={!canRequest || store.loading}>
          {store.loading ? "조회 중..." : "모델 새로고침"}
        </Button>
      </div>
      <div className="space-y-1">
        {store.cerebrasModels.items.map((item) => (
          <article key={item.id} className="flex items-center justify-between rounded-md border border-border bg-card/60 px-2.5 py-2">
            <span className="truncate font-mono text-xs">{item.id}</span>
            <small className="shrink-0 text-[11px] text-muted-foreground">{item.ownedBy || "owned_by -"}</small>
          </article>
        ))}
        {store.cerebrasModels.items.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">조회된 Cerebras 모델이 없습니다.</p> : null}
      </div>
    </CardBoundary>
  );
}

function MemoryNotesCard({ store, canRequest, onError }: { store: Store; canRequest: boolean; onError: CardErrorHandler }) {
  return (
    <CardBoundary title="메모리 노트" card="operations" onError={onError}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">대화에서 생성된 실제 메모리 노트와 검색 결과만 표시합니다.</p>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={store.loadMemoryNotes} disabled={!canRequest || store.loading}>새로고침</Button>
          <Button variant="outline" size="sm" onClick={store.rebuildMemoryIndex} disabled={!canRequest || store.loading}>
            <RefreshCw size={14} aria-hidden="true" /> 인덱스
          </Button>
          <Button variant="ghost" size="sm" onClick={store.clearMemory} disabled={!canRequest}>비우기</Button>
        </div>
      </div>
      {store.memoryIndexStatus ? (
        <div className={cn("rounded-md border px-3 py-2 text-xs", store.memoryIndexStatus.ok ? "border-border bg-muted/40" : "border-destructive/30 bg-destructive/10 text-destructive")}>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge tone={store.memoryIndexStatus.ok ? "success" : "destructive"}>{store.memoryIndexStatus.ok ? "indexed" : "failed"}</Badge>
            <Badge tone="outline">scanned {store.memoryIndexStatus.scannedDocuments}</Badge>
            <Badge tone="outline">indexed {store.memoryIndexStatus.indexedDocuments}</Badge>
            <Badge tone="outline">removed {store.memoryIndexStatus.removedDocuments}</Badge>
            <Badge tone={store.memoryIndexStatus.ftsAvailable ? "success" : "warning"}>{store.memoryIndexStatus.ftsAvailable ? "FTS ready" : "FTS hold"}</Badge>
            <Badge tone="outline">{store.memoryIndexStatus.elapsedMs}ms</Badge>
          </div>
          <p className="mt-1 truncate text-muted-foreground">{store.memoryIndexStatus.error || store.memoryIndexStatus.message}</p>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={store.memorySearchQuery}
          placeholder="메모리 검색"
          onChange={(event) => store.setMemorySearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (canRequest) store.searchMemory();
            }
          }}
        />
        <Button variant="primary" size="sm" onClick={store.searchMemory} disabled={!canRequest || !store.memorySearchQuery.trim()}>
          <Search size={14} aria-hidden="true" /> 검색
        </Button>
      </div>
      <div className="space-y-1">
        {store.memoryNotes.map((note) => (
          <button key={note.name} type="button" onClick={() => store.readMemoryNote(note.name)} disabled={!canRequest} className={cn("flex w-full flex-col rounded-md border px-2.5 py-2 text-left transition-colors", note.name === store.selectedNoteName ? "border-primary/50 bg-accent" : "border-transparent hover:bg-accent/60")}>
            <span className="truncate text-sm font-medium">{note.name}</span>
            <small className="truncate text-[11px] text-muted-foreground">{note.excerpt || note.fullPath}</small>
          </button>
        ))}
        {store.memoryNotes.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">메모리 노트 없음</p> : null}
      </div>
      {store.memorySearchResults.length > 0 ? (
        <div className="space-y-1">
          {store.memorySearchResults.map((result) => (
            <MemorySearchResultRow key={`${result.path}-${result.score}-${result.startLine}`} result={result} canRequest={canRequest} loading={store.loading} onOpen={store.openMemoryResult} />
          ))}
        </div>
      ) : null}
      {store.selectedNoteText || store.selectedMemoryError ? (
        <div className="rounded-md border border-border bg-muted/40">
          <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="min-w-0 truncate text-xs font-medium">{store.selectedNoteName || "memory"}</span>
            <Badge tone={store.selectedMemoryKind === "note" ? "primary" : "outline"} className="shrink-0">{store.selectedMemoryKind || "memory"}</Badge>
          </div>
          {store.selectedMemoryError ? <p className="px-3 py-2 text-xs text-destructive">{store.selectedMemoryError}</p> : null}
          {store.selectedNoteText ? <pre className="max-h-56 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px]">{store.selectedNoteText}</pre> : null}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => store.renameMemoryNote(store.selectedNoteName)} disabled={!canRequest || !store.selectedNoteName || store.selectedMemoryKind !== "note"}>이름 변경</Button>
        <Button variant="destructive" size="sm" onClick={() => store.deleteSelectedMemoryNotes()} disabled={!canRequest || !store.selectedNoteName || store.selectedMemoryKind !== "note"}>
          <Trash2 size={14} aria-hidden="true" /> 삭제
        </Button>
      </div>
    </CardBoundary>
  );
}

function BackupPackageCard({ store, canRequest, fileInputRef, onError }: { store: Store; canRequest: boolean; fileInputRef: RefObject<HTMLInputElement | null>; onError: CardErrorHandler }) {
  const toggleScope = (scope: string) => {
    const current = new Set(store.backupIncludeScopes);
    current.has(scope) ? current.delete(scope) : current.add(scope);
    store.setBackupIncludeScopes(Array.from(current));
  };

  return (
    <CardBoundary title="백업 패키지" card="logs" onError={onError}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">API 키, Telegram 토큰, auth session, runtime 로그는 패키지에 넣지 않습니다.</p>
        <Button variant="ghost" size="sm" onClick={() => store.setBackupIncludeScopes(Object.keys(BACKUP_SCOPE_LABELS))}>전체 선택</Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {Object.entries(BACKUP_SCOPE_LABELS).map(([scope, label]) => {
          const on = store.backupIncludeScopes.includes(scope);
          return (
            <label key={scope} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs", on ? "border-primary/40 bg-primary/5" : "border-border")}>
              <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong")}>
                {on ? <Check size={11} aria-hidden="true" /> : null}
              </span>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleScope(scope)} />
              <span className="truncate">{label}</span>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={store.exportBackup} disabled={!canRequest || store.backupIncludeScopes.length === 0 || store.loading}>
          <Download size={14} aria-hidden="true" /> 내보내기
        </Button>
        <Button variant="outline" size="sm" onClick={store.downloadBackupPackage} disabled={!store.backupPackage}>
          <HardDrive size={14} aria-hidden="true" /> 다운로드
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={!canRequest}>
          <Upload size={14} aria-hidden="true" /> 가져오기
        </Button>
        <Button variant="primary" size="sm" onClick={store.applyBackup} disabled={!canRequest || !store.backupPreview || store.loading}>적용</Button>
      </div>
      <input ref={fileInputRef} type="file" accept=".zip" hidden onChange={(event) => { const file = event.target.files?.[0] ?? null; void store.importBackup(file); event.target.value = ""; }} />
      {store.backupPackage ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">백업 패키지: {store.backupPackage.fileName}</p> : null}
      {store.backupPreview ? (
        <div className={cn("rounded-md border px-3 py-2 text-xs", store.backupPreview.error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-muted/40 text-muted-foreground")}>
          {store.backupPreview.fileName} · 대화 {store.backupPreview.conversationCount} · 파일 {store.backupPreview.fileCount} · 충돌 {store.backupPreview.conflictCount}
          {store.backupPreview.error ? <p className="mt-1">{store.backupPreview.error}</p> : null}
        </div>
      ) : null}
    </CardBoundary>
  );
}

function formatSyncTime(value: string) {
  if (!value) return "동기화 전";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function CloudSyncCard({ store, canRequest, onError }: { store: Store; canRequest: boolean; onError: CardErrorHandler }) {
  return (
    <CardBoundary title="클라우드 동기화" card="logs" onError={onError}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">선택한 백업 범위를 GitHub Gist에 보관합니다. 다운로드는 바로 적용하지 않고 백업 미리보기로만 들어옵니다.</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge tone={store.syncConfig.gitHubTokenSet ? "success" : "warning"}>
              {store.syncConfig.gitHubTokenSet ? "token saved" : "token required"}
            </Badge>
            <Badge tone="outline" className="max-w-[220px] truncate">{store.syncConfig.gistId || "gist -"}</Badge>
            <Badge tone="outline">{formatSyncTime(store.syncConfig.lastSyncUtc)}</Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={store.loadSyncConfig} disabled={!canRequest || store.loading}>
          <RefreshCw size={14} aria-hidden="true" /> 설정 조회
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
          Gist ID
          <Input value={store.syncDraft.gistId} placeholder="비워두면 새 private gist 생성" onChange={(event) => store.setSyncDraft({ gistId: event.target.value })} />
        </label>
        <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
          GitHub Token
          <Input type="password" value={store.syncDraft.gitHubToken} placeholder={store.syncConfig.gitHubTokenSet ? "저장됨 - 변경할 때만 입력" : "gist 권한 token"} onChange={(event) => store.setSyncDraft({ gitHubToken: event.target.value })} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={store.saveSyncConfig} disabled={!canRequest || store.loading}>
          <Check size={14} aria-hidden="true" /> 설정 저장
        </Button>
        <Button variant="ghost" size="sm" onClick={store.clearSyncToken} disabled={!canRequest || store.loading || !store.syncConfig.gitHubTokenSet}>
          Token 삭제
        </Button>
        <Button variant="primary" size="sm" onClick={store.cloudSyncUpload} disabled={!canRequest || store.loading || !store.syncConfig.gitHubTokenSet || store.backupIncludeScopes.length === 0}>
          <UploadCloud size={14} aria-hidden="true" /> 업로드
        </Button>
        <Button variant="outline" size="sm" onClick={store.cloudSyncDownload} disabled={!canRequest || store.loading || !store.syncConfig.gitHubTokenSet}>
          <Cloud size={14} aria-hidden="true" /> 다운로드 미리보기
        </Button>
      </div>

      {store.cloudSyncMessage ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.cloudSyncMessage}</p>
      ) : null}
    </CardBoundary>
  );
}

function AboutCard({ onError }: { onError: CardErrorHandler }) {
  return (
    <CardBoundary title="정보" card="navigation" onError={onError}>
      <SetRow title="대상 앱" desc="Tauri React 데스크톱 앱이 Phase 5 기본 전환 대상입니다." right={<Badge tone="outline">apps/desktop</Badge>} />
      <SetRow title="데이터 원칙" desc="데모 데이터 대신 미들웨어 WebSocket 계약과 로컬 상태 파일만 표시합니다." right={<Badge tone="success">live</Badge>} />
    </CardBoundary>
  );
}

type SettingsItem = { key: string; label: string; render: () => ReactNode };
type SettingsGroup = { key: string; label: string; summary: string; icon: typeof Settings2; items: SettingsItem[] };

export function SettingsPage() {
  useSettingsPageBridge();
  useTelegramSettingsBridge();
  useTotpSettingsBridge();
  useProviderCredentialsBridge();
  useExternalAccessBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useSettingsStore();
  const loadTelegramSettings = useTelegramSettingsStore((state) => state.loadSettings);
  const routePayload = useDesktopNavigationStore((state) => state.routePayload);
  const routeVersion = useDesktopNavigationStore((state) => state.routeVersion);
  const clearRoutePayload = useDesktopNavigationStore((state) => state.clearRoutePayload);
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const canSetupRequest = bridgeStatus === "connected";
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useLlmSettingsLoad(canSetupRequest);

  useEffect(() => {
    if (canSetupRequest) {
      store.loadCerebrasModels();
      loadTelegramSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSetupRequest]);

  useEffect(() => {
    if (canRequest) {
      store.loadMemoryNotes();
      store.loadSyncConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  const groups: SettingsGroup[] = useMemo(() => [
    {
      key: "general",
      label: "일반",
      summary: "접근과 연결",
      icon: Settings2,
      items: [
        { key: "general-preferences", label: "앱 표시", render: () => <DesktopPreferencesCard onError={recordCardError} /> },
        { key: "general-startup", label: "시작 시 실행", render: () => <StartOnLaunchCard onError={recordCardError} /> },
        { key: "general-speech", label: "음성 출력", render: () => <SpeechSettingsCard onError={recordCardError} /> },
        { key: "general-shortcuts", label: "단축키", render: () => <ShortcutPreferencesCard onError={recordCardError} /> },
        { key: "general-permissions", label: "전역 권한", render: () => <GlobalPermissionsCard onError={recordCardError} /> },
        { key: "general-default-project", label: "기본 프로젝트", render: () => <DefaultProjectCard canRequest={canRequest} onError={recordCardError} /> },
        { key: "general-status", label: "연결 상태", render: () => <StatusCard bridgeStatus={bridgeStatus} authStatus={authStatus} lastMessage={store.lastMessage} loading={store.loading} onError={recordCardError} /> },
        { key: "general-otp", label: "OTP 인증", render: () => <SettingsOtpPanel bridgeConnected={canSetupRequest} onError={recordCardError} /> },
        { key: "general-user-rules", label: "사용자 규칙", render: () => <SettingsUserRulesPanel canRequest={canSetupRequest} /> }
      ]
    },
    {
      key: "integrations",
      label: "연동",
      summary: "알림과 외부 접속",
      icon: Share2,
      items: [
        { key: "int-telegram", label: "Telegram", render: () => <SettingsTelegramPanel canRequest={canSetupRequest} onError={recordCardError} /> },
        { key: "int-external", label: "외부접속 (LAN)", render: () => <SettingsExternalAccessPanel canRequest={canRequest} onError={recordCardError} /> }
      ]
    },
    {
      key: "models",
      label: "모델 · 키",
      summary: "키, CLI, 모델, 사용량",
      icon: Cpu,
      items: [
        { key: "models-priority", label: "우선순위", render: () => <ModelPriorityCard onError={recordCardError} /> },
        { key: "models-keys", label: "연동 키", render: () => <LlmKeysCard canRequest={canSetupRequest} onError={recordCardError} /> },
        { key: "models-cli", label: "CLI 인증", render: () => <CliAuthCard store={store} canRequest={canSetupRequest} onError={recordCardError} /> },
        { key: "models-select", label: "모델 선택", render: () => <LlmModelSelectCard store={store} canRequest={canSetupRequest} onError={recordCardError} /> },
        { key: "models-cerebras", label: "Cerebras", render: () => <CerebrasCard store={store} canRequest={canSetupRequest} onError={recordCardError} /> },
        { key: "models-usage", label: "사용량", render: () => <LlmUsageCard store={store} onError={recordCardError} /> }
      ]
    },
    {
      key: "memory",
      label: "메모리 · 백업",
      summary: "노트와 휴대 패키지",
      icon: Database,
      items: [
        { key: "memory-notes", label: "메모리 노트", render: () => <MemoryNotesCard store={store} canRequest={canRequest} onError={recordCardError} /> },
        { key: "memory-backup", label: "백업 패키지", render: () => <BackupPackageCard store={store} canRequest={canRequest} fileInputRef={fileInputRef} onError={recordCardError} /> },
        { key: "memory-sync", label: "클라우드 동기화", render: () => <CloudSyncCard store={store} canRequest={canRequest} onError={recordCardError} /> }
      ]
    },
    {
      key: "about",
      label: "정보",
      summary: "앱 정보",
      icon: Info,
      items: [
        { key: "about-app", label: "앱 정보", render: () => <AboutCard onError={recordCardError} /> }
      ]
    }
  ], [bridgeStatus, authStatus, canRequest, canSetupRequest, store, recordCardError]);

  const [activeItemKey, setActiveItemKey] = useState("models-keys");
  const flatItems = groups.flatMap((group) => group.items.map((item) => ({ ...item, groupKey: group.key })));
  const activeItem = flatItems.find((item) => item.key === activeItemKey) || flatItems[0];
  const activeGroup = groups.find((group) => group.key === activeItem.groupKey) || groups[0];

  useEffect(() => {
    const focus = String(routePayload?.focus || "").trim();
    if (!focus) return;
    const aliases: Record<string, string> = {
      appearance: "general-preferences",
      theme: "general-preferences",
      detail: "general-preferences",
      startup: "general-startup",
      "start-on-launch": "general-startup",
      launch: "general-startup",
      speech: "general-speech",
      tts: "general-speech",
      voice: "general-speech",
      shortcuts: "general-shortcuts",
      shortcut: "general-shortcuts",
      hotkeys: "general-shortcuts",
      keyboard: "general-shortcuts",
      permissions: "general-permissions",
      permission: "general-permissions",
      policy: "general-permissions",
      "default-project": "general-default-project",
      project: "general-default-project",
      status: "general-status",
      otp: "general-otp",
      telegram: "int-telegram",
      external: "int-external",
      lan: "int-external",
      keys: "models-keys",
      models: "models-keys",
      priority: "models-priority",
      "model-priority": "models-priority",
      "models-priority": "models-priority",
      cli: "models-cli",
      "model-select": "models-select",
      usage: "models-usage",
      memory: "memory-notes",
      backup: "memory-backup",
      sync: "memory-sync"
    };
    const nextKey = aliases[focus] || focus;
    if (flatItems.some((item) => item.key === nextKey)) {
      setActiveItemKey(nextKey);
    }
    clearRoutePayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeVersion]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">설정</h1>
        <p className="text-sm text-muted-foreground">접근·연동·모델·메모리를 실제 미들웨어 응답 기준으로 한 곳에서 관리합니다.</p>
      </div>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-1" aria-label="설정 섹션">
          {groups.map((group) => {
            const Icon = group.icon;
            const groupActive = activeGroup.key === group.key;
            return (
              <div key={group.key} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => setActiveItemKey(group.items[0].key)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-200",
                    groupActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <Icon size={16} className={cn("shrink-0", groupActive && "text-primary")} aria-hidden="true" />
                  <span className="min-w-0 truncate">{group.label}</span>
                </button>
                {groupActive ? (
                  <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
                    {group.items.map((item) => {
                      const itemActive = activeItem.key === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setActiveItemKey(item.key)}
                          className={cn(
                            "truncate rounded-md px-2.5 py-1.5 text-left text-xs transition-colors duration-200",
                            itemActive ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                          )}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate text-sm font-medium">{activeGroup.label}</span>
            <span className="shrink-0 text-muted-foreground">·</span>
            <span className="truncate text-xs text-muted-foreground">{activeItem.label}</span>
          </div>
          {activeItem.render()}
        </div>
      </section>
    </div>
  );
}

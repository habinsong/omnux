import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Bot, Code2, FileText, FolderGit2, Keyboard, KeyRound, MessageSquare, Moon, Search, Settings2, Share2, ShieldCheck, Sparkles, Sun, Volume2, X } from "lucide-react";
import { Badge, Button, IconButton, Input, cn } from "../../components/ui/primitives";
import { ASK_PROVIDER_OPTIONS, useAskStore, type AskModelProvider, type AskProvider } from "../ask/ask-store";
import { modelOptionsForProvider } from "../ask/ask-models";
import { BUILD_PROVIDER_OPTIONS, modelOptionsForBuildProvider, useBuildStore, type BuildModelProvider, type BuildProvider } from "../build/build-store";
import type { DesktopPageDefinition, DesktopPageId } from "./DesktopNavigation";
import { useDesktopNavigationStore, type DesktopRoutePayload } from "./navigation-store";
import { useDesktopPreferenceStore, type DetailLevel, type ThemeMode } from "./preference-store";

type PaletteAction = {
  id: string;
  group: string;
  label: string;
  description: string;
  icon: LucideIcon;
  page?: DesktopPageId;
  payload?: DesktopRoutePayload;
  run?: () => void;
  keywords: string[];
};

type CommandPaletteProps = {
  open: boolean;
  pages: DesktopPageDefinition[];
  onClose: () => void;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function actionMatches(action: PaletteAction, query: string) {
  if (!query) return true;
  const haystack = [
    action.label,
    action.description,
    action.group,
    action.page,
    ...action.keywords
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function buildPageActions(pages: DesktopPageDefinition[]): PaletteAction[] {
  return pages
    .filter((page) => page.id !== "shell")
    .map((page) => ({
      id: `page-${page.id}`,
      group: "페이지",
      label: `${page.label} 열기`,
      description: page.description,
      icon: page.icon || Sparkles,
      page: page.id,
      keywords: [page.id, page.label, page.description]
    }));
}

function buildQuickActions(query: string): PaletteAction[] {
  const text = query.trim();
  const queryPayload = text ? { input: text } : undefined;
  return [
    {
      id: "quick-ask",
      group: "빠른 시작",
      label: text ? "질문으로 보내기" : "새 질문 시작",
      description: text ? "입력한 문장을 Ask 초안으로 넘깁니다." : "Ask에서 새 대화를 시작합니다.",
      icon: MessageSquare,
      page: "ask",
      payload: queryPayload,
      keywords: ["ask", "질문", "대화", "chat"]
    },
    {
      id: "quick-compare",
      group: "빠른 시작",
      label: "모델 비교로 열기",
      description: text ? "입력한 문장을 multi 비교 모드로 넘깁니다." : "Ask의 모델 비교 모드를 엽니다.",
      icon: Sparkles,
      page: "ask",
      payload: { ...queryPayload, mode: "compare" },
      keywords: ["compare", "multi", "비교", "모델"]
    },
    {
      id: "quick-file",
      group: "빠른 시작",
      label: "파일 분석으로 열기",
      description: "Ask를 파일 첨부가 열린 상태로 시작합니다.",
      icon: FileText,
      page: "ask",
      payload: { ...queryPayload, mode: "file", openAttachmentPanel: true },
      keywords: ["file", "첨부", "분석", "문서", "로그"]
    },
    {
      id: "quick-build",
      group: "빠른 시작",
      label: text ? "빌드 요청으로 보내기" : "코드 작업 시작",
      description: text ? "입력한 문장을 Build 초안으로 넘깁니다." : "Build에서 코드 작업을 시작합니다.",
      icon: Code2,
      page: "build",
      payload: queryPayload,
      keywords: ["build", "code", "코드", "빌드", "디버그"]
    },
    {
      id: "quick-automate",
      group: "빠른 시작",
      label: text ? "자동화 초안 만들기" : "새 루틴 만들기",
      description: text ? "입력한 문장으로 자동화 생성 패널을 엽니다." : "Automate의 새 루틴 패널을 엽니다.",
      icon: Bot,
      page: "automate",
      payload: { ...queryPayload, create: true },
      keywords: ["automate", "routine", "자동화", "루틴", "예약"]
    }
  ];
}

function buildPreferenceActions(setTheme: (theme: ThemeMode) => void, setDetailLevel: (detailLevel: DetailLevel) => void): PaletteAction[] {
  return [
    {
      id: "pref-theme-glass",
      group: "환경설정",
      label: "테마를 글래스로 전환",
      description: "기본 글래스 테마를 적용합니다.",
      icon: Sparkles,
      run: () => setTheme("glass"),
      keywords: ["theme", "glass", "테마", "글래스", "appearance"]
    },
    {
      id: "pref-theme-light",
      group: "환경설정",
      label: "테마를 라이트로 전환",
      description: "밝은 오프화이트 테마를 적용합니다.",
      icon: Sun,
      run: () => setTheme("light"),
      keywords: ["theme", "light", "테마", "라이트", "appearance"]
    },
    {
      id: "pref-theme-dark",
      group: "환경설정",
      label: "테마를 다크로 전환",
      description: "따뜻한 다크 테마를 적용합니다.",
      icon: Moon,
      run: () => setTheme("dark"),
      keywords: ["theme", "dark", "테마", "다크", "appearance"]
    },
    {
      id: "pref-detail-simple",
      group: "환경설정",
      label: "상세도를 간단히로 전환",
      description: "핵심 정보 위주의 보기로 전환합니다.",
      icon: Settings2,
      run: () => setDetailLevel("simple"),
      keywords: ["simple", "detail", "간단히", "상세도", "기본"]
    },
    {
      id: "pref-detail-advanced",
      group: "환경설정",
      label: "상세도를 고급으로 전환",
      description: "지원 페이지에서 라우트·로그·콘솔 정보를 더 노출합니다.",
      icon: Settings2,
      run: () => setDetailLevel("advanced"),
      keywords: ["advanced", "detail", "고급", "상세도", "로그", "콘솔"]
    }
  ];
}

function buildSettingsActions(): PaletteAction[] {
  return [
    {
      id: "settings-appearance",
      group: "설정",
      label: "앱 표시 설정 열기",
      description: "테마와 간단히/고급 상세도를 조정합니다.",
      icon: Settings2,
      page: "settings",
      payload: { focus: "appearance" },
      keywords: ["settings", "appearance", "theme", "detail", "설정", "테마", "고급"]
    },
    {
      id: "settings-permissions",
      group: "설정",
      label: "전역 권한 설정 열기",
      description: "read/write/run/network/delete 기본 승인 방식을 조정합니다.",
      icon: ShieldCheck,
      page: "settings",
      payload: { focus: "permissions" },
      keywords: ["settings", "permission", "permissions", "policy", "권한", "승인", "allow", "deny"]
    },
    {
      id: "settings-speech",
      group: "설정",
      label: "음성 출력 설정 열기",
      description: "자동 읽기, 음성, 속도, 볼륨을 조정합니다.",
      icon: Volume2,
      page: "settings",
      payload: { focus: "tts" },
      keywords: ["settings", "speech", "tts", "voice", "읽기", "음성", "자동읽기"]
    },
    {
      id: "settings-shortcuts",
      group: "설정",
      label: "단축키 설정 열기",
      description: "팔레트, 페이지 이동, 작성창 단축키를 바꿉니다.",
      icon: Keyboard,
      page: "settings",
      payload: { focus: "shortcuts" },
      keywords: ["settings", "shortcut", "shortcuts", "hotkey", "keyboard", "단축키", "키보드"]
    },
    {
      id: "settings-default-project",
      group: "설정",
      label: "기본 프로젝트 설정 열기",
      description: "대표 프로젝트를 조회하고 지정합니다.",
      icon: FolderGit2,
      page: "settings",
      payload: { focus: "default-project" },
      keywords: ["settings", "project", "default", "프로젝트", "대표", "기본"]
    },
    {
      id: "settings-model-keys",
      group: "설정",
      label: "모델 키 설정 열기",
      description: "LLM API 키와 provider credential을 관리합니다.",
      icon: KeyRound,
      page: "settings",
      payload: { focus: "keys" },
      keywords: ["settings", "models", "keys", "provider", "llm", "키", "모델"]
    },
    {
      id: "settings-cli",
      group: "설정",
      label: "CLI 인증 설정 열기",
      description: "Copilot/Codex CLI 인증 상태를 확인합니다.",
      icon: KeyRound,
      page: "settings",
      payload: { focus: "cli" },
      keywords: ["settings", "cli", "copilot", "codex", "인증"]
    },
    {
      id: "settings-telegram",
      group: "설정",
      label: "Telegram 설정 열기",
      description: "Telegram token, chat, 테스트 전송을 관리합니다.",
      icon: Share2,
      page: "settings",
      payload: { focus: "telegram" },
      keywords: ["settings", "telegram", "bot", "알림", "연동"]
    },
    {
      id: "settings-backup-sync",
      group: "설정",
      label: "백업 동기화 설정 열기",
      description: "백업 패키지와 Gist 클라우드 동기화를 엽니다.",
      icon: FileText,
      page: "settings",
      payload: { focus: "sync" },
      keywords: ["settings", "backup", "sync", "gist", "백업", "동기화"]
    }
  ];
}

function buildProviderActions(navigate: (page: DesktopPageId, payload?: DesktopRoutePayload | null) => void): PaletteAction[] {
  const askActions: PaletteAction[] = ASK_PROVIDER_OPTIONS.map((provider) => ({
    id: `ask-provider-${provider.value}`,
    group: "모델 전환",
    label: `Ask provider: ${provider.label}`,
    description: "질문 탭 provider를 전환하고 모델 도크를 엽니다.",
    icon: MessageSquare,
    page: "ask",
    run: () => {
      useAskStore.getState().setProvider(provider.value as AskProvider);
      useAskStore.getState().setSidePanel("models");
      navigate("ask", null);
    },
    keywords: ["ask", "provider", "model", "모델", "제공자", provider.value, provider.label]
  }));
  const buildActions: PaletteAction[] = BUILD_PROVIDER_OPTIONS.map((provider) => ({
    id: `build-provider-${provider.value}`,
    group: "모델 전환",
    label: `Build provider: ${provider.label}`,
    description: "빌드 탭 provider를 전환하고 모델 도크를 엽니다.",
    icon: Code2,
    page: "build",
    run: () => {
      useBuildStore.getState().setProvider(provider.value as BuildProvider);
      useBuildStore.getState().setSidePanel("models");
      navigate("build", null);
    },
    keywords: ["build", "code", "provider", "model", "모델", "제공자", provider.value, provider.label]
  }));
  return [...askActions, ...buildActions];
}

function buildModelActions(
  navigate: (page: DesktopPageId, payload?: DesktopRoutePayload | null) => void,
  askCatalogs: Record<AskModelProvider, string[]>,
  buildCatalogs: Record<BuildModelProvider, string[]>
): PaletteAction[] {
  const askActions: PaletteAction[] = ASK_PROVIDER_OPTIONS.flatMap((providerOption) => {
    if (providerOption.value === "auto") return [];
    const provider = providerOption.value as AskModelProvider;
    return modelOptionsForProvider(provider, askCatalogs).map((model) => ({
      id: `ask-model-${provider}-${model}`,
      group: "Ask 모델",
      label: `Ask model: ${model}`,
      description: `${providerOption.label} provider와 모델을 함께 선택합니다.`,
      icon: MessageSquare,
      page: "ask",
      run: () => {
        const store = useAskStore.getState();
        store.setProvider(provider);
        store.setSelectedModel(provider, model);
        store.setSidePanel("models");
        navigate("ask", null);
      },
      keywords: ["ask", "model", "provider", "모델", "제공자", provider, providerOption.label, model]
    }));
  });

  const buildActions: PaletteAction[] = BUILD_PROVIDER_OPTIONS.flatMap((providerOption) => {
    if (providerOption.value === "auto") return [];
    const provider = providerOption.value as BuildModelProvider;
    return modelOptionsForBuildProvider(provider, buildCatalogs).map((model) => ({
      id: `build-model-${provider}-${model}`,
      group: "Build 모델",
      label: `Build model: ${model}`,
      description: `${providerOption.label} provider와 모델을 함께 선택합니다.`,
      icon: Code2,
      page: "build",
      run: () => {
        const store = useBuildStore.getState();
        store.setProvider(provider);
        store.setSelectedModel(provider, model);
        store.setSidePanel("models");
        navigate("build", null);
      },
      keywords: ["build", "code", "model", "provider", "모델", "제공자", provider, providerOption.label, model]
    }));
  });

  return [...askActions, ...buildActions];
}

export function CommandPalette({ open, pages, onClose }: CommandPaletteProps) {
  const navigate = useDesktopNavigationStore((state) => state.setActivePage);
  const setTheme = useDesktopPreferenceStore((state) => state.setTheme);
  const setDetailLevel = useDesktopPreferenceStore((state) => state.setDetailLevel);
  const askModelCatalogs = useAskStore((state) => state.modelCatalogs);
  const buildModelCatalogs = useBuildStore((state) => state.modelCatalogs);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const normalizedQuery = normalize(query);
  const actions = useMemo(() => {
    const next = [
      ...buildQuickActions(query),
      ...buildProviderActions(navigate),
      ...buildModelActions(navigate, askModelCatalogs, buildModelCatalogs),
      ...buildPreferenceActions(setTheme, setDetailLevel),
      ...buildSettingsActions(),
      ...buildPageActions(pages)
    ]
      .filter((action) => actionMatches(action, normalizedQuery));
    return next.length > 0 ? next : buildQuickActions(query);
  }, [askModelCatalogs, buildModelCatalogs, navigate, normalizedQuery, pages, query, setDetailLevel, setTheme]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const commandKey = event.metaKey || event.ctrlKey;
      if (commandKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open ? onClose() : null;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const runAction = (action: PaletteAction) => {
    if (action.run) {
      action.run();
    } else if (action.page) {
      navigate(action.page, action.payload || null);
    }
    setQuery("");
    onClose();
  };

  const grouped = actions.reduce<Record<string, PaletteAction[]>>((acc, action) => {
    acc[action.group] = acc[action.group] || [];
    acc[action.group].push(action);
    return acc;
  }, {});

  const activeAction = actions[Math.max(0, Math.min(activeIndex, actions.length - 1))];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl shadow-primary/10"
        role="dialog"
        aria-modal="true"
        aria-label="명령 팔레트"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(actions.length - 1, index + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(0, index - 1));
              } else if (event.key === "Enter" && activeAction) {
                event.preventDefault();
                runAction(activeAction);
              }
            }}
            placeholder="페이지, 작업, 모델 비교, 자동화 만들기"
            className="h-10 border-0 px-0 focus-visible:ring-0"
            aria-label="명령 검색"
          />
          <Badge tone="outline" className="hidden shrink-0 sm:inline-flex">⌘K</Badge>
          <IconButton icon={X} label="닫기" onClick={onClose} />
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-2">
          {Object.entries(grouped).map(([group, groupActions]) => (
            <div key={group} className="py-1">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {group}
              </div>
              <div className="space-y-0.5">
                {groupActions.map((action) => {
                  const index = actions.findIndex((item) => item.id === action.id);
                  const active = index === activeIndex;
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runAction(action)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-200 active:scale-[0.99]",
                        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{action.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{action.description}</span>
                      </span>
                      <Badge tone="outline" className="hidden shrink-0 sm:inline-flex">{action.page || "pref"}</Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="truncate">↑↓ 이동 · Enter 실행 · Esc 닫기</span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => runAction(activeAction)}>
            선택 실행
          </Button>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Cpu, Database, Info, Settings2, Share2, ShieldCheck } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { cn } from "../../components/ui/primitives";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { useSettingsPageBridge, useSettingsStore } from "./settings-store";
import { useTelegramSettingsBridge, useTelegramSettingsStore } from "./settings-telegram-store";
import { useTotpSettingsBridge } from "./settings-totp-store";
import { useProviderCredentialsBridge } from "./settings-provider-credentials-store";
import { useExternalAccessBridge } from "./settings-external-store";
import { CliAuthCard, LlmKeysCard, LlmModelSelectCard, LlmUsageCard, useLlmSettingsLoad } from "./LlmModelsPanel";
import { SettingsTelegramPanel } from "./SettingsTelegramPanel";
import { SettingsOtpPanel } from "./SettingsOtpPanel";
import { SettingsUserRulesPanel } from "./SettingsUserRulesPanel";
import { SettingsExternalAccessPanel } from "./SettingsExternalAccessPanel";
import {
  AboutCard,
  BackupPackageCard,
  CerebrasCard,
  CloudSyncCard,
  DefaultProjectCard,
  DesktopPreferencesCard,
  GlobalPermissionsCard,
  MemoryNotesCard,
  ModelPriorityCard,
  ShortcutPreferencesCard,
  SpeechSettingsCard,
  StartOnLaunchCard,
  StatusCard
} from "./SettingsCards";
import { SETTINGS_ALIASES } from "./settings-sections";

/* ============================================================================
   설정 화면.
   위: 다섯 갈래 캡슐 탭. 그 아래: 그 갈래의 항목 칩. 본문은 한 번에 하나만.
   본문만 스크롤한다. 페이지는 절대 스크롤하지 않는다.
   ============================================================================ */

type Item = { key: string; label: string; render: () => ReactNode };
type Group = { key: string; label: string; icon: typeof Settings2; items: Item[] };

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

  const connected = bridgeStatus === "connected";
  const authorized = connected && authStatus === "authenticated";
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useLlmSettingsLoad(connected);

  useEffect(() => {
    if (!connected) return;
    store.loadCerebrasModels();
    loadTelegramSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    if (!authorized) return;
    store.loadMemoryNotes();
    store.loadSyncConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  const groups: Group[] = useMemo(
    () => [
      // 묶음 기준: 앱 사용 습관(일반) · LLM(모델) · 접근 권한(보안) · 외부 서비스(연동) · 내 기록(데이터) · 상태(정보)
      {
        key: "general",
        label: "일반",
        icon: Settings2,
        items: [
          { key: "general-preferences", label: "앱 표시", render: () => <DesktopPreferencesCard onError={recordCardError} /> },
          { key: "general-startup", label: "시작 시 실행", render: () => <StartOnLaunchCard onError={recordCardError} /> },
          { key: "general-shortcuts", label: "단축키", render: () => <ShortcutPreferencesCard onError={recordCardError} /> },
          { key: "general-speech", label: "음성 출력", render: () => <SpeechSettingsCard onError={recordCardError} /> },
          { key: "general-default-project", label: "기본 프로젝트", render: () => <DefaultProjectCard canRequest={authorized} onError={recordCardError} /> },
          { key: "general-user-rules", label: "사용자 규칙", render: () => <SettingsUserRulesPanel canRequest={connected} /> }
        ]
      },
      {
        key: "models",
        label: "모델",
        icon: Cpu,
        items: [
          {
            key: "models-select",
            label: "모델 선택",
            render: () => (
              <>
                <LlmModelSelectCard store={store} canRequest={connected} onError={recordCardError} />
                <CerebrasCard store={store} canRequest={connected} onError={recordCardError} />
              </>
            )
          },
          { key: "models-keys", label: "API 키", render: () => <LlmKeysCard canRequest={connected} onError={recordCardError} /> },
          { key: "models-cli", label: "CLI 연결", render: () => <CliAuthCard store={store} canRequest={connected} onError={recordCardError} /> },
          { key: "models-priority", label: "우선순위", render: () => <ModelPriorityCard onError={recordCardError} /> },
          { key: "models-usage", label: "사용량", render: () => <LlmUsageCard store={store} onError={recordCardError} /> }
        ]
      },
      {
        key: "security",
        label: "보안",
        icon: ShieldCheck,
        items: [
          { key: "security-otp", label: "앱 인증", render: () => <SettingsOtpPanel bridgeConnected={connected} onError={recordCardError} /> },
          { key: "security-external", label: "외부 접속", render: () => <SettingsExternalAccessPanel canRequest={authorized} onError={recordCardError} /> },
          { key: "security-permissions", label: "권한", render: () => <GlobalPermissionsCard onError={recordCardError} /> }
        ]
      },
      {
        key: "integrations",
        label: "연동",
        icon: Share2,
        items: [
          { key: "int-telegram", label: "Telegram", render: () => <SettingsTelegramPanel canRequest={connected} onError={recordCardError} /> },
          { key: "int-sync", label: "클라우드 동기화", render: () => <CloudSyncCard store={store} canRequest={authorized} onError={recordCardError} /> }
        ]
      },
      {
        key: "data",
        label: "데이터",
        icon: Database,
        items: [
          { key: "data-notes", label: "메모리 노트", render: () => <MemoryNotesCard store={store} canRequest={authorized} onError={recordCardError} /> },
          {
            key: "data-backup",
            label: "백업",
            render: () => <BackupPackageCard store={store} canRequest={authorized} fileInputRef={fileInputRef} onError={recordCardError} />
          }
        ]
      },
      {
        key: "about",
        label: "정보",
        icon: Info,
        items: [
          {
            key: "about-status",
            label: "연결 상태",
            render: () => (
              <StatusCard
                bridgeStatus={bridgeStatus}
                authStatus={authStatus}
                lastMessage={store.lastMessage}
                loading={store.loading}
                onError={recordCardError}
              />
            )
          },
          { key: "about-app", label: "앱 정보", render: () => <AboutCard onError={recordCardError} /> }
        ]
      }
    ],
    [bridgeStatus, authStatus, authorized, connected, store, recordCardError]
  );

  const [itemKey, setItemKey] = useState("models-select");
  const bodyRef = useRef<HTMLDivElement>(null);
  const flat = groups.flatMap((group) => group.items.map((item) => ({ ...item, groupKey: group.key })));
  const item = flat.find((entry) => entry.key === itemKey) || flat[0];
  const group = groups.find((entry) => entry.key === item.groupKey) || groups[0];

  // 다른 화면에서 "설정의 이 항목" 으로 보낼 때 그 항목을 연다.
  useEffect(() => {
    const focus = String(routePayload?.focus || "").trim();
    if (!focus) return;
    const next = SETTINGS_ALIASES[focus] || focus;
    if (flat.some((entry) => entry.key === next)) setItemKey(next);
    clearRoutePayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeVersion]);

  const tabs: ScreenTab[] = groups.map((entry) => ({ id: entry.key, label: entry.label, icon: entry.icon }));

  return (
    <Screen
      title="설정"
      hint={`${group.label} · ${item.label}`}
      notice={!connected ? <ScreenNotice tone="warning">연결되지 않았습니다. 값은 보이지만 저장은 되지 않습니다.</ScreenNotice> : null}
    >
      <ScreenTabs
        tabs={tabs}
        value={group.key}
        onChange={(id) => {
          const next = groups.find((entry) => entry.key === id);
          if (next) {
            setItemKey(next.items[0].key);
            bodyRef.current?.scrollTo({ top: 0 });
          }
        }}
        label="설정 갈래"
      />

      {group.items.length > 1 ? (
        <div
          role="tablist"
          aria-label={`${group.label} 항목`}
          className="flex min-w-0 shrink-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {group.items.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={entry.key === item.key}
              onClick={() => {
                setItemKey(entry.key);
                window.requestAnimationFrame(() => {
                  document.getElementById(`settings-item-${entry.key}`)?.scrollIntoView({ block: "nearest" });
                });
              }}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
                entry.key === item.key ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card">
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="min-w-0 space-y-6 p-3 pb-8">
            {group.items.map((entry) => (
              <div key={entry.key} id={`settings-item-${entry.key}`} className="scroll-mt-2">
                {entry.render()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Screen>
  );
}

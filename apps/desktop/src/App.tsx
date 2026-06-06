import { useEffect, useMemo, useState } from "react";
import { HomePage } from "./features/home/HomePage";
import { ActivityPage } from "./features/activity/ActivityPage";
import { AskPage } from "./features/ask/AskPage";
import { BuildPage } from "./features/build/BuildPage";
import { LogicPage } from "./features/logic/LogicPage";
import { AutomatePage } from "./features/automate/AutomatePage";
import { ExplorePage } from "./features/explore/ExplorePage";
import { OperationsPage } from "./features/ops/OperationsPage";
import { InsightsPage } from "./features/insights/InsightsPage";
import { NotebookPage } from "./features/notebooks/NotebookPage";
import { SkillsPage } from "./features/skills/SkillsPage";
import { RoutingPolicyPage } from "./features/routing/RoutingPolicyPage";
import { PlanningPage } from "./features/planning/PlanningPage";
import { RefactorPage } from "./features/refactor/RefactorPage";
import { AgentsPage } from "./features/agents/AgentsPage";
import { ProjectsPage } from "./features/projects/ProjectsPage";
import {
  DesktopNavigation,
  type DesktopPageDefinition
} from "./features/shell/DesktopNavigation";
import { DesktopRail } from "./features/shell/DesktopRail";
import { areaDefinition, areaForPage } from "./features/shell/nav-areas";
import { DesktopTopBar } from "./features/shell/DesktopTopBar";
import { CommandPalette } from "./features/shell/CommandPalette";
import { PageBoundary } from "./features/shell/PageBoundary";
import { ShellOverviewPage } from "./features/shell/ShellOverviewPage";
import { ResourceUsageDrawer } from "./features/shell/ResourceUsageDrawer";
import { MediaWidget } from "./features/shell/MediaWidget";
import { SettingsPage } from "./features/settings/SettingsPage";
import { DesktopDialogHost } from "./features/dialog/DesktopDialogHost";
import { DesktopToastHost } from "./features/toast/DesktopToastHost";
import { useDesktopNavigationStore } from "./features/shell/navigation-store";
import { applyDesktopTheme, shortcutMatches, useDesktopPreferenceStore, type ShortcutAction } from "./features/shell/preference-store";
import { useSpeechStore } from "./features/ask/ask-speech";
import { useUiLogStore } from "./features/ui-log/ui-log-store";
import { useMiddlewareBootstrapEvents } from "./use-middleware-bootstrap-events";
import { useMiddlewareRuntimeProbe } from "./use-middleware-runtime-probe";
import { useMiddlewareSessionBridge } from "./use-middleware-session";
import { cn } from "./components/ui/primitives";
import {
  Home,
  LayoutDashboard,
  MessageSquare,
  Hammer,
  Workflow,
  Compass,
  Folder,
  Repeat,
  Settings,
  Server,
  Activity,
  FileTerminal,
  NotebookText,
  Wrench,
  Route as RouteIcon,
  ClipboardList,
  GitCompare,
  Network
} from "lucide-react";

function App() {
  useMiddlewareBootstrapEvents();
  useMiddlewareRuntimeProbe();
  useMiddlewareSessionBridge();

  const activePage = useDesktopNavigationStore((state) => state.activePage);
  const setActivePage = useDesktopNavigationStore((state) => state.setActivePage);
  const selectArea = useDesktopNavigationStore((state) => state.selectArea);
  const shortcuts = useDesktopPreferenceStore((state) => state.shortcuts);
  const theme = useDesktopPreferenceStore((state) => state.theme);
  const cycleTheme = useDesktopPreferenceStore((state) => state.cycleTheme);
  const activityBadge = useUiLogStore((state) => Math.min(state.logs.length, 99));
  const [mobileNav, setMobileNav] = useState(false);
  const [subPanelOpen, setSubPanelOpen] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const pages = useMemo<DesktopPageDefinition[]>(
    () => [
      { id: "home", label: "홈", description: "Home", icon: Home, render: () => <HomePage /> },
      { id: "ask", label: "질문", description: "Ask", icon: MessageSquare, render: () => <AskPage /> },
      { id: "build", label: "빌드", description: "Build", icon: Hammer, render: () => <BuildPage /> },
      { id: "automate", label: "자동화", description: "Automate", icon: Repeat, render: () => <AutomatePage /> },
      { id: "explore", label: "탐색", description: "Explore", icon: Compass, render: () => <ExplorePage /> },
      { id: "projects", label: "프로젝트", description: "Projects", icon: Folder, render: () => <ProjectsPage /> },
      {
        id: "activity",
        label: "활동",
        description: "Activity",
        icon: Activity,
        badge: activityBadge,
        render: () => <ActivityPage />
      },
      { id: "logic", label: "규칙", description: "Rules", icon: Workflow, render: () => <LogicPage /> },
      { id: "insights", label: "로그", description: "Logs", icon: FileTerminal, render: () => <InsightsPage /> },
      { id: "notebooks", label: "노트", description: "Notes", icon: NotebookText, render: () => <NotebookPage /> },
      { id: "skills", label: "도구", description: "Tools", icon: Wrench, render: () => <SkillsPage /> },
      { id: "routing", label: "라우팅", description: "Routing", icon: RouteIcon, render: () => <RoutingPolicyPage /> },
      { id: "planning", label: "작업", description: "Tasks", icon: ClipboardList, render: () => <PlanningPage /> },
      { id: "refactor", label: "리뷰", description: "Review", icon: GitCompare, render: () => <RefactorPage /> },
      { id: "agents", label: "에이전트", description: "Agents", icon: Network, render: () => <AgentsPage /> },
      { id: "settings", label: "설정", description: "Settings", icon: Settings, render: () => <SettingsPage /> },
      { id: "operations", label: "상태", description: "Status", icon: Server, render: () => <OperationsPage /> },
      { id: "shell", label: "셸", description: "Shell", icon: LayoutDashboard, render: () => <ShellOverviewPage /> }
    ],
    [activityBadge]
  );
  const activePageDefinition = pages.find((page) => page.id === activePage) || pages[0];
  const isHome = activePageDefinition.id === "home";
  const activeArea = areaForPage(activePage);
  const activeAreaDef = areaDefinition(activeArea);
  const AreaIcon = activeAreaDef.icon;
  const areaPages = activeAreaDef.pages
    .map((id) => pages.find((page) => page.id === id))
    .filter((page): page is DesktopPageDefinition => Boolean(page));

  useEffect(() => {
    applyDesktopTheme(theme);
  }, [theme]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shortcutMatches(event, shortcuts.palette) || shortcutMatches(event, shortcuts.paletteAlt)) {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
        return;
      }

      const pageShortcuts: Partial<Record<ShortcutAction, typeof activePage>> = {
        pageHome: "home",
        pageAsk: "ask",
        pageBuild: "build",
        pageAutomate: "automate",
        pageActivity: "activity",
        pageNotebooks: "notebooks",
        pageSettings: "settings",
        pageOperations: "operations"
      };
      for (const [action, page] of Object.entries(pageShortcuts) as Array<[ShortcutAction, typeof activePage]>) {
        if (shortcutMatches(event, shortcuts[action])) {
          event.preventDefault();
          setActivePage(page);
          return;
        }
      }

      if (shortcutMatches(event, shortcuts.toggleTheme)) {
        event.preventDefault();
        cycleTheme();
        return;
      }
      if (shortcutMatches(event, shortcuts.toggleAutoSpeak)) {
        event.preventDefault();
        useSpeechStore.getState().toggleAutoSpeak();
        return;
      }
      if (shortcutMatches(event, shortcuts.stopSpeaking)) {
        event.preventDefault();
        useSpeechStore.getState().stop();
        return;
      }
      if (
        shortcutMatches(event, shortcuts.focusComposer) ||
        shortcutMatches(event, shortcuts.newConversation) ||
        shortcutMatches(event, shortcuts.searchConversations)
      ) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("omnux:shortcut", { detail: { action: shortcutMatches(event, shortcuts.focusComposer) ? "focusComposer" : shortcutMatches(event, shortcuts.newConversation) ? "newConversation" : "searchConversations" } }));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePage, cycleTheme, setActivePage, shortcuts]);

  return (
    <div className="flex h-screen w-full overflow-hidden text-foreground">
      {/* Mobile scrim */}
      {mobileNav ? (
        <div
          className={cn(
            "fixed inset-y-0 right-0 z-30 bg-white/35 backdrop-blur-sm lg:hidden dark:bg-white/10",
            "left-14"
          )}
          onClick={() => setMobileNav(false)}
          aria-hidden="true"
        />
      ) : null}
      {/* Sidebar (§2.3 GNB) */}
      <aside
        className={cn(
          "relative z-40 flex h-full shrink-0 overflow-hidden border-r border-border bg-card text-card-foreground shadow-[var(--shadow-card)] backdrop-blur-xl backdrop-saturate-150 transition-transform duration-200 ease-out",
          "w-14 max-lg:fixed max-lg:inset-y-0 max-lg:left-0",
          isHome ? "max-lg:w-14" : "max-lg:w-[316px] max-lg:max-w-full",
          mobileNav ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"
        )}
      >
        <DesktopRail
          activePage={activePage}
          areaBadges={{ monitor: activityBadge }}
          onSelectArea={(area) => {
            if (area === "home") {
              selectArea("home");
              setActivePage("home");
              setSubPanelOpen(false);
              setMobileNav(false);
            } else if (area === activeArea) {
              selectArea(area);
              setSubPanelOpen(mobileNav ? true : !subPanelOpen);
            } else {
              selectArea(area);
              setSubPanelOpen(true);
            }
          }}
        />

        {!isHome ? (
          <>
            <div className="relative z-10 hidden min-h-0 w-[260px] flex-col gap-2 px-[24px] pt-[32px] max-lg:flex">
              <div className="flex items-center gap-2 px-2 pb-4">
                <AreaIcon size={20} className="shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate text-[17px] font-semibold tracking-tight">{activeAreaDef.label}</span>
              </div>
              <DesktopNavigation
                pages={areaPages}
                activePage={activePage}
                onSelectPage={(page) => {
                  setActivePage(page);
                  setMobileNav(false);
                }}
              />
            </div>
          </>
        ) : null}
      </aside>

      {/* Main */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <DesktopTopBar
          onOpenNav={() => setMobileNav(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onSelectPage={(page) => {
            setActivePage(page);
            setMobileNav(false);
          }}
        />

        {subPanelOpen && !isHome && (
          <div
            className={cn(
              "z-30 hidden transition-transform duration-200 ease-out lg:block",
              "absolute top-14 h-fit",
              "lg:left-0 lg:w-[260px] lg:pt-[32px] lg:px-[24px] lg:bg-transparent",
              "translate-x-0"
            )}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-2 pb-4">
                <AreaIcon size={20} className="shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate text-[17px] font-semibold tracking-tight">{activeAreaDef.label}</span>
              </div>
              <DesktopNavigation
                pages={areaPages}
                activePage={activePage}
                onSelectPage={(page) => {
                  setActivePage(page);
                }}
              />
            </div>
          </div>
        )}

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto transition-[margin] duration-200 ease-out",
            subPanelOpen && !isHome ? "lg:ml-[260px]" : "lg:ml-0"
          )}
        >
          <div className={isHome ? "h-full" : "mx-auto w-full max-w-[1440px] p-6"}>
            <PageBoundary page={activePageDefinition.id}>{activePageDefinition.render()}</PageBoundary>
          </div>
        </div>
        <DesktopDialogHost />
        <DesktopToastHost />
        <ResourceUsageDrawer />
        <MediaWidget />
        <CommandPalette open={commandPaletteOpen} pages={pages} onClose={() => setCommandPaletteOpen(false)} />
      </main>
    </div>
  );
}

export default App;

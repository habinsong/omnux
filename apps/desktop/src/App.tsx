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
import { DesktopTopBar } from "./features/shell/DesktopTopBar";
import { CommandPalette } from "./features/shell/CommandPalette";
import { PageBoundary } from "./features/shell/PageBoundary";
import { ShellOverviewPage } from "./features/shell/ShellOverviewPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { DesktopDialogHost } from "./features/dialog/DesktopDialogHost";
import { DesktopToastHost } from "./features/toast/DesktopToastHost";
import { useDesktopNavigationStore } from "./features/shell/navigation-store";
import { shortcutDisplay, shortcutMatches, useDesktopPreferenceStore, type ShortcutAction } from "./features/shell/preference-store";
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
  Code,
  Workflow,
  Globe,
  FolderGit2,
  Layers3,
  Play,
  Settings,
  Shield,
  Activity,
  BarChart3,
  NotebookPen,
  Wand2,
  Route as RouteIcon,
  ClipboardList,
  Replace,
  Bot
} from "lucide-react";

function App() {
  useMiddlewareBootstrapEvents();
  useMiddlewareRuntimeProbe();
  useMiddlewareSessionBridge();

  const activePage = useDesktopNavigationStore((state) => state.activePage);
  const setActivePage = useDesktopNavigationStore((state) => state.setActivePage);
  const shortcuts = useDesktopPreferenceStore((state) => state.shortcuts);
  const cycleTheme = useDesktopPreferenceStore((state) => state.cycleTheme);
  const activityBadge = useUiLogStore((state) => Math.min(state.logs.length, 99));
  const [mobileNav, setMobileNav] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const pages = useMemo<DesktopPageDefinition[]>(
    () => [
      { id: "home", label: "홈", description: "Home", icon: Home, render: () => <HomePage /> },
      { id: "ask", label: "질문", description: "Ask", icon: MessageSquare, render: () => <AskPage /> },
      { id: "build", label: "빌드", description: "Build", icon: Code, render: () => <BuildPage /> },
      { id: "automate", label: "자동화", description: "Automate", icon: Play, render: () => <AutomatePage /> },
      { id: "explore", label: "탐색", description: "Explore", icon: Globe, render: () => <ExplorePage /> },
      { id: "projects", label: "프로젝트", description: "Projects", icon: FolderGit2, render: () => <ProjectsPage /> },
      {
        id: "activity",
        label: "활동",
        description: "Activity",
        icon: Activity,
        badge: activityBadge,
        render: () => <ActivityPage />
      },
      { id: "logic", label: "로직", description: "Logic", icon: Workflow, render: () => <LogicPage /> },
      { id: "insights", label: "인사이트", description: "Insights", icon: BarChart3, render: () => <InsightsPage /> },
      { id: "notebooks", label: "노트북", description: "Notebooks", icon: NotebookPen, render: () => <NotebookPage /> },
      { id: "skills", label: "스킬", description: "Skills", icon: Wand2, render: () => <SkillsPage /> },
      { id: "routing", label: "라우팅", description: "Routing", icon: RouteIcon, render: () => <RoutingPolicyPage /> },
      { id: "planning", label: "계획", description: "Plans & Tasks", icon: ClipboardList, render: () => <PlanningPage /> },
      { id: "refactor", label: "리팩터", description: "Safe Refactor", icon: Replace, render: () => <RefactorPage /> },
      { id: "agents", label: "에이전트", description: "Agents", icon: Bot, render: () => <AgentsPage /> },
      { id: "settings", label: "설정", description: "Settings", icon: Settings, render: () => <SettingsPage /> },
      { id: "operations", label: "운영", description: "Operations", icon: Shield, render: () => <OperationsPage /> },
      { id: "shell", label: "셸", description: "Shell", icon: LayoutDashboard, render: () => <ShellOverviewPage /> }
    ],
    [activityBadge]
  );
  const activePageDefinition = pages.find((page) => page.id === activePage) || pages[0];
  const navPages = pages.filter((page) => page.id !== "shell");
  const isHome = activePageDefinition.id === "home";

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
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNav(false)}
          aria-hidden="true"
        />
      ) : null}

      {/* Sidebar (§2.3 GNB) */}
      <aside
        className={cn(
          "z-40 flex w-64 min-w-[240px] shrink-0 flex-col gap-4 border-r border-border bg-card p-4 backdrop-blur-xl backdrop-saturate-150",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:transition-transform max-lg:duration-200 max-lg:ease-out",
          mobileNav ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"
        )}
      >
        <div className="flex items-center gap-2.5 px-1 pt-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Layers3 size={20} aria-hidden="true" />
          </div>
          <div className="text-base font-semibold tracking-tight">omnux</div>
        </div>

        <DesktopNavigation
          pages={navPages}
          activePage={activePage}
          onSelectPage={(page) => {
            setActivePage(page);
            setMobileNav(false);
          }}
        />

        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="leading-relaxed">
            언제든지{" "}
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground">
              {shortcutDisplay(shortcuts.palette)}
            </kbd>{" "}
            를 눌러 명령 팔레트를 여세요.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActivePage("settings")}
          className="flex items-center gap-2.5 rounded-lg border border-transparent px-1 py-1.5 text-left transition-colors duration-200 hover:border-border hover:bg-accent"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold uppercase text-primary">
            h
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">habinsong</span>
            <span className="truncate text-[11px] text-muted-foreground">로컬 워크스페이스</span>
          </span>
        </button>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <DesktopTopBar
          onOpenNav={() => setMobileNav(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onSelectPage={setActivePage}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={isHome ? "h-full" : "mx-auto w-full max-w-[1440px] p-6"}>
            <PageBoundary page={activePageDefinition.id}>{activePageDefinition.render()}</PageBoundary>
          </div>
        </div>
        <DesktopDialogHost />
        <DesktopToastHost />
        <CommandPalette open={commandPaletteOpen} pages={pages} onClose={() => setCommandPaletteOpen(false)} />
      </main>
    </div>
  );
}

export default App;

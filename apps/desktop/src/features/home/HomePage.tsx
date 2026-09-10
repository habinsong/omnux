import { useEffect, useState } from "react";
import {
  ChevronUp,
  ClipboardList,
  FolderGit2,
  Hammer,
  History,
  Inbox,
  MessageSquare
} from "lucide-react";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import type { DesktopPageId } from "../shell/DesktopNavigation";
import type { DesktopRoutePayload } from "../shell/navigation-store";
import { useProjectsPageBridge, useProjectsStore, type ProjectItem } from "../projects/projects-store";
import { useHomeRecentStore, type RecentItem, type RecentKind } from "./home-recent-store";
import {
  Badge,
  Button,
  EmptyState,
  SectionLabel,
  cn
} from "../../components/ui/primitives";
import { HeroComposer } from "./HeroComposer";

type QuickAction = {
  readonly id: string;
  readonly title: string;
  readonly page: DesktopPageId;
  readonly payload?: DesktopRoutePayload;
};

const QUICK_ACTION_ROWS: readonly (readonly QuickAction[])[] = [
  [
    { id: "automate", title: "자동화", page: "automate", payload: { create: true } },
    { id: "logic", title: "로직", page: "logic" },
    { id: "skills", title: "스킬", page: "skills" }
  ],
  [
    { id: "planning", title: "계획", page: "planning", payload: { create: true } },
    { id: "notebooks", title: "노트", page: "notebooks" }
  ]
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "좋은 아침이에요";
  if (hour < 18) return "좋은 오후예요";
  return "좋은 저녁이에요";
}

function formatProjectTime(value: string) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "등록됨";
  return parsed.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatRecentTime(value: string) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

const KIND_LABEL: Record<RecentKind, string> = { ask: "질문", build: "빌드", plan: "작업" };
const KIND_ICON: Record<RecentKind, typeof MessageSquare> = { ask: MessageSquare, build: Hammer, plan: ClipboardList };

function recentPayload(item: RecentItem): DesktopRoutePayload {
  if (item.kind === "plan") return { planId: item.id };
  return {
    conversationId: item.id,
    ...(item.mode ? { mode: item.mode } : {}),
    ...(item.project && item.project !== "기본" ? { projectName: item.project } : {})
  };
}

/* ============================ 아래쪽 이어서/프로젝트 드로어 ============================ */

function ContinueProjectsDrawer({
  recentItems,
  projects,
  onActivity,
  onProjects,
  onOpenProject,
  onOpenRecent
}: {
  recentItems: RecentItem[];
  projects: ProjectItem[];
  onActivity: () => void;
  onProjects: () => void;
  onOpenProject: (project: ProjectItem) => void;
  onOpenRecent: (item: RecentItem) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex shrink-0 justify-center px-4">
      <div
        className={cn(
          "w-full overflow-hidden rounded-t-md border border-border bg-card transition-[max-height] duration-200 ease-out",
          open ? "max-h-[62vh]" : "max-h-[3.25rem]"
        )}
      >
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold">
              <History size={15} className="text-primary" aria-hidden="true" /> 이어서 작업하기
            </span>
            <span className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold sm:flex">
              <FolderGit2 size={15} className="text-primary" aria-hidden="true" /> 활성 프로젝트
            </span>
          </button>
          <button type="button" onClick={onActivity} className="hidden shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline">활동</button>
          <span className="hidden text-border sm:inline" aria-hidden="true">·</span>
          <button type="button" onClick={onProjects} className="hidden shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline">프로젝트</button>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "접기" : "펼치기"}
            className="ml-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronUp size={16} className={cn("transition-transform duration-200", open ? "rotate-180" : "")} aria-hidden="true" />
          </button>
        </div>

        <div className="grid max-h-[calc(62vh-3.25rem)] grid-cols-1 gap-4 overflow-y-auto border-t border-border px-4 pb-4 pt-3 lg:grid-cols-2">
          <div className="min-w-0 space-y-1">
            <SectionLabel className="px-1 pb-1">이어서 작업하기</SectionLabel>
            {recentItems.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => onOpenRecent(item)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-200 hover:bg-accent"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{item.title}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {KIND_LABEL[item.kind]}
                      {item.preview ? ` · ${item.preview}` : ""}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{formatRecentTime(item.updatedUtc)}</span>
                </button>
              );
            })}
            {recentItems.length === 0 ? (
              <EmptyState icon={Inbox} title="아직 이어서 할 일이 없습니다" description="질문하거나 만들고 나면 그 자리가 여기에 남습니다." />
            ) : null}
          </div>

          <div className="min-w-0 space-y-1">
            <SectionLabel className="px-1 pb-1">활성 프로젝트</SectionLabel>
            {projects.slice(0, 4).map((project) => (
              <button
                key={project.projectKey}
                type="button"
                onClick={() => onOpenProject(project)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-200 hover:bg-accent"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
                  <FolderGit2 size={16} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5">
                    <b className="truncate text-sm font-medium">{project.name}</b>
                    {project.isMain ? <Badge tone="primary">대표</Badge> : null}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">{project.description || project.path}</span>
                </span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{formatProjectTime(project.lastOpenedUtc)}</span>
              </button>
            ))}
            {projects.length === 0 ? (
              <EmptyState
                icon={FolderGit2}
                title="등록된 프로젝트가 없습니다"
                description="로컬 폴더를 프로젝트로 등록하면 빠르게 이어서 작업할 수 있습니다."
                action={
                  <Button variant="primary" size="sm" onClick={onProjects}>
                    <FolderGit2 size={15} aria-hidden="true" /> 프로젝트 등록
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ 페이지 ============================ */

export function HomePage() {
  useProjectsPageBridge();

  const navigate = useDesktopNavigationStore((state) => state.setActivePage);
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recentItems = useHomeRecentStore((state) => state.items);
  const loadRecent = useHomeRecentStore((state) => state.load);
  const projects = useProjectsStore((state) => state.projects);
  const projectsLoading = useProjectsStore((state) => state.loading);
  const loadProjects = useProjectsStore((state) => state.loadProjects);
  const touchProject = useProjectsStore((state) => state.touchProject);
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (canRequest && !projectsLoading && projects.length === 0) {
      loadProjects();
    }
  }, [canRequest, loadProjects, projects.length, projectsLoading]);

  useEffect(() => {
    if (canRequest) loadRecent();
  }, [canRequest, loadRecent]);

  const openProject = (project: ProjectItem) => {
    touchProject(project);
    navigate("build", { projectKey: project.projectKey, projectName: project.name, projectPath: project.path });
  };

  const openRecent = (item: RecentItem) => {
    navigate(item.kind === "ask" ? "ask" : item.kind === "build" ? "build" : "planning", recentPayload(item));
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* 화면 정중앙: 인사 + hero 입력, 그 아래 빠른 시작 (my-auto로 중앙 정렬, 넘치면 스크롤) */}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-6 sm:px-6">
        <div className="my-auto w-full max-w-2xl space-y-6 xl:max-w-3xl xl:space-y-8">
        <section className="space-y-4 text-center">
          <h1 className="text-3xl font-semibold tracking-tight xl:text-4xl">
            {greeting()}
          </h1>
          <HeroComposer />
        </section>

        <section className="space-y-3">

          <div className="flex w-full flex-col items-center gap-2.5">
            {QUICK_ACTION_ROWS.map((row, rowIndex) => (
              <div key={`quick-action-row-${rowIndex}`} className="flex flex-row flex-wrap justify-center gap-2">
                {row.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.page, item.payload || null)}
                      className="flex h-8 w-fit max-w-full min-w-0 items-center justify-center rounded-full px-3 text-sm leading-none text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      <span className="font-medium">{item.title}</span>
                    </button>
                ))}
              </div>
            ))}
          </div>
        </section>
        </div>
      </div>

      {/* 아래쪽 peek 드로어 — 클릭하면 위로 슬라이드 */}
      <ContinueProjectsDrawer
        recentItems={recentItems}
        projects={projects}
        onActivity={() => navigate("activity")}
        onProjects={() => navigate("projects")}
        onOpenProject={openProject}
        onOpenRecent={openRecent}
      />

    </div>
  );
}

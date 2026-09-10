import { useEffect, useState } from "react";
import { Code2, FolderGit2, MessageSquare, Plus, RefreshCcw, Star, StickyNote, Trash2 } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Badge, Button, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { PROJECT_COLORS, useProjectsPageBridge, useProjectsStore, type ProjectItem } from "./projects-store";

/* ============================================================================
   프로젝트 화면.
   목록은 한 줄씩. 줄을 누르면 그 줄 아래에서만 자세히 열린다.
   카드 격자와 떠 있는 메뉴를 없애 한 화면에 담는다.
   ============================================================================ */

type TabId = "list" | "form";

function stamp(value: string): string {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function ProjectsPage() {
  useProjectsPageBridge();

  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const connected = bridgeStatus === "connected" && authStatus === "authenticated";

  const projects = useProjectsStore((state) => state.projects);
  const loading = useProjectsStore((state) => state.loading);
  const lastError = useProjectsStore((state) => state.lastError);
  const lastMessage = useProjectsStore((state) => state.lastMessage);
  const selectedKey = useProjectsStore((state) => state.selectedProjectKey);
  const store = useProjectsStore;

  const [tab, setTab] = useState<TabId>("list");
  const [openKey, setOpenKey] = useState("");

  useEffect(() => {
    if (connected) store.getState().loadProjects();
  }, [connected, store]);

  const selected = projects.find((item) => item.projectKey === selectedKey) || null;

  const openNew = () => {
    store.getState().resetForm();
    setTab("form");
  };
  const openEdit = (project: ProjectItem) => {
    store.getState().selectProject(project);
    setTab("form");
  };

  const tabs: ScreenTab[] = [
    { id: "list", label: "목록", icon: FolderGit2, badge: projects.length > 0 ? String(projects.length) : undefined },
    { id: "form", label: selected ? "수정" : "추가", icon: Plus }
  ];

  return (
    <Screen
      title="프로젝트"
      hint="로컬 폴더를 등록하면 질문·빌드·자동화가 같은 기준을 씁니다."
      actions={
        <>
          <Button variant="outline" size="sm" disabled={!connected || loading} onClick={() => store.getState().loadProjects()}>
            {loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 다시 조회
          </Button>
          <Button variant="primary" size="sm" onClick={openNew}>
            <Plus size={14} aria-hidden="true" /> 추가
          </Button>
        </>
      }
      notice={
        !connected ? (
          <ScreenNotice tone="warning">연결되지 않았습니다.</ScreenNotice>
        ) : lastError ? (
          <ScreenNotice tone="danger">{lastError}</ScreenNotice>
        ) : lastMessage ? (
          <ScreenNotice>{lastMessage}</ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="프로젝트 보기 종류" />
      {tab === "list" ? (
        <ProjectList
          projects={projects}
          connected={connected}
          openKey={openKey}
          onToggle={(key) => setOpenKey(openKey === key ? "" : key)}
          onEdit={openEdit}
          onAdd={openNew}
        />
      ) : (
        <ProjectForm connected={connected} selected={selected} onDone={() => setTab("list")} />
      )}
    </Screen>
  );
}

function ProjectList({
  projects,
  connected,
  openKey,
  onToggle,
  onEdit,
  onAdd
}: {
  projects: ProjectItem[];
  connected: boolean;
  openKey: string;
  onToggle: (key: string) => void;
  onEdit: (project: ProjectItem) => void;
  onAdd: () => void;
}) {
  const navigate = useDesktopNavigationStore((state) => state.setActivePage);
  const store = useProjectsStore;

  const go = (page: "ask" | "build" | "notebooks" | "planning", project: ProjectItem) => {
    store.getState().touchProject(project);
    navigate(page, {
      projectKey: project.projectKey,
      projectName: project.name,
      projectPath: project.path,
      ...(page === "planning" ? { create: true } : {})
    });
  };

  if (projects.length === 0) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
        <FolderGit2 size={26} className="text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">등록된 프로젝트가 없습니다</p>
        <p className="max-w-sm text-xs text-muted-foreground">로컬 폴더 경로를 등록하면 질문·빌드·자동화에서 같은 작업 기준을 씁니다.</p>
        <Button variant="primary" size="sm" onClick={onAdd}>
          <Plus size={14} aria-hidden="true" /> 프로젝트 추가
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <ul className="min-w-0 divide-y divide-border">
          {projects.map((project) => {
            const open = openKey === project.projectKey;
            return (
              <li key={project.projectKey} className="min-w-0">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => onToggle(project.projectKey)}
                  className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                >
                  {/* 프로젝트 색은 사용자가 고른 HEX 라 inline style 을 쓴다. */}
                  <span
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0 rounded-md"
                    style={{ backgroundColor: `${project.color}2e`, boxShadow: `inset 0 0 0 1px ${project.color}` }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-xs font-medium">{project.name}</span>
                      {project.isMain ? <Badge tone="primary">대표</Badge> : null}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">{project.path || "경로 없음"}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{stamp(project.lastOpenedUtc)}</span>
                </button>

                {open ? (
                  <div className="min-w-0 space-y-2 px-3 pb-3">
                    {project.description ? (
                      <p className="min-w-0 break-words text-[11px] text-muted-foreground">{project.description}</p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      실행 <b className="text-foreground">{project.runs}</b> · 루틴 <b className="text-foreground">{project.automations}</b>
                    </p>
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => go("ask", project)}>
                        <MessageSquare size={12} aria-hidden="true" /> 질문
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => go("build", project)}>
                        <Code2 size={12} aria-hidden="true" /> 빌드
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => go("notebooks", project)}>
                        <StickyNote size={12} aria-hidden="true" /> 노트
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onEdit(project)}>
                        수정
                      </Button>
                      {!project.isMain ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!connected}
                          onClick={() => {
                            store.getState().selectProject(project);
                            store.getState().updateSelectedProject(true);
                          }}
                        >
                          <Star size={12} aria-hidden="true" /> 대표로
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={!connected}
                        onClick={() => {
                          store.getState().selectProject(project);
                          store.getState().deleteSelectedProject();
                        }}
                      >
                        <Trash2 size={12} aria-hidden="true" /> 삭제
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ProjectForm({ connected, selected, onDone }: { connected: boolean; selected: ProjectItem | null; onDone: () => void }) {
  const form = useProjectsStore((state) => state.form);
  const pending = useProjectsStore((state) => state.pending);
  const store = useProjectsStore;
  const editing = selected !== null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="min-w-0 space-y-3 p-3">
          <p className="text-[11px] text-muted-foreground">로컬에 실제로 있는 폴더만 등록됩니다.</p>

          <label className="block min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">
            이름
            <Input className="h-8 text-xs" value={form.name} onChange={(event) => store.getState().setFormValue("name", event.target.value)} />
          </label>
          <label className="block min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">
            로컬 폴더 경로
            <Input
              className="h-8 font-mono text-xs"
              value={form.path}
              placeholder="/Users/…"
              onChange={(event) => store.getState().setFormValue("path", event.target.value)}
            />
          </label>
          <label className="block min-w-0 space-y-1 text-[11px] font-medium text-muted-foreground">
            설명
            <Textarea rows={2} className="text-xs" value={form.description} onChange={(event) => store.getState().setFormValue("description", event.target.value)} />
          </label>

          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">색</p>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  aria-label={`색 ${color}`}
                  aria-pressed={form.color === color}
                  onClick={() => store.getState().setFormValue("color", color)}
                  className={cn(
                    "h-7 w-7 rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring/60",
                    form.color === color ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 shrink-0 flex-wrap gap-2 border-t border-border p-3">
        {editing ? (
          <Button variant="primary" size="sm" disabled={!connected || pending} onClick={() => store.getState().updateSelectedProject(false)}>
            {pending ? <Spinner size={12} /> : null} 수정 저장
          </Button>
        ) : (
          <Button variant="primary" size="sm" disabled={!connected || pending} onClick={() => store.getState().createProject()}>
            {pending ? <Spinner size={12} /> : null} 등록
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            store.getState().resetForm();
            onDone();
          }}
        >
          {editing ? "수정 그만두기" : "지우기"}
        </Button>
      </div>
    </div>
  );
}

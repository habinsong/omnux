import { useEffect, useState } from "react";
import { Code2, FolderGit2, MessageSquare, Pencil, Plus, RefreshCcw, Star, Trash2, X } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { PROJECT_COLORS, useProjectsPageBridge, useProjectsStore, type ProjectItem } from "./projects-store";
import { Badge, Button, EmptyState, IconButton, Input, Textarea, cn } from "../../components/ui/primitives";

const FIELD_LABEL = "block space-y-1 text-xs font-semibold text-muted-foreground";

function formatDate(value: string) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function ProjectCard({
  project,
  disabled,
  onAsk,
  onBuild,
  onOpen,
  onEdit,
  onMain,
  onDelete
}: {
  project: ProjectItem;
  disabled: boolean;
  onAsk: () => void;
  onBuild: () => void;
  onOpen: (project: ProjectItem) => void;
  onEdit: (project: ProjectItem) => void;
  onMain: (project: ProjectItem) => void;
  onDelete: (project: ProjectItem) => void;
}) {
  const stop = (event: React.MouseEvent, fn: () => void) => {
    event.stopPropagation();
    fn();
  };
  return (
    <article
      onClick={() => onOpen(project)}
      className="flex cursor-pointer flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong"
    >
      <div className="flex items-start justify-between">
        {/* 동적 프로젝트 컬러: 사용자 지정 HEX → inline style 불가피 */}
        <span className="flex h-11 w-11 items-center justify-center rounded-lg" style={{ backgroundColor: `${project.color}1f`, color: project.color }}>
          <FolderGit2 size={21} aria-hidden="true" />
        </span>
        {project.isMain ? (
          <Badge tone="primary">
            <Star size={11} aria-hidden="true" /> 대표
          </Badge>
        ) : (
          <IconButton icon={Trash2} label="삭제" disabled={disabled} onClick={(event) => stop(event, () => onDelete(project))} />
        )}
      </div>

      <div className="min-w-0 space-y-1">
        <h2 className="truncate text-sm font-semibold">{project.name}</h2>
        <p className="line-clamp-2 text-xs text-muted-foreground">{project.description || "등록된 로컬 프로젝트"}</p>
        <div className="truncate font-mono text-[11px] text-muted-foreground">{project.path || "-"}</div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          <b className="text-foreground">{project.runs}</b> runs
        </span>
        <span>
          <b className="text-foreground">{project.automations}</b> automations
        </span>
        <span className="ml-auto">{formatDate(project.lastOpenedUtc)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <Button variant="outline" size="sm" onClick={(event) => stop(event, onAsk)}>
          <MessageSquare size={14} aria-hidden="true" /> Ask
        </Button>
        <Button variant="outline" size="sm" onClick={(event) => stop(event, onBuild)}>
          <Code2 size={14} aria-hidden="true" /> Build
        </Button>
        <Button variant="ghost" size="sm" onClick={(event) => stop(event, () => onEdit(project))}>
          <Pencil size={14} aria-hidden="true" /> 수정
        </Button>
        {!project.isMain ? (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={(event) => stop(event, () => onMain(project))}>
            <Star size={14} aria-hidden="true" /> 대표
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function ProjectsPage() {
  useProjectsPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const navigate = useDesktopNavigationStore((state) => state.setActivePage);
  const store = useProjectsStore();
  const [editorOpen, setEditorOpen] = useState(false);
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const selectedProject = store.projects.find((item) => item.projectKey === store.selectedProjectKey) || null;

  useEffect(() => {
    if (canRequest) store.loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  const openNewProjectEditor = () => {
    store.resetForm();
    setEditorOpen(true);
  };
  const openProjectEditor = (project: ProjectItem) => {
    store.selectProject(project);
    setEditorOpen(true);
  };
  const setMainProject = (project: ProjectItem) => {
    store.selectProject(project);
    store.updateSelectedProject(true);
  };
  const deleteProject = (project: ProjectItem) => {
    store.selectProject(project);
    void store.deleteSelectedProject();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">프로젝트</h1>
          <p className="text-sm text-muted-foreground">존재하는 로컬 폴더를 등록하고, 마지막 사용 시각과 대표 상태를 실제 백엔드 결과로 갱신합니다.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" disabled={!canRequest || store.loading} onClick={store.loadProjects}>
            <RefreshCcw size={15} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
          </Button>
          <Button variant="primary" onClick={openNewProjectEditor}>
            <Plus size={16} aria-hidden="true" /> 프로젝트 추가
          </Button>
        </div>
      </div>

      {store.lastError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p>
      ) : null}
      {store.lastMessage ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.lastMessage}</p>
      ) : null}

      {editorOpen ? (
        <CardBoundary title={selectedProject ? "프로젝트 수정" : "프로젝트 등록"} card="operations" onError={recordCardError}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">로컬에 실제 존재하는 폴더만 등록됩니다. 등록 결과는 백엔드 projects_state 응답으로 확정합니다.</p>
            <IconButton icon={X} label="닫기" onClick={() => setEditorOpen(false)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={FIELD_LABEL}>
              이름
              <Input value={store.form.name} onChange={(event) => store.setFormValue("name", event.target.value)} />
            </label>
            <label className={FIELD_LABEL}>
              로컬 폴더 경로
              <Input value={store.form.path} onChange={(event) => store.setFormValue("path", event.target.value)} />
            </label>
            <label className={cn(FIELD_LABEL, "sm:col-span-2")}>
              설명
              <Textarea rows={2} value={store.form.description} onChange={(event) => store.setFormValue("description", event.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => store.setFormValue("color", color)}
                title={color}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  store.form.color === color ? "border-primary text-foreground" : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                {color}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button variant="primary" size="sm" onClick={store.createProject} disabled={!canRequest || store.pending || !!selectedProject}>
              등록
            </Button>
            <Button variant="outline" size="sm" onClick={() => store.updateSelectedProject(false)} disabled={!canRequest || store.pending || !selectedProject}>
              수정
            </Button>
            <Button variant="outline" size="sm" onClick={() => store.updateSelectedProject(true)} disabled={!canRequest || store.pending || !selectedProject || selectedProject.isMain}>
              대표 지정
            </Button>
          </div>
        </CardBoundary>
      ) : null}

      {store.projects.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="등록된 프로젝트가 없습니다"
          description="로컬 폴더 경로를 등록하면 Ask, Build, Automate에서 같은 프로젝트를 사용할 수 있습니다."
          action={
            <Button variant="primary" size="sm" onClick={openNewProjectEditor}>
              <Plus size={15} aria-hidden="true" /> 프로젝트 추가
            </Button>
          }
        />
      ) : (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {store.projects.map((project) => (
            <ProjectCard
              key={project.projectKey}
              project={project}
              disabled={!canRequest}
              onOpen={store.touchProject}
              onAsk={() => navigate("ask")}
              onBuild={() => navigate("build")}
              onEdit={openProjectEditor}
              onMain={setMainProject}
              onDelete={deleteProject}
            />
          ))}
          <button
            type="button"
            onClick={openNewProjectEditor}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/40 p-4 text-center text-muted-foreground transition-colors duration-200 hover:border-primary/50 hover:text-foreground"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Plus size={20} aria-hidden="true" />
            </span>
            <b className="text-sm">프로젝트 추가</b>
            <span className="text-xs">로컬 폴더를 지정해 시작하세요.</span>
          </button>
        </section>
      )}
    </div>
  );
}

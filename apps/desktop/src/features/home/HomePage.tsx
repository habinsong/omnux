import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Code2,
  Cpu,
  FileText,
  FolderGit2,
  FolderOpen,
  Gauge,
  Inbox,
  MessageSquare,
  Paperclip,
  RefreshCcw,
  Scale,
  Send,
  SlidersHorizontal,
  Sparkles
} from "lucide-react";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore, type ShellLogEntry } from "../ui-log/ui-log-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import type { DesktopPageId } from "../shell/DesktopNavigation";
import type { DesktopRoutePayload } from "../shell/navigation-store";
import { useProjectsPageBridge, useProjectsStore, type ProjectItem } from "../projects/projects-store";
import { useGitAutomationBridge, useOpsPageStore } from "../ops/ops-store";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  SectionLabel,
  Textarea,
  cn
} from "../../components/ui/primitives";

type QuickAction = {
  id: string;
  title: string;
  description: string;
  page: DesktopPageId;
  payload?: DesktopRoutePayload;
  icon: typeof MessageSquare;
  tone: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: "ask", title: "AI에게 질문", description: "답변·설명·요약·아이디어를 얻으세요.", page: "ask", icon: MessageSquare, tone: "violet" },
  { id: "build", title: "코드 작업", description: "코드를 편집·리팩터·디버그하고 빌드하세요.", page: "build", icon: Code2, tone: "blue" },
  { id: "file", title: "파일 분석", description: "문서·로그·이미지·데이터를 분석하세요.", page: "ask", payload: { mode: "file", openAttachmentPanel: true }, icon: FileText, tone: "amber" },
  { id: "automate", title: "자동화 만들기", description: "작업을 자동화하고 텔레그램과 연결하세요.", page: "automate", payload: { create: true }, icon: Bot, tone: "indigo" },
  { id: "compare", title: "모델 비교", description: "여러 LLM의 응답을 비교하세요.", page: "ask", payload: { mode: "compare" }, icon: Scale, tone: "teal" },
  { id: "project", title: "프로젝트 열기", description: "기존 프로젝트를 이어서 작업하세요.", page: "projects", icon: FolderOpen, tone: "green" }
];

const TONE_CLASS: Record<string, string> = {
  violet: "bg-violet-500/12 text-violet-500",
  blue: "bg-blue-500/12 text-blue-500",
  amber: "bg-amber-500/12 text-amber-500",
  indigo: "bg-indigo-500/12 text-indigo-500",
  teal: "bg-teal-500/12 text-teal-500",
  green: "bg-emerald-500/12 text-emerald-500"
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "좋은 아침이에요";
  if (hour < 18) return "좋은 오후예요";
  return "좋은 저녁이에요";
}

function formatLogTime(value: string) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return value || "-";
  return parsed.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatProjectTime(value: string) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "등록됨";
  return parsed.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function logTone(level: ShellLogEntry["level"]): "destructive" | "warning" | "success" {
  if (level === "error") return "destructive";
  if (level === "warn") return "warning";
  return "success";
}

function inferHeroIntent(input: string): { page: DesktopPageId; label: string; description: string; payload: DesktopRoutePayload } {
  const text = input.trim();
  const normalized = text.toLowerCase();
  const base = text ? { input: text } : {};
  if (/(자동화|루틴|예약|매일|매주|telegram|텔레그램|알림|schedule|routine|automate)/.test(normalized)) {
    return { page: "automate", label: "자동화", description: "새 루틴 초안으로 이어집니다.", payload: { ...base, create: true } };
  }
  if (/(코드|빌드|구현|수정|디버그|리팩터|파일 고쳐|build|code|debug|fix|refactor)/.test(normalized)) {
    return { page: "build", label: "빌드", description: "코드 작업 초안으로 이어집니다.", payload: base };
  }
  if (/(비교|compare|multi|여러 모델|모델별)/.test(normalized)) {
    return { page: "ask", label: "모델 비교", description: "Ask multi 비교 모드로 이어집니다.", payload: { ...base, mode: "compare" } };
  }
  if (/(파일|문서|로그|첨부|이미지|pdf|csv|file|document|log|image)/.test(normalized)) {
    return { page: "ask", label: "파일 분석", description: "첨부 패널이 열린 Ask로 이어집니다.", payload: { ...base, mode: "file", openAttachmentPanel: true } };
  }
  return { page: "ask", label: "질문", description: "Ask 초안으로 이어집니다.", payload: base };
}

function parseMetricsRaw(raw: string) {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function findMetric(root: unknown, terms: string[]): { key: string; value: unknown } | null {
  if (!root || typeof root !== "object") return null;
  const normalizedTerms = terms.map((term) => term.toLowerCase());
  const stack: unknown[] = [root];
  const seen = new Set<unknown>();
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (normalizedTerms.some((term) => normalizedKey.includes(term))) return { key, value: child };
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return null;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value < 1024) return `${Math.round(value)}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function formatMetric(hit: { key: string; value: unknown } | null) {
  if (!hit) return "-";
  if (typeof hit.value === "number") {
    if (/bytes|memory|rss|heap|working/i.test(hit.key)) return formatBytes(hit.value);
    if (/percent|cpu/i.test(hit.key) && hit.value <= 100) return `${Math.round(hit.value * 10) / 10}%`;
    return String(Math.round(hit.value * 10) / 10);
  }
  if (typeof hit.value === "string") return hit.value.trim() || "-";
  if (typeof hit.value === "boolean") return hit.value ? "on" : "off";
  if (hit.value && typeof hit.value === "object") {
    return Object.keys(hit.value as Record<string, unknown>).slice(0, 3).join(", ") || "-";
  }
  return "-";
}

function ResourceUsageCard({ canRequest }: { canRequest: boolean }) {
  useGitAutomationBridge();
  const metrics = useOpsPageStore((state) => state.tools.context.metrics);
  const loading = useOpsPageStore((state) => state.tools.context.setupLoading);
  const lastError = useOpsPageStore((state) => state.tools.context.lastError);
  const loadMetrics = useOpsPageStore((state) => state.loadMetrics);
  const parsed = useMemo(() => parseMetricsRaw(metrics?.raw || ""), [metrics?.raw]);
  const cpu = formatMetric(findMetric(parsed, ["cpu", "processor"]));
  const memory = formatMetric(findMetric(parsed, ["memory", "mem", "rss", "heap"]));
  const tasks = formatMetric(findMetric(parsed, ["task", "running", "process"]));

  useEffect(() => {
    if (canRequest && !metrics && !loading) loadMetrics();
  }, [canRequest, loadMetrics, loading, metrics]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>리소스 사용량</CardTitle>
        <Button variant="ghost" size="sm" onClick={loadMetrics} disabled={!canRequest || loading}>
          <RefreshCcw size={14} aria-hidden="true" /> {loading ? "조회 중" : "갱신"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "CPU", value: cpu, icon: Cpu },
            { label: "메모리", value: memory, icon: Gauge },
            { label: "작업", value: tasks, icon: Bot }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="min-w-0 rounded-md border border-border bg-muted/30 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Icon size={12} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </div>
                <b className="mt-1 block truncate text-sm tabular-nums">{item.value}</b>
              </article>
            );
          })}
        </div>
        <p className="truncate text-xs text-muted-foreground">{metrics?.summary || (lastError ? lastError : "미들웨어 지표를 조회하면 표시됩니다.")}</p>
      </CardContent>
    </Card>
  );
}

export function HomePage() {
  useProjectsPageBridge();

  const navigate = useDesktopNavigationStore((state) => state.setActivePage);
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const logs = useUiLogStore((state) => state.logs);
  const projects = useProjectsStore((state) => state.projects);
  const projectsLoading = useProjectsStore((state) => state.loading);
  const loadProjects = useProjectsStore((state) => state.loadProjects);
  const touchProject = useProjectsStore((state) => state.touchProject);
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const [heroInput, setHeroInput] = useState("");

  useEffect(() => {
    if (canRequest && !projectsLoading && projects.length === 0) {
      loadProjects();
    }
  }, [canRequest, loadProjects, projects.length, projectsLoading]);

  const recentLogs = useMemo(() => logs.slice(0, 5), [logs]);
  const heroIntent = useMemo(() => inferHeroIntent(heroInput), [heroInput]);

  const runHeroIntent = () => {
    navigate(heroIntent.page, heroIntent.payload);
  };

  const openProject = (project: ProjectItem) => {
    touchProject(project);
    navigate("build", {
      projectKey: project.projectKey,
      projectName: project.name,
      projectPath: project.path
    });
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1200px] flex-col gap-8 px-6 py-10">
      {/* Greeting + hero command input */}
      <section className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, habinsong <span aria-hidden="true">👋</span>
          </h1>
          <p className="text-sm text-muted-foreground">오늘은 무엇을 해볼까요?</p>
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Sparkles size={20} aria-hidden="true" />
            </span>
            <Textarea
              aria-label="omnux 명령 입력"
              rows={2}
              value={heroInput}
              onChange={(event) => setHeroInput(event.target.value)}
              placeholder="omnux에게 무엇이든 물어보세요... 하고 싶은 일을 말해주세요."
              className="border-0 px-0 py-1 focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  runHeroIntent();
                }
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
            <Badge tone="primary" className="max-w-[220px] truncate" title={heroIntent.description}>
              {heroIntent.label}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => navigate("ask", { input: heroInput, mode: "file", openAttachmentPanel: true })}>
              <Paperclip size={15} aria-hidden="true" /> 파일 첨부
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("projects")}>
              <FolderGit2 size={15} aria-hidden="true" /> 프로젝트 선택
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("settings")}>
              <SlidersHorizontal size={15} aria-hidden="true" /> 모델 선택
            </Button>
            <Button variant="primary" size="icon" className="ml-auto" aria-label={`${heroIntent.label} 열기`} onClick={runHeroIntent}>
              <Send size={17} aria-hidden="true" />
            </Button>
          </div>
        </Card>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          {/* Quick start */}
          <section className="space-y-3">
            <SectionLabel>빠른 시작</SectionLabel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {QUICK_ACTIONS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.page, item.payload || null)}
                    className="group relative flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md active:scale-[0.99] dark:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", TONE_CLASS[item.tone])}>
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <b className="text-sm font-semibold">{item.title}</b>
                    <p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                    <ArrowUpRight
                      size={15}
                      aria-hidden="true"
                      className="absolute right-3 top-3 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Continue + active projects */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>이어서 작업하기</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate("activity")}>
                  모든 활동 보기
                </Button>
              </CardHeader>
              <CardContent className="space-y-1">
                {recentLogs.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    onClick={() => navigate("activity")}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-200 hover:bg-accent"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <MessageSquare size={15} aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{log.message}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {log.source} · {formatLogTime(log.createdAt)}
                      </span>
                    </span>
                    <Badge tone={logTone(log.level)} className="ml-auto shrink-0">
                      {log.level}
                    </Badge>
                  </button>
                ))}
                {recentLogs.length === 0 ? (
                  <EmptyState icon={Inbox} title="아직 실행 기록이 없습니다" description="질문하거나 빌드를 실행하면 여기에 활동이 쌓입니다." />
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>활성 프로젝트</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate("projects")}>
                  전체 보기
                </Button>
              </CardHeader>
              <CardContent className="space-y-1">
                {projects.slice(0, 4).map((project) => (
                  <button
                    key={project.projectKey}
                    type="button"
                    onClick={() => openProject(project)}
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
                      <Button variant="primary" size="sm" onClick={() => navigate("projects")}>
                        <FolderGit2 size={15} aria-hidden="true" /> 프로젝트 등록
                      </Button>
                    }
                  />
                ) : null}
              </CardContent>
            </Card>
          </section>
        </div>

        <aside className="space-y-4">
          <ResourceUsageCard canRequest={canRequest} />
        </aside>
      </div>
    </div>
  );
}

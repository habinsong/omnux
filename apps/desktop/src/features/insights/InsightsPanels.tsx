import type { ReactNode } from "react";
import { BrainCircuit, Clock, GitBranch, Map as MapIcon, Play, Route, Send, ShieldCheck, Square, Wrench } from "lucide-react";
import { Badge, Button } from "../../components/ui/primitives";
import type { CodingExecution, CodingResult, CodingRuntime } from "../build/build-store";
import type {
  GitTimeMachineSnapshot,
  InsightsDoctorSnapshot,
  LocalLlmSnapshot,
  McpSnapshot,
  RepomapSnapshot,
  SemanticSnapshot,
  TelemetryTraceEvent,
  TelemetrySnapshot,
  TerminalSnapshot
} from "./insights-store";

export function statusTone(status: string): "success" | "warning" | "destructive" | "primary" | "default" | "outline" {
  const v = status.toLowerCase();
  if (/(available|ok|ready|clean|ready_for_manual_routing)/.test(v)) return "success";
  if (/(discovered|ready_to_launch|snapshot_only|remote_unverified|skipped)/.test(v)) return "primary";
  if (/(blocked|error|fail|unavailable|invalid)/.test(v)) return "destructive";
  if (/(unverified|pending|warn)/.test(v)) return "warning";
  if (/(missing|empty|disabled)/.test(v)) return "outline";
  return "default";
}

function formatBytes(value: number): string {
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function shortDate(value: string): string {
  if (!value) return "date -";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function shortTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function average(items: number[]): number {
  if (items.length === 0) return 0;
  return Math.round(items.reduce((sum, value) => sum + value, 0) / items.length);
}

function isAttentionStatus(status: string, error = ""): boolean {
  return /(error|fail|failed|timeout|cancel|aborted|quality_failed|blocked)/i.test(`${status} ${error}`);
}

function executionText(execution: CodingExecution | null | undefined): string {
  if (!execution) return "";
  return [execution.stdout, execution.stderr].filter(Boolean).join("\n");
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{value}</div>
      {sub ? <div className="truncate text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function Row({ left, right, sub }: { left: string; right: ReactNode; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/60 px-2.5 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{left}</div>
        {sub ? <div className="truncate text-[11px] text-muted-foreground">{sub}</div> : null}
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return <p className="py-4 text-center text-xs text-muted-foreground">{label}</p>;
}

export function TelemetryPanel({ telemetry }: { telemetry: TelemetrySnapshot | null }) {
  if (!telemetry) return <Empty label="새로고침하면 제공자별 사용량과 지연 시간이 표시됩니다." />;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="총 호출" value={telemetry.totalEvents} />
        <Stat label="총 사용량" value={telemetry.total.totalTokens.toLocaleString()} />
        <Stat label="평균 지연" value={`${telemetry.total.averageDurationMs}ms`} />
      </div>
      <div className="space-y-1">
        {telemetry.providers.map((provider) => (
          <Row
            key={provider.provider}
            left={provider.provider}
            sub={`${provider.eventCount}회 · 평균 ${provider.averageDurationMs}ms`}
            right={<Badge tone="primary">사용량 {provider.totalTokens.toLocaleString()}</Badge>}
          />
        ))}
        {telemetry.providers.length === 0 ? <Empty label="호출 기록 없음" /> : null}
      </div>
    </>
  );
}

type RouteMetric = {
  key: string;
  provider: string;
  model: string;
  source: string;
  eventCount: number;
  totalTokens: number;
  averageDurationMs: number;
  maxDurationMs: number;
  attentionCount: number;
  cascadeCount: number;
  streamingCount: number;
  cacheEligibleCount: number;
  complexity: string;
  recommendedTier: string;
  lastReason: string;
  lastCompletedUtc: string;
};

function buildRouteMetrics(events: TelemetryTraceEvent[]): RouteMetric[] {
  const map = new Map<string, RouteMetric & { durations: number[] }>();
  for (const event of events) {
    const provider = event.provider || "provider -";
    const model = event.model || "model -";
    const source = event.source || "source -";
    const key = `${provider}\u0000${model}\u0000${source}`;
    const row = map.get(key) ?? {
      key,
      provider,
      model,
      source,
      eventCount: 0,
      totalTokens: 0,
      averageDurationMs: 0,
      maxDurationMs: 0,
      attentionCount: 0,
      cascadeCount: 0,
      streamingCount: 0,
      cacheEligibleCount: 0,
      complexity: "",
      recommendedTier: "",
      lastReason: "",
      lastCompletedUtc: "",
      durations: []
    };
    row.eventCount += 1;
    row.totalTokens += event.totalTokens;
    row.durations.push(event.durationMs);
    row.maxDurationMs = Math.max(row.maxDurationMs, event.durationMs);
    row.attentionCount += isAttentionStatus(event.status, event.error) ? 1 : 0;
    row.cascadeCount += event.modelRoutingCascadeEligible ? 1 : 0;
    row.streamingCount += event.streaming ? 1 : 0;
    row.cacheEligibleCount += event.promptCacheEligible ? 1 : 0;
    row.complexity = event.modelRoutingComplexity || row.complexity;
    row.recommendedTier = event.modelRoutingRecommendedTier || row.recommendedTier;
    row.lastReason = event.modelRoutingReason || event.modelRoutingSignals || row.lastReason;
    row.lastCompletedUtc = event.completedUtc || event.startedUtc || row.lastCompletedUtc;
    map.set(key, row);
  }
  return Array.from(map.values())
    .map(({ durations, ...row }) => ({ ...row, averageDurationMs: average(durations) }))
    .sort((a, b) => b.eventCount - a.eventCount || b.totalTokens - a.totalTokens);
}

export function RouteMetricsPanel({ telemetry }: { telemetry: TelemetrySnapshot | null }) {
  if (!telemetry) return <Empty label="새로고침하면 작업 경로별 호출 기록이 표시됩니다." />;
  const events = telemetry.events;
  if (events.length === 0) return <Empty label="최근 호출 기록이 없어 작업 경로를 계산할 수 없습니다." />;
  const routes = buildRouteMetrics(events);
  const attentionCount = events.filter((event) => isAttentionStatus(event.status, event.error)).length;
  const cascadeCount = events.filter((event) => event.modelRoutingCascadeEligible).length;
  const cacheEligibleCount = events.filter((event) => event.promptCacheEligible).length;
  const signalEvents = events.filter((event) => event.modelRoutingReason || event.modelRoutingSignals).slice(0, 5);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary"><Route size={11} aria-hidden="true" /> 호출 기록</Badge>
        <Badge tone="outline">{telemetry.filteredEvents || events.length}/{telemetry.totalEvents || events.length} 표시</Badge>
        <Badge tone="outline">{shortTime(telemetry.snapshotUtc)} 기준</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="경로" value={routes.length} sub={`${events.length}건`} />
        <Stat label="주의" value={attentionCount} sub="오류/시간 초과/품질" />
        <Stat label="연결 후보" value={cascadeCount} sub="이어 실행 가능" />
        <Stat label="캐시" value={cacheEligibleCount} sub="입력 캐시 후보" />
      </div>
      <div className="space-y-1">
        {routes.slice(0, 8).map((route) => (
          <Row
            key={route.key}
            left={`${route.provider}:${route.model}`}
            sub={`${route.source} · ${route.recommendedTier || "등급 -"} · ${route.complexity || "복잡도 -"} · 평균 ${route.averageDurationMs}ms · 사용량 ${route.totalTokens.toLocaleString()}`}
            right={
              <div className="flex shrink-0 items-center gap-1">
                {route.attentionCount > 0 ? <Badge tone="destructive">문제 {route.attentionCount}</Badge> : null}
                {route.cascadeCount > 0 ? <Badge tone="primary">연결 {route.cascadeCount}</Badge> : null}
                {route.cacheEligibleCount > 0 ? <Badge tone="success">캐시 {route.cacheEligibleCount}</Badge> : null}
                {route.streamingCount > 0 ? <Badge tone="outline">스트림 {route.streamingCount}</Badge> : null}
                <Badge tone={route.cascadeCount > 0 ? "primary" : "outline"}>호출 {route.eventCount}</Badge>
              </div>
            }
          />
        ))}
      </div>
      <div className="space-y-1">
        {signalEvents.map((event) => (
          <Row
            key={`signal-${event.id}`}
            left={event.modelRoutingReason || event.modelRoutingSignals || "경로 신호"}
            sub={`${event.provider}:${event.model} · ${event.modelRoutingComplexity || "복잡도 -"} · ${event.source || "출처 -"}`}
            right={<Badge tone={event.modelRoutingCascadeEligible ? "primary" : "outline"}>{event.modelRoutingRecommendedTier || "등급 -"}</Badge>}
          />
        ))}
        {signalEvents.length === 0 ? <Empty label="경로 판단 사유가 포함된 호출 기록 없음" /> : null}
      </div>
    </>
  );
}

const SANDBOX_LIMITS = [
  { key: "timeout", label: "제한 시간", value: "10s", detail: "실행 제한 기본값" },
  { key: "memory", label: "메모리 상한", value: "200 MB", detail: "RLIMIT_AS 기본값" },
  { key: "cpu", label: "CPU 시간", value: "10s", detail: "RLIMIT_CPU 기본값" }
];

export function SandboxQualityPanel({ doctor }: { doctor: InsightsDoctorSnapshot }) {
  const report = doctor.report;
  const sandbox = report?.checks.find((check) => check.id === "sandbox") ?? null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={sandbox ? statusTone(sandbox.status) : doctor.found === false ? "outline" : "warning"}>
          <ShieldCheck size={11} aria-hidden="true" /> {sandbox?.status || (doctor.found === false ? "보고서 없음" : "대기")}
        </Badge>
        <Badge tone="outline">최근 진단</Badge>
        <Badge tone="outline">{report ? shortTime(report.createdAtUtc) : "보고서 -"}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SANDBOX_LIMITS.map((limit) => <Stat key={limit.key} label={limit.label} value={limit.value} sub={limit.detail} />)}
      </div>
      {sandbox ? (
        <div className="space-y-1">
          <Row
            left={sandbox.summary || "샌드박스 점검"}
            sub={sandbox.detail || "최근 진단의 샌드박스 항목"}
            right={<Badge tone={statusTone(sandbox.status)}>{sandbox.status || "-"}</Badge>}
          />
          {sandbox.suggestedActions.slice(0, 4).map((action) => (
            <Row key={action} left="제안" sub={action} right={<Badge tone="warning">검토</Badge>} />
          ))}
        </div>
      ) : (
        <Empty label={doctor.found === false ? "저장된 진단 보고서가 없어 샌드박스 결과를 표시할 수 없습니다." : "최근 진단 보고서를 조회 중입니다."} />
      )}
      <div className="space-y-1">
        <Row
          left="실행 격리"
          sub="임시 작업 폴더, HOME/TMP 격리, 사용자 site-package 차단"
          right={<Badge tone="success">설정됨</Badge>}
        />
        <Row
          left="사용량 기록"
          sub="실행별 실제 RSS/CPU 사용량 WS 계약은 아직 없습니다."
          right={<Badge tone="outline">계약 없음</Badge>}
        />
      </div>
    </>
  );
}

type RepairTimelineItem = {
  id: string;
  title: string;
  detail: string;
  source: string;
  status: string;
  time: string;
  tone: "success" | "warning" | "destructive" | "primary" | "default" | "outline";
};

function repairMarkerItems(
  key: string,
  label: string,
  execution: CodingExecution | null | undefined,
  summary = ""
): RepairTimelineItem[] {
  const items: RepairTimelineItem[] = [];
  const status = execution?.status || "";
  const text = `${summary}\n${executionText(execution)}`;
  if (/deterministic_repair/i.test(text)) {
    items.push({
      id: `${key}-deterministic`,
      title: "deterministic repair",
      detail: label,
      source: "Build result",
      status: status || "repair",
      time: "최근 Build",
      tone: "primary"
    });
  }
  if (/\[repair-pass\]/i.test(text)) {
    items.push({
      id: `${key}-repair-pass`,
      title: "repair pass",
      detail: label,
      source: "Build result",
      status: status || "repair",
      time: "최근 Build",
      tone: "success"
    });
  }
  if (/\[quality-gate\]/i.test(text) || /quality_failed/i.test(status)) {
    items.push({
      id: `${key}-quality`,
      title: "quality gate",
      detail: label,
      source: "Build result",
      status: status || "quality",
      time: "최근 Build",
      tone: /failed|quality_failed/i.test(`${status} ${text}`) ? "destructive" : "success"
    });
  }
  if (isAttentionStatus(status, execution?.stderr || "")) {
    items.push({
      id: `${key}-attention`,
      title: "execution attention",
      detail: `${label} · exit=${execution?.exitCode ?? "-"}`,
      source: "Build execution",
      status: status || "attention",
      time: "최근 Build",
      tone: "warning"
    });
  }
  return items;
}

function buildRepairTimeline(
  telemetry: TelemetrySnapshot | null,
  result: CodingResult | null,
  runtime: CodingRuntime | null
): RepairTimelineItem[] {
  const items: RepairTimelineItem[] = [];
  if (result) {
    items.push(...repairMarkerItems("main", "Main result", result.execution, result.summary || result.commonSummary));
    result.workers.forEach((worker, index) => {
      items.push(...repairMarkerItems(`worker-${index}`, worker.role || `Worker ${index + 1}`, worker.execution, worker.summary));
    });
    if (result.retryRequired || result.retryAttempt > 0 || result.retryStopReason) {
      items.push({
        id: "retry-policy",
        title: result.retryRequired ? "retry required" : "retry policy",
        detail: [result.retryAction, result.retryScope, result.retryReason || result.retryStopReason].filter(Boolean).join(" · ") || "retry metadata",
        source: "Coding result",
        status: `${result.retryAttempt}/${result.retryMaxAttempts || "-"}`,
        time: "최근 Build",
        tone: result.retryRequired ? "warning" : "outline"
      });
    }
    if (result.citationValidationPassed === false) {
      items.push({
        id: "citation-validation",
        title: "citation validation",
        detail: result.citationValidationReason || "citation validation failed",
        source: "Coding quality",
        status: "failed",
        time: "최근 Build",
        tone: "destructive"
      });
    }
  }
  if (runtime?.execution) {
    items.push(...repairMarkerItems("runtime", runtime.message || "Runtime execution", runtime.execution, runtime.message));
  }
  const telemetryCandidates = (telemetry?.events ?? [])
    .filter((event) => isAttentionStatus(event.status, event.error) && /(coding|build|code|worker)/i.test(`${event.source} ${event.operation}`))
    .slice(0, 5);
  telemetryCandidates.forEach((event) => {
    items.push({
      id: `telemetry-${event.id}`,
      title: "route failure candidate",
      detail: `${event.provider}:${event.model} · ${event.error || event.source || event.operation}`,
      source: "Telemetry",
      status: event.status || "error",
      time: shortTime(event.completedUtc || event.startedUtc),
      tone: "destructive"
    });
  });
  return items.slice(0, 12);
}

export function RepairTimelinePanel({
  telemetry,
  result,
  runtime
}: {
  telemetry: TelemetrySnapshot | null;
  result: CodingResult | null;
  runtime: CodingRuntime | null;
}) {
  const items = buildRepairTimeline(telemetry, result, runtime);
  const qualityCount = items.filter((item) => /quality|citation/i.test(item.title)).length;
  const repairCount = items.filter((item) => /repair|retry/i.test(item.title)).length;
  const attentionCount = items.filter((item) => item.tone === "destructive" || item.tone === "warning").length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning"><Wrench size={11} aria-hidden="true" /> 전용 기록 없음</Badge>
        <Badge tone="primary">빌드/호출 기록 기반</Badge>
        <Badge tone={result ? "success" : "outline"}>{result ? "최근 빌드 있음" : "빌드 결과 없음"}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="복구" value={repairCount} sub="표식/재시도" />
        <Stat label="품질" value={qualityCount} sub="게이트/근거" />
        <Stat label="주의" value={attentionCount} sub="오류/시간 초과" />
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <Row
            key={item.id}
            left={item.title}
            sub={`${item.source} · ${item.detail}`}
            right={
              <div className="flex shrink-0 items-center gap-1">
                <Badge tone="outline"><Clock size={11} aria-hidden="true" /> {item.time}</Badge>
                <Badge tone={item.tone}>{item.status || "-"}</Badge>
              </div>
            }
          />
        ))}
        {items.length === 0 ? <Empty label="최근 빌드 결과와 호출 기록에서 복구/품질 표식이 발견되지 않았습니다." /> : null}
      </div>
    </>
  );
}

export function GitTimeMachinePanel({ git }: { git: GitTimeMachineSnapshot | null }) {
  if (!git) return <Empty label="새로고침하면 브랜치·커밋 체크포인트가 표시됩니다." />;
  if (!git.isRepository) return <Empty label="workspace가 git 저장소가 아닙니다." />;
  const blocked = git.readiness.blockers.length > 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline"><GitBranch size={11} aria-hidden="true" /> {git.branchName}</Badge>
        <Badge tone="outline" className="font-mono">{git.headShortHash}</Badge>
        <Badge tone={statusTone(git.readiness.status)}>{git.readiness.status || "status -"}</Badge>
        <Badge tone={git.readOnly ? "outline" : "warning"}>{git.readOnly ? "읽기 전용" : "변경 가능"}</Badge>
        <Badge tone={git.isClean ? "success" : "warning"}>{git.isClean ? "깨끗함" : `변경 ${git.changedFileCount}`}</Badge>
        {git.checkpointsTruncated ? <Badge tone="warning">일부만 표시</Badge> : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="변경 파일" value={git.changedFileCount} sub={git.diffShortStat || "worktree"} />
        <Stat label="충돌" value={git.conflictedFileCount} sub={blocked ? git.readiness.blockers.join(", ") : "blocker 없음"} />
        <Stat label="체크포인트" value={git.checkpoints.length} sub={`표시 ${git.limit || "-"}`} />
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">
        <Badge tone={git.readiness.rollbackAvailable ? "primary" : "outline"}>
          되돌리기 {git.readiness.rollbackAvailable ? "검토 가능" : "보류"}
        </Badge>
        {git.readiness.snapshotCreationRecommended ? <Badge tone="warning">체크포인트 권장</Badge> : null}
        {git.suggestedSnapshotBranch ? <Badge tone="outline" className="max-w-full truncate">{git.suggestedSnapshotBranch}</Badge> : null}
        {git.readiness.blockers.map((blocker) => <Badge key={blocker} tone="destructive" className="max-w-full truncate">{blocker}</Badge>)}
        {git.warnings.map((warning) => <Badge key={warning} tone="warning" className="max-w-full truncate">{warning}</Badge>)}
      </div>
      <div className="space-y-1">
        {git.checkpoints.slice(0, 8).map((checkpoint) => (
          <Row
            key={checkpoint.shortHash}
            left={checkpoint.subject}
            sub={`${checkpoint.authorName || "author -"} · ${shortDate(checkpoint.authorDateUtc)} · ${checkpoint.shortHash}`}
            right={checkpoint.isHead ? <Badge tone="primary">현재</Badge> : checkpoint.rollbackCandidate ? <Badge tone="outline">되돌리기</Badge> : null}
          />
        ))}
        {git.checkpoints.length === 0 ? <Empty label="체크포인트 없음" /> : null}
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="min-w-0 space-y-1">
          {git.checkpoints.slice(0, 4).map((checkpoint) => (
            <Row
              key={`risk-${checkpoint.shortHash}`}
              left={checkpoint.shortHash}
              sub={checkpoint.riskFlags.join(", ") || "위험 표시 없음"}
              right={<Badge tone={checkpoint.rollbackCandidate ? "warning" : "outline"}>{checkpoint.parentShortHashes.length || 0} parent</Badge>}
            />
          ))}
        </div>
        <div className="min-w-0 space-y-1">
          {git.checks.slice(0, 5).map((check) => (
            <Row key={check.name} left={check.name} sub={check.detail} right={<Badge tone={statusTone(check.status)}>{check.status}</Badge>} />
          ))}
          {git.checks.length === 0 ? <Empty label="Git 타임머신 check 없음" /> : null}
        </div>
      </div>
    </>
  );
}

export function McpPanel({ mcp }: { mcp: McpSnapshot | null }) {
  if (!mcp) return <Empty label="새로고침하면 .mcp.json 서버 설정이 표시됩니다." />;
  const readyCount = mcp.servers.filter((server) => server.readiness.status === "ready_to_launch").length;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="설정" value={mcp.configFiles.length} sub={`${mcp.configFiles.filter((file) => file.exists).length}개 발견`} />
        <Stat label="서버" value={mcp.totalServers} sub={`${readyCount}개 준비`} />
        <Stat label="오류" value={mcp.errors.length} sub={mcp.scannedAtUtc || "점검 시간 -"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled>
          <Play size={13} aria-hidden="true" /> 프로세스 시작
        </Button>
        <Button variant="outline" size="sm" disabled>
          <Send size={13} aria-hidden="true" /> JSON-RPC
        </Button>
        <Button variant="outline" size="sm" disabled>
          <Wrench size={13} aria-hidden="true" /> 도구 연결
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-1">
          {mcp.configFiles.map((file) => (
            <Row key={`${file.source}-${file.path}`} left={file.source} sub={file.error || file.path} right={<Badge tone={statusTone(file.status)}>{file.status}</Badge>} />
          ))}
          {mcp.configFiles.length === 0 ? <Empty label="도구 서버 설정 후보 없음" /> : null}
          {mcp.errors.map((error) => (
            <Row key={`${error.source}-${error.code}`} left={error.code} sub={error.message || error.path} right={<Badge tone="destructive">{error.source}</Badge>} />
          ))}
        </div>
        <div className="min-w-0 space-y-2">
          {mcp.servers.map((server) => (
            <article key={server.serverId} className="rounded-md border border-border bg-card/60 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{server.name || server.serverId}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {server.transport} · {server.command || server.url || "설정"} · {server.message}
                  </p>
                </div>
                <Badge tone={statusTone(server.readiness.status)}>{server.readiness.status || server.status}</Badge>
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                {server.argsPreview.length > 0 ? <Badge tone="outline" className="max-w-full truncate">{server.argsPreview.join(" ")}</Badge> : null}
                {server.workingDirectory ? <Badge tone="outline" className="max-w-full truncate">{server.workingDirectory}</Badge> : null}
                {server.envKeys.slice(0, 4).map((key) => <Badge key={key} tone="warning" className="max-w-full truncate">{key}</Badge>)}
                {!server.enabled ? <Badge tone="outline">꺼짐</Badge> : null}
              </div>
              {server.readiness.checks.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {server.readiness.checks.slice(0, 3).map((check) => (
                    <Row key={`${server.serverId}-${check.name}`} left={check.name} sub={check.message} right={<Badge tone={statusTone(check.status)}>{check.status}</Badge>} />
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {mcp.servers.length === 0 ? <Empty label={`발견된 도구 서버 없음 (설정 파일 ${mcp.configFiles.length})`} /> : null}
        </div>
      </div>
    </>
  );
}

export function LocalLlmPanel({ local }: { local: LocalLlmSnapshot | null }) {
  if (!local) return <Empty label="새로고침하면 로컬 모델 연결점과 모델 목록이 표시됩니다." />;
  const models = local.endpoints.flatMap((endpoint) => endpoint.models.map((model) => ({ ...model, endpointName: endpoint.name })));
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="연결점" value={local.availableEndpointCount} sub={`${local.endpoints.length}개 점검`} />
        <Stat label="모델" value={local.totalModelCount} sub={local.scannedAtUtc || "점검 시간 -"} />
        <Stat label="오프라인" value={local.offlineReady ? "준비" : "보류"} sub={local.offlineMode.status || "요청 전"} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={local.offlineReady ? "success" : "warning"}>{local.offlineReady ? "오프라인 준비" : "오프라인 보류"}</Badge>
        <Badge tone={statusTone(local.offlineMode.status)}>{local.offlineMode.status || "not_requested"}</Badge>
        <Badge tone={local.offlineMode.requested ? "primary" : "outline"}>{local.offlineMode.requested ? "요청됨" : "수동"}</Badge>
        {local.offlineMode.requestedBy.map((name) => <Badge key={name} tone="outline" className="max-w-full truncate font-mono">{name}</Badge>)}
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="min-w-0 space-y-1">
          {local.endpoints.map((endpoint) => (
            <Row
              key={endpoint.name}
              left={`${endpoint.name} (${endpoint.kind})`}
              sub={endpoint.error || `${endpoint.baseUrl} · 모델 ${endpoint.modelCount} · ${endpoint.elapsedMs}ms`}
              right={<Badge tone={statusTone(endpoint.status)}>{endpoint.status}</Badge>}
            />
          ))}
          {local.endpoints.length === 0 ? <Empty label="로컬 모델 연결점 없음" /> : null}
        </div>
        <div className="min-w-0 space-y-1">
          {local.offlineMode.checks.map((check) => (
            <Row key={check.name} left={check.name} sub={check.message} right={<Badge tone={statusTone(check.status)}>{check.status}</Badge>} />
          ))}
          {local.offlineMode.cloudProviderKeysPresent.length > 0 ? (
            <Row
              left="클라우드 자격증명"
              sub={local.offlineMode.cloudProviderKeysPresent.join(", ")}
              right={<Badge tone="warning">{local.offlineMode.cloudProviderKeysPresent.length}</Badge>}
            />
          ) : null}
          {local.offlineMode.checks.length === 0 && local.offlineMode.cloudProviderKeysPresent.length === 0 ? <Empty label="오프라인 모드 체크 없음" /> : null}
        </div>
      </div>
      {models.length > 0 ? (
        <div className="space-y-1">
          {models.slice(0, 8).map((model) => (
            <Row
              key={`${model.endpointName}-${model.id}`}
              left={model.id}
              sub={`${model.endpointName} · ${model.family || "family -"} · ${model.parameterSize || "size -"} · ${model.quantization || "quant -"}`}
              right={<Badge tone="outline">{formatBytes(model.sizeBytes)}</Badge>}
            />
          ))}
        </div>
      ) : null}
      {local.warnings.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {local.warnings.slice(0, 4).map((warning) => <Badge key={warning} tone="warning" className="max-w-full truncate">{warning}</Badge>)}
        </div>
      ) : null}
    </>
  );
}

export function TerminalPanel({ terminal }: { terminal: TerminalSnapshot | null }) {
  if (!terminal) return <Empty label="새로고침하면 셸과 도구 가용성이 표시됩니다." />;
  const tools = [...terminal.shells, ...terminal.toolchains];
  const availableTools = tools.filter((item) => item.status === "available").length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(terminal.status)}>{terminal.status}</Badge>
        <Badge tone={terminal.ptySessionEnabled ? "success" : "outline"}>PTY {terminal.ptySessionEnabled ? "on" : "off"}</Badge>
        <Badge tone="outline">{terminal.scannedAtUtc || "scan time -"}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="셸" value={terminal.shells.length} sub={`${terminal.shells.filter((item) => item.status === "available").length}개 사용 가능`} />
        <Stat label="도구" value={terminal.toolchains.length} sub={`총 ${availableTools}개 사용 가능`} />
        <Stat label="점검" value={terminal.checks.length} sub={terminal.ptySessionEnabled ? "실행 가능" : "읽기 전용"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!terminal.ptySessionEnabled}>
          <Play size={13} aria-hidden="true" /> 시작
        </Button>
        <Button variant="outline" size="sm" disabled={!terminal.ptySessionEnabled}>
          <Send size={13} aria-hidden="true" /> 입력
        </Button>
        <Button variant="outline" size="sm" disabled={!terminal.ptySessionEnabled}>
          <Square size={13} aria-hidden="true" /> 중단
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="min-w-0 space-y-1">
          {tools.map((item) => (
            <Row
              key={`${item.kind}-${item.name}-${item.command}`}
              left={item.name}
              sub={`${item.resolvedPath || item.command} · ${item.message || item.kind}`}
              right={<Badge tone={statusTone(item.status)}>{item.status}</Badge>}
            />
          ))}
          {tools.length === 0 ? <Empty label="조회된 셸/도구 없음" /> : null}
        </div>
        <div className="min-w-0 space-y-1">
          {terminal.checks.map((check) => (
            <Row key={check.name} left={check.name} sub={check.message} right={<Badge tone={statusTone(check.status)}>{check.status}</Badge>} />
          ))}
          {terminal.checks.length === 0 ? <Empty label="터미널 점검 항목 없음" /> : null}
        </div>
      </div>
    </>
  );
}

export function SemanticSearchPanel({ semantic }: { semantic: SemanticSnapshot | null }) {
  if (!semantic) return <Empty label="새로고침하면 검색 인덱스와 로컬 임베딩 상태가 표시됩니다." />;
  const blockedActions = [
    ["임베딩 생성", semantic.embeddingGenerationEnabled],
    ["벡터 검색", semantic.vectorSearchEnabled],
    ["대량 reindex", false]
  ] as const;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(semantic.status)}>{semantic.status}</Badge>
        <Badge tone={semantic.readOnly ? "outline" : "warning"}>{semantic.readOnly ? "읽기 전용" : "변경 가능"}</Badge>
        <Badge tone={semantic.index.ftsAvailable ? "success" : "destructive"}>FTS {semantic.index.ftsAvailable ? "on" : "off"}</Badge>
        <Badge tone={semantic.index.sqliteVecAvailable ? "success" : "outline"}>sqlite-vec {semantic.index.sqliteVecAvailable ? "ready" : "보류"}</Badge>
        <Badge tone={semantic.codeSearchRecommended ? "primary" : "default"}>{semantic.codeSearchRecommended ? "텍스트/구조 우선" : "의미 검색 후보"}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="파일" value={semantic.index.fileCount.toLocaleString()} />
        <Stat label="청크" value={semantic.index.chunkCount.toLocaleString()} />
        <Stat label="임베딩 후보" value={semantic.embedding.candidateModels.length} sub={`${semantic.embedding.availableEndpointCount}/${semantic.embedding.totalModelCount} local`} />
      </div>
      <div className="flex flex-wrap gap-2">
        {blockedActions.map(([label, enabled]) => (
          <Button key={label} variant="outline" size="sm" disabled={!enabled}>
            <BrainCircuit size={13} aria-hidden="true" /> {label}
          </Button>
        ))}
      </div>
      <div className="space-y-1">
        {semantic.index.chunkSources.map((source) => (
          <Row key={source.source} left={source.source} right={<Badge tone="outline">{source.count.toLocaleString()}</Badge>} />
        ))}
        {semantic.embedding.candidateModels.slice(0, 3).map((model) => (
          <Row key={`${model.endpointName}-${model.modelId}`} left={model.modelId} sub={`${model.endpointName} · ${model.endpointKind || "local"}`} right={<BrainCircuit size={14} aria-hidden="true" />} />
        ))}
        {semantic.checks.slice(0, 5).map((check) => (
          <Row key={check.name} left={check.name} sub={check.message} right={<Badge tone={statusTone(check.status)}>{check.status}</Badge>} />
        ))}
      </div>
      {semantic.skipped.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {semantic.skipped.slice(0, 5).map((item) => <Badge key={item} tone="outline" className="max-w-full truncate">{item}</Badge>)}
        </div>
      ) : null}
      {semantic.recommendations.length > 0 || semantic.warnings.length > 0 ? (
        <div className="space-y-1">
          {semantic.recommendations.slice(0, 3).map((item) => <Row key={`rec-${item}`} left="제안" sub={item} right={<Badge tone="primary">검토</Badge>} />)}
          {semantic.warnings.slice(0, 3).map((item) => <Row key={`warn-${item}`} left="주의" sub={item} right={<Badge tone="warning">주의</Badge>} />)}
        </div>
      ) : null}
    </>
  );
}

export function CodeRepomapPanel({ repomap }: { repomap: RepomapSnapshot | null }) {
  if (!repomap) return <Empty label="새로고침하면 코드 구조 지도가 표시됩니다." />;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(repomap.status)}>{repomap.status}</Badge>
        <Badge tone="outline">{repomap.mappedFileCount}/{repomap.scannedFileCount} 파일</Badge>
        <Badge tone="primary">{repomap.symbolCount.toLocaleString()} 심볼</Badge>
        {repomap.truncated ? <Badge tone="warning">일부만 표시</Badge> : null}
      </div>
      <div className="space-y-1">
        {repomap.files.slice(0, 8).map((file) => {
          const firstSymbol = file.symbols[0];
          return (
            <Row
              key={file.path}
              left={file.path}
              sub={firstSymbol ? `${firstSymbol.kind} ${firstSymbol.name} · line ${firstSymbol.line}` : file.language}
              right={<Badge tone="outline"><MapIcon size={11} aria-hidden="true" /> {file.symbolCount}</Badge>}
            />
          );
        })}
        {repomap.files.length === 0 ? <Empty label="구조 지도로 표시할 symbol 없음" /> : null}
      </div>
    </>
  );
}

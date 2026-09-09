import { RefreshCcw } from "lucide-react";
import { Button, Spinner } from "../../components/ui/primitives";
import { statusLabel, statusTone } from "../../components/ui/status-tone";
import { cn } from "../../components/ui/primitives";
import { useInsightsStore } from "./insights-store";
import { formatDateTime, type SliceId } from "./insights-view";

/* ============================================================================
   진단 한 칸의 본문.
   어떤 진단이든 같은 모양으로 그린다: 한 줄 요약 + 점검 목록 + 안내.
   숫자 타일을 늘어놓지 않는다.
   ============================================================================ */

type Line = { name: string; status: string; detail: string };

export function DiagnosticBody({ id, hint }: { id: SliceId; hint: string }) {
  const state = useInsightsStore((store) => store.slices[id]);
  const load = useInsightsStore((store) => store.load);
  const view = useDiagnosticView(id);

  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words text-xs text-muted-foreground">{hint}</p>
        <Button size="sm" variant="ghost" onClick={() => load(id)} disabled={state.status === "loading"}>
          {state.status === "loading" ? <Spinner size={12} /> : <RefreshCcw size={12} aria-hidden="true" />} 다시 조회
        </Button>
      </div>

      {state.status === "failed" ? (
        <p className="min-w-0 break-words rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {state.error}
          {state.updatedAt ? ` (아래는 ${formatDateTime(state.updatedAt)} 기준 이전 값)` : ""}
        </p>
      ) : null}

      {state.status === "loading" && view.lines.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner size={12} /> 조회 중입니다.
        </p>
      ) : null}

      {view.headline ? <p className="min-w-0 break-words text-sm font-medium">{view.headline}</p> : null}

      {view.lines.length > 0 ? (
        <ul className="min-w-0 divide-y divide-border rounded-lg border border-border">
          {view.lines.map((line, index) => (
            <li key={`${line.name}-${index}`} className="flex min-w-0 items-start gap-2 px-2.5 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block min-w-0 break-words text-xs">{line.name}</span>
                {line.detail ? (
                  <span className="block min-w-0 break-words text-[11px] text-muted-foreground">{line.detail}</span>
                ) : null}
              </span>
              {line.status ? <StatusChip status={line.status} /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {view.notes.length > 0 ? (
        <ul className="min-w-0 list-disc pl-4 text-[11px] text-muted-foreground">
          {view.notes.slice(0, 6).map((note, index) => (
            <li key={`${note}-${index}`} className="min-w-0 break-words">
              {note}
            </li>
          ))}
        </ul>
      ) : null}

      {state.status === "ready" && view.lines.length === 0 && view.headline === "" ? (
        <p className="text-xs text-muted-foreground">받은 내용이 없습니다.</p>
      ) : null}

      {state.status === "ready" && state.updatedAt ? (
        <p className="text-[11px] text-muted-foreground">{formatDateTime(state.updatedAt)} 기준</p>
      ) : null}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        tone === "destructive" && "bg-destructive/15 text-destructive",
        tone === "warning" && "bg-warning/15 text-warning",
        tone === "success" && "bg-success/15 text-success",
        (tone === "default" || tone === "primary") && "bg-muted text-muted-foreground"
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

type View = { headline: string; lines: Line[]; notes: string[] };
const EMPTY: View = { headline: "", lines: [], notes: [] };

/** 저장소의 각 스냅샷을 같은 모양으로 바꾼다. 값이 없으면 빈 모양을 준다. */
function useDiagnosticView(id: SliceId): View {
  const doctor = useInsightsStore((state) => state.doctor);
  const terminal = useInsightsStore((state) => state.terminal);
  const localLlm = useInsightsStore((state) => state.localLlm);
  const mcp = useInsightsStore((state) => state.mcp);
  const semantic = useInsightsStore((state) => state.semantic);
  const git = useInsightsStore((state) => state.gitTimeMachine);
  const commits = useInsightsStore((state) => state.commitLearning);
  const repomap = useInsightsStore((state) => state.repomap);
  const improvements = useInsightsStore((state) => state.selfImprovement);

  if (id === "doctor") {
    if (doctor.found === false) return { ...EMPTY, headline: "저장된 진단 보고서가 없습니다." };
    const report = doctor.report;
    if (report === null) return EMPTY;
    return {
      headline: `정상 ${report.okCount} · 주의 ${report.warnCount} · 실패 ${report.failCount} · 건너뜀 ${report.skipCount}`,
      lines: report.checks.map((check) => ({
        name: check.id || "점검",
        status: check.status,
        detail: check.summary || check.detail
      })),
      notes: report.checks.flatMap((check) => check.suggestedActions)
    };
  }

  if (id === "terminal") {
    if (terminal === null) return EMPTY;
    const found = terminal.toolchains.filter((tool) => tool.status === "available").length;
    return {
      headline: `셸 ${terminal.shells.length}개 · 도구 ${found}/${terminal.toolchains.length}개`,
      lines: [
        ...terminal.shells.map((shell) => ({ name: shell.name, status: shell.status, detail: shell.message || shell.resolvedPath })),
        ...terminal.toolchains.map((tool) => ({ name: tool.name, status: tool.status, detail: tool.message || tool.resolvedPath }))
      ],
      notes: []
    };
  }

  if (id === "localLlm") {
    if (localLlm === null) return EMPTY;
    return {
      headline: `연결점 ${localLlm.availableEndpointCount}/${localLlm.endpoints.length}개 · 모델 ${localLlm.totalModelCount}개`,
      lines: localLlm.endpoints.map((endpoint) => ({
        name: `${endpoint.name} (${endpoint.kind})`,
        status: endpoint.status,
        detail: endpoint.error || endpoint.baseUrl
      })),
      notes: localLlm.warnings
    };
  }

  if (id === "mcp") {
    if (mcp === null) return EMPTY;
    return {
      headline: `설정 파일 ${mcp.configFiles.length}개 · 서버 ${mcp.totalServers}개`,
      lines: [
        ...mcp.configFiles.map((file) => ({ name: file.source, status: file.status, detail: file.error || file.path })),
        ...mcp.servers.map((server) => ({
          name: server.name || server.serverId,
          status: server.readiness.status || server.status,
          detail: server.message || server.url || server.command
        }))
      ],
      notes: mcp.errors.map((error) => `${error.source}: ${error.message || error.code}`)
    };
  }

  if (id === "semantic") {
    if (semantic === null) return EMPTY;
    return {
      headline: `파일 ${semantic.index.fileCount.toLocaleString()}개 · 조각 ${semantic.index.chunkCount.toLocaleString()}개`,
      lines: [
        { name: "전문 검색", status: semantic.index.ftsAvailable ? "available" : "unavailable", detail: "" },
        { name: "벡터 검색", status: semantic.vectorSearchEnabled ? "enabled" : "disabled", detail: "" },
        ...semantic.checks.map((check) => ({ name: check.name, status: check.status, detail: check.message }))
      ],
      notes: [...semantic.recommendations, ...semantic.warnings]
    };
  }

  if (id === "git") {
    if (git === null) return EMPTY;
    if (!git.isRepository) return { ...EMPTY, headline: "Git 저장소가 아닙니다." };
    return {
      headline: `${git.branchName} · ${git.isClean ? "변경 없음" : `변경 ${git.changedFileCount}개`} · 되돌릴 지점 ${git.checkpoints.length}개`,
      lines: git.checks.map((check) => ({ name: check.name, status: check.status, detail: check.detail })),
      notes: [...git.readiness.blockers, ...git.warnings]
    };
  }

  if (id === "commits") {
    if (commits === null) return EMPTY;
    return {
      headline: `커밋 ${commits.totalCommits.toLocaleString()}개 · 자주 바뀌는 파일 ${commits.hotspots.length}개`,
      lines: commits.hotspots.map((hotspot) => ({
        name: hotspot.path,
        status: "",
        detail: `${hotspot.changeCount}회 · ${hotspot.lastSubject}`
      })),
      notes: commits.warnings
    };
  }

  if (id === "repomap") {
    if (repomap === null) return EMPTY;
    return {
      headline: `파일 ${repomap.mappedFileCount.toLocaleString()}/${repomap.scannedFileCount.toLocaleString()}개 · 심볼 ${repomap.symbolCount.toLocaleString()}개`,
      lines: repomap.files.map((file) => ({
        name: file.path,
        status: "",
        detail: `${file.language || "언어 미상"} · 심볼 ${file.symbolCount}개`
      })),
      notes: repomap.truncated ? ["파일이 많아 일부만 읽었습니다. 전체 목록이 아닙니다."] : []
    };
  }

  if (improvements === null) return EMPTY;
  return {
    headline: `제안 ${improvements.proposalCount}건`,
    lines: improvements.proposals.map((proposal) => ({
      name: proposal.title || proposal.proposalId,
      status: proposal.requiresApproval ? "pending" : "",
      detail: proposal.suggestedAction || proposal.rationale
    })),
    notes: improvements.warnings
  };
}

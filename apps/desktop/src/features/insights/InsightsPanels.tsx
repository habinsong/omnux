import type { ReactNode } from "react";
import { BrainCircuit, GitBranch, GitCommitHorizontal, Map, Play, Send, Sparkles, Square } from "lucide-react";
import { Badge, Button } from "../../components/ui/primitives";
import type {
  CommitLearningSnapshot,
  GitTimeMachineSnapshot,
  LocalLlmSnapshot,
  McpSnapshot,
  RepomapSnapshot,
  SelfImprovementSnapshot,
  SemanticSnapshot,
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
  if (!telemetry) return <Empty label="새로고침하면 provider별 토큰·지연이 표시됩니다." />;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="총 호출" value={telemetry.totalEvents} />
        <Stat label="총 토큰" value={telemetry.total.totalTokens.toLocaleString()} />
        <Stat label="평균 지연" value={`${telemetry.total.averageDurationMs}ms`} />
      </div>
      <div className="space-y-1">
        {telemetry.providers.map((provider) => (
          <Row
            key={provider.provider}
            left={provider.provider}
            sub={`${provider.eventCount} calls · 평균 ${provider.averageDurationMs}ms`}
            right={<Badge tone="primary">{provider.totalTokens.toLocaleString()} tok</Badge>}
          />
        ))}
        {telemetry.providers.length === 0 ? <Empty label="telemetry 이벤트 없음" /> : null}
      </div>
    </>
  );
}

export function GitTimeMachinePanel({ git }: { git: GitTimeMachineSnapshot | null }) {
  if (!git) return <Empty label="새로고침하면 브랜치·커밋 체크포인트가 표시됩니다." />;
  if (!git.isRepository) return <Empty label="workspace가 git 저장소가 아닙니다." />;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline"><GitBranch size={11} aria-hidden="true" /> {git.branchName}</Badge>
        <Badge tone="outline" className="font-mono">{git.headShortHash}</Badge>
        <Badge tone={git.isClean ? "success" : "warning"}>{git.isClean ? "clean" : `${git.changedFileCount} changed`}</Badge>
      </div>
      <div className="space-y-1">
        {git.checkpoints.slice(0, 8).map((checkpoint) => (
          <Row
            key={checkpoint.shortHash}
            left={checkpoint.subject}
            sub={`${checkpoint.authorName} · ${checkpoint.shortHash}`}
            right={checkpoint.isHead ? <Badge tone="primary">HEAD</Badge> : checkpoint.rollbackCandidate ? <Badge tone="outline">rollback</Badge> : null}
          />
        ))}
        {git.checkpoints.length === 0 ? <Empty label="체크포인트 없음" /> : null}
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
        <Stat label="configs" value={mcp.configFiles.length} sub={`${mcp.configFiles.filter((file) => file.exists).length} found`} />
        <Stat label="servers" value={mcp.totalServers} sub={`${readyCount} ready`} />
        <Stat label="errors" value={mcp.errors.length} sub={mcp.scannedAtUtc || "scan time -"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled>
          <Play size={13} aria-hidden="true" /> 프로세스 시작
        </Button>
        <Button variant="outline" size="sm" disabled>
          <Send size={13} aria-hidden="true" /> JSON-RPC
        </Button>
        <Button variant="outline" size="sm" disabled>
          <Sparkles size={13} aria-hidden="true" /> Tool 주입
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-1">
          {mcp.configFiles.map((file) => (
            <Row key={`${file.source}-${file.path}`} left={file.source} sub={file.error || file.path} right={<Badge tone={statusTone(file.status)}>{file.status}</Badge>} />
          ))}
          {mcp.configFiles.length === 0 ? <Empty label="MCP config 후보 없음" /> : null}
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
                    {server.transport} · {server.command || server.url || "config"} · {server.message}
                  </p>
                </div>
                <Badge tone={statusTone(server.readiness.status)}>{server.readiness.status || server.status}</Badge>
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                {server.argsPreview.length > 0 ? <Badge tone="outline" className="max-w-full truncate">{server.argsPreview.join(" ")}</Badge> : null}
                {server.workingDirectory ? <Badge tone="outline" className="max-w-full truncate">{server.workingDirectory}</Badge> : null}
                {server.envKeys.slice(0, 4).map((key) => <Badge key={key} tone="warning" className="max-w-full truncate">{key}</Badge>)}
                {!server.enabled ? <Badge tone="outline">disabled</Badge> : null}
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
          {mcp.servers.length === 0 ? <Empty label={`발견된 MCP 서버 없음 (설정 파일 ${mcp.configFiles.length})`} /> : null}
        </div>
      </div>
    </>
  );
}

export function LocalLlmPanel({ local }: { local: LocalLlmSnapshot | null }) {
  if (!local) return <Empty label="새로고침하면 로컬 LLM endpoint·모델이 표시됩니다." />;
  const models = local.endpoints.flatMap((endpoint) => endpoint.models.map((model) => ({ ...model, endpointName: endpoint.name })));
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="endpoint" value={local.availableEndpointCount} sub={`${local.endpoints.length} scanned`} />
        <Stat label="models" value={local.totalModelCount} sub={local.scannedAtUtc || "scan time -"} />
        <Stat label="offline" value={local.offlineReady ? "ready" : "hold"} sub={local.offlineMode.status || "not_requested"} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={local.offlineReady ? "success" : "warning"}>{local.offlineReady ? "offline ready" : "offline not ready"}</Badge>
        <Badge tone={statusTone(local.offlineMode.status)}>{local.offlineMode.status || "not_requested"}</Badge>
        <Badge tone={local.offlineMode.requested ? "primary" : "outline"}>{local.offlineMode.requested ? "requested" : "manual only"}</Badge>
        {local.offlineMode.requestedBy.map((name) => <Badge key={name} tone="outline" className="max-w-full truncate font-mono">{name}</Badge>)}
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="min-w-0 space-y-1">
          {local.endpoints.map((endpoint) => (
            <Row
              key={endpoint.name}
              left={`${endpoint.name} (${endpoint.kind})`}
              sub={endpoint.error || `${endpoint.baseUrl} · ${endpoint.modelCount} models · ${endpoint.elapsedMs}ms`}
              right={<Badge tone={statusTone(endpoint.status)}>{endpoint.status}</Badge>}
            />
          ))}
          {local.endpoints.length === 0 ? <Empty label="로컬 LLM endpoint 없음" /> : null}
        </div>
        <div className="min-w-0 space-y-1">
          {local.offlineMode.checks.map((check) => (
            <Row key={check.name} left={check.name} sub={check.message} right={<Badge tone={statusTone(check.status)}>{check.status}</Badge>} />
          ))}
          {local.offlineMode.cloudProviderKeysPresent.length > 0 ? (
            <Row
              left="cloud credentials"
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
  if (!terminal) return <Empty label="새로고침하면 shell·toolchain 가용성이 표시됩니다." />;
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
        <Stat label="shell" value={terminal.shells.length} sub={`${terminal.shells.filter((item) => item.status === "available").length} available`} />
        <Stat label="toolchain" value={terminal.toolchains.length} sub={`${availableTools} usable total`} />
        <Stat label="checks" value={terminal.checks.length} sub={terminal.ptySessionEnabled ? "execution enabled" : "snapshot only"} />
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
          {tools.length === 0 ? <Empty label="조회된 shell/toolchain 없음" /> : null}
        </div>
        <div className="min-w-0 space-y-1">
          {terminal.checks.map((check) => (
            <Row key={check.name} left={check.name} sub={check.message} right={<Badge tone={statusTone(check.status)}>{check.status}</Badge>} />
          ))}
          {terminal.checks.length === 0 ? <Empty label="terminal readiness check 없음" /> : null}
        </div>
      </div>
    </>
  );
}

export function SemanticSearchPanel({ semantic }: { semantic: SemanticSnapshot | null }) {
  if (!semantic) return <Empty label="새로고침하면 FTS·sqlite-vec·로컬 임베딩 readiness가 표시됩니다." />;
  const blockedActions = [
    ["임베딩 생성", semantic.embeddingGenerationEnabled],
    ["벡터 검색", semantic.vectorSearchEnabled],
    ["대량 reindex", false]
  ] as const;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(semantic.status)}>{semantic.status}</Badge>
        <Badge tone={semantic.readOnly ? "outline" : "warning"}>{semantic.readOnly ? "read-only" : "mutable"}</Badge>
        <Badge tone={semantic.index.ftsAvailable ? "success" : "destructive"}>FTS {semantic.index.ftsAvailable ? "on" : "off"}</Badge>
        <Badge tone={semantic.index.sqliteVecAvailable ? "success" : "outline"}>sqlite-vec {semantic.index.sqliteVecAvailable ? "ready" : "보류"}</Badge>
        <Badge tone={semantic.codeSearchRecommended ? "primary" : "default"}>{semantic.codeSearchRecommended ? "FTS/Repomap 우선" : "semantic 후보"}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="파일" value={semantic.index.fileCount.toLocaleString()} />
        <Stat label="청크" value={semantic.index.chunkCount.toLocaleString()} />
        <Stat label="임베딩 후보" value={semantic.embedding.candidateModels.length} sub={`${semantic.embedding.availableEndpointCount}/${semantic.embedding.totalModelCount} local`} />
      </div>
      <div className="flex flex-wrap gap-2">
        {blockedActions.map(([label, enabled]) => (
          <Button key={label} variant="outline" size="sm" disabled={!enabled}>
            <Sparkles size={13} aria-hidden="true" /> {label}
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
          {semantic.recommendations.slice(0, 3).map((item) => <Row key={`rec-${item}`} left="recommendation" sub={item} right={<Badge tone="primary">review</Badge>} />)}
          {semantic.warnings.slice(0, 3).map((item) => <Row key={`warn-${item}`} left="warning" sub={item} right={<Badge tone="warning">warn</Badge>} />)}
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
        <Badge tone="outline">{repomap.mappedFileCount}/{repomap.scannedFileCount} files</Badge>
        <Badge tone="primary">{repomap.symbolCount.toLocaleString()} symbols</Badge>
        {repomap.truncated ? <Badge tone="warning">truncated</Badge> : null}
      </div>
      <div className="space-y-1">
        {repomap.files.slice(0, 8).map((file) => {
          const firstSymbol = file.symbols[0];
          return (
            <Row
              key={file.path}
              left={file.path}
              sub={firstSymbol ? `${firstSymbol.kind} ${firstSymbol.name} · line ${firstSymbol.line}` : file.language}
              right={<Badge tone="outline"><Map size={11} aria-hidden="true" /> {file.symbolCount}</Badge>}
            />
          );
        })}
        {repomap.files.length === 0 ? <Empty label="구조 지도로 표시할 symbol 없음" /> : null}
      </div>
    </>
  );
}

export function CommitLearningPanel({ commitLearning }: { commitLearning: CommitLearningSnapshot | null }) {
  if (!commitLearning) return <Empty label="새로고침하면 commit intent와 hotspot이 표시됩니다." />;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">{commitLearning.totalCommits} commits</Badge>
        {commitLearning.intents.slice(0, 5).map((intent) => (
          <Badge key={intent.intent} tone={statusTone(intent.intent)}>{intent.intent} {intent.commitCount}</Badge>
        ))}
      </div>
      <div className="space-y-1">
        {commitLearning.hotspots.slice(0, 8).map((hotspot) => (
          <Row
            key={hotspot.path}
            left={hotspot.path}
            sub={`${hotspot.changeCount} changes · ${hotspot.lastSubject}`}
            right={<Badge tone="outline"><GitCommitHorizontal size={11} aria-hidden="true" /> {hotspot.lastCommitShortHash}</Badge>}
          />
        ))}
        {commitLearning.hotspots.length === 0 ? <Empty label="최근 commit hotspot 없음" /> : null}
      </div>
    </>
  );
}

export function SelfImprovementPanel({ selfImprovement }: { selfImprovement: SelfImprovementSnapshot | null }) {
  if (!selfImprovement) return <Empty label="새로고침하면 workspace hygiene와 hotspot review 제안이 표시됩니다." />;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(selfImprovement.status)}>{selfImprovement.status}</Badge>
        <Badge tone="outline">{selfImprovement.proposalCount} proposals</Badge>
      </div>
      <div className="space-y-1">
        {selfImprovement.proposals.slice(0, 6).map((proposal) => (
          <Row
            key={proposal.proposalId}
            left={proposal.title || proposal.proposalId}
            sub={proposal.rationale || proposal.suggestedAction}
            right={<Badge tone={statusTone(proposal.priority)}><Sparkles size={11} aria-hidden="true" /> {proposal.priority || "review"}</Badge>}
          />
        ))}
        {selfImprovement.proposals.length === 0 ? <Empty label="현재 개선 제안 없음" /> : null}
      </div>
    </>
  );
}

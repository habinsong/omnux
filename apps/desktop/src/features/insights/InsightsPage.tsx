import { useEffect } from "react";
import { BrainCircuit, GitBranch, GitCommitHorizontal, Map, RefreshCcw, Sparkles } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useInsightsPageBridge, useInsightsStore } from "./insights-store";
import { Badge, Button, cn } from "../../components/ui/primitives";

function statusTone(status: string): "success" | "warning" | "destructive" | "primary" | "default" {
  const v = status.toLowerCase();
  if (/(available|ok|ready|clean|ready_for_manual_routing)/.test(v)) return "success";
  if (/(discovered|ready_to_launch|snapshot_only|remote_unverified)/.test(v)) return "primary";
  if (/(blocked|error|fail|unavailable)/.test(v)) return "destructive";
  if (/(unverified|pending|warn)/.test(v)) return "warning";
  return "default";
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Row({ left, right, sub }: { left: string; right: React.ReactNode; sub?: string }) {
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

function Empty({ label }: { label: string }) {
  return <p className="py-4 text-center text-xs text-muted-foreground">{label}</p>;
}

export function InsightsPage() {
  useInsightsPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useInsightsStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (canRequest) store.loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  const t = store.telemetry;
  const git = store.gitTimeMachine;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">인사이트</h1>
          <p className="text-sm text-muted-foreground">LLM telemetry, MCP, 로컬 LLM, 터미널, Git 타임머신 — 백엔드 read-only 스냅샷.</p>
        </div>
        <Button variant="outline" size="sm" onClick={store.loadAll} disabled={!canRequest || store.loading}>
          <RefreshCcw size={15} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
        </Button>
      </div>
      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CardBoundary title="LLM Telemetry / 비용" card="logs" onError={recordCardError}>
          {t ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="총 호출" value={t.totalEvents} />
                <Stat label="총 토큰" value={t.total.totalTokens.toLocaleString()} />
                <Stat label="평균 지연" value={`${t.total.averageDurationMs}ms`} />
              </div>
              <div className="space-y-1">
                {t.providers.map((p) => (
                  <Row key={p.provider} left={p.provider} sub={`${p.eventCount} calls · 평균 ${p.averageDurationMs}ms`} right={<Badge tone="primary">{p.totalTokens.toLocaleString()} tok</Badge>} />
                ))}
                {t.providers.length === 0 ? <Empty label="telemetry 이벤트 없음" /> : null}
              </div>
            </>
          ) : (
            <Empty label="새로고침하면 provider별 토큰·지연이 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="Git 타임머신" card="navigation" onError={recordCardError}>
          {git ? (
            git.isRepository ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="outline"><GitBranch size={11} aria-hidden="true" /> {git.branchName}</Badge>
                  <Badge tone="outline" className="font-mono">{git.headShortHash}</Badge>
                  <Badge tone={git.isClean ? "success" : "warning"}>{git.isClean ? "clean" : `${git.changedFileCount} changed`}</Badge>
                </div>
                <div className="space-y-1">
                  {git.checkpoints.slice(0, 8).map((c) => (
                    <Row key={c.shortHash} left={c.subject} sub={`${c.authorName} · ${c.shortHash}`} right={c.isHead ? <Badge tone="primary">HEAD</Badge> : c.rollbackCandidate ? <Badge tone="outline">rollback</Badge> : null} />
                  ))}
                  {git.checkpoints.length === 0 ? <Empty label="체크포인트 없음" /> : null}
                </div>
              </>
            ) : (
              <Empty label="workspace가 git 저장소가 아닙니다." />
            )
          ) : (
            <Empty label="새로고침하면 브랜치·커밋 체크포인트가 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="MCP 서버" card="operations" onError={recordCardError}>
          {store.mcp ? (
            <div className="space-y-1">
              {store.mcp.servers.map((sv) => (
                <Row key={sv.serverId} left={sv.name || sv.serverId} sub={`${sv.transport} · ${sv.message || sv.readiness}`} right={<Badge tone={statusTone(sv.status)}>{sv.status}</Badge>} />
              ))}
              {store.mcp.servers.length === 0 ? <Empty label={`발견된 MCP 서버 없음 (설정 파일 ${store.mcp.configFiles.length})`} /> : null}
            </div>
          ) : (
            <Empty label="새로고침하면 .mcp.json 서버 설정이 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="로컬 LLM (Ollama / LM Studio)" card="middleware" onError={recordCardError}>
          {store.localLlm ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={store.localLlm.availableEndpointCount > 0 ? "success" : "default"}>{store.localLlm.availableEndpointCount} endpoints</Badge>
                <Badge tone="outline">{store.localLlm.totalModelCount} models</Badge>
                <Badge tone={store.localLlm.offlineReady ? "success" : "warning"}>{store.localLlm.offlineReady ? "offline ready" : "offline X"}</Badge>
              </div>
              <div className="space-y-1">
                {store.localLlm.endpoints.map((e) => (
                  <Row key={e.name} left={`${e.name} (${e.kind})`} sub={`${e.baseUrl} · ${e.modelCount} models`} right={<Badge tone={statusTone(e.status)}>{e.status}</Badge>} />
                ))}
                {store.localLlm.endpoints.length === 0 ? <Empty label="로컬 LLM endpoint 없음" /> : null}
              </div>
            </>
          ) : (
            <Empty label="새로고침하면 로컬 LLM endpoint·모델이 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="터미널 / 툴체인 readiness" card="runtime" onError={recordCardError}>
          {store.terminal ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(store.terminal.status)}>{store.terminal.status}</Badge>
                <Badge tone={store.terminal.ptySessionEnabled ? "success" : "outline"}>PTY {store.terminal.ptySessionEnabled ? "on" : "off"}</Badge>
              </div>
              <div className={cn("grid gap-1", "grid-cols-1 sm:grid-cols-2")}>
                {[...store.terminal.shells, ...store.terminal.toolchains].map((item) => (
                  <Row key={`${item.name}-${item.command}`} left={item.name} sub={item.command} right={<Badge tone={statusTone(item.status)}>{item.status}</Badge>} />
                ))}
              </div>
            </>
          ) : (
            <Empty label="새로고침하면 shell·toolchain 가용성이 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="Semantic Search readiness" card="middleware" onError={recordCardError}>
          {store.semantic ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(store.semantic.status)}>{store.semantic.status}</Badge>
                <Badge tone={store.semantic.index.ftsAvailable ? "success" : "destructive"}>FTS {store.semantic.index.ftsAvailable ? "on" : "off"}</Badge>
                <Badge tone={store.semantic.index.sqliteVecAvailable ? "success" : "outline"}>sqlite-vec {store.semantic.index.sqliteVecAvailable ? "ready" : "보류"}</Badge>
                <Badge tone={store.semantic.codeSearchRecommended ? "primary" : "default"}>code search</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="파일" value={store.semantic.index.fileCount.toLocaleString()} />
                <Stat label="청크" value={store.semantic.index.chunkCount.toLocaleString()} />
                <Stat label="임베딩 후보" value={store.semantic.embedding.candidateModels.length} />
              </div>
              <div className="space-y-1">
                {store.semantic.index.chunkSources.map((source) => (
                  <Row key={source.source} left={source.source} right={<Badge tone="outline">{source.count.toLocaleString()}</Badge>} />
                ))}
                {store.semantic.embedding.candidateModels.slice(0, 3).map((model) => (
                  <Row key={`${model.endpointName}-${model.modelId}`} left={model.modelId} sub={model.endpointName} right={<BrainCircuit size={14} aria-hidden="true" />} />
                ))}
              </div>
            </>
          ) : (
            <Empty label="새로고침하면 FTS·sqlite-vec·로컬 임베딩 readiness가 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="Code Repomap" card="navigation" onError={recordCardError}>
          {store.repomap ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(store.repomap.status)}>{store.repomap.status}</Badge>
                <Badge tone="outline">{store.repomap.mappedFileCount}/{store.repomap.scannedFileCount} files</Badge>
                <Badge tone="primary">{store.repomap.symbolCount.toLocaleString()} symbols</Badge>
                {store.repomap.truncated ? <Badge tone="warning">truncated</Badge> : null}
              </div>
              <div className="space-y-1">
                {store.repomap.files.slice(0, 8).map((file) => {
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
                {store.repomap.files.length === 0 ? <Empty label="구조 지도로 표시할 symbol 없음" /> : null}
              </div>
            </>
          ) : (
            <Empty label="새로고침하면 코드 구조 지도가 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="Commit learning" card="logs" onError={recordCardError}>
          {store.commitLearning ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">{store.commitLearning.totalCommits} commits</Badge>
                {store.commitLearning.intents.slice(0, 5).map((intent) => (
                  <Badge key={intent.intent} tone={statusTone(intent.intent)}>{intent.intent} {intent.commitCount}</Badge>
                ))}
              </div>
              <div className="space-y-1">
                {store.commitLearning.hotspots.slice(0, 8).map((hotspot) => (
                  <Row
                    key={hotspot.path}
                    left={hotspot.path}
                    sub={`${hotspot.changeCount} changes · ${hotspot.lastSubject}`}
                    right={<Badge tone="outline"><GitCommitHorizontal size={11} aria-hidden="true" /> {hotspot.lastCommitShortHash}</Badge>}
                  />
                ))}
                {store.commitLearning.hotspots.length === 0 ? <Empty label="최근 commit hotspot 없음" /> : null}
              </div>
            </>
          ) : (
            <Empty label="새로고침하면 commit intent와 hotspot이 표시됩니다." />
          )}
        </CardBoundary>

        <CardBoundary title="Self improvement 제안" card="operations" onError={recordCardError}>
          {store.selfImprovement ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(store.selfImprovement.status)}>{store.selfImprovement.status}</Badge>
                <Badge tone="outline">{store.selfImprovement.proposalCount} proposals</Badge>
              </div>
              <div className="space-y-1">
                {store.selfImprovement.proposals.slice(0, 6).map((proposal) => (
                  <Row
                    key={proposal.proposalId}
                    left={proposal.title || proposal.proposalId}
                    sub={proposal.rationale || proposal.suggestedAction}
                    right={<Badge tone={statusTone(proposal.priority)}><Sparkles size={11} aria-hidden="true" /> {proposal.priority || "review"}</Badge>}
                  />
                ))}
                {store.selfImprovement.proposals.length === 0 ? <Empty label="현재 개선 제안 없음" /> : null}
              </div>
            </>
          ) : (
            <Empty label="새로고침하면 workspace hygiene와 hotspot review 제안이 표시됩니다." />
          )}
        </CardBoundary>
      </section>
    </div>
  );
}

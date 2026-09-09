import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopInsights } from "../middleware/insights-gateway";
import { normalizeDoctorReport, type DoctorReport } from "../ops/ops-doctor";
import {
  REQUEST_PREFIX,
  SLICE_TIMEOUT_MS,
  createSliceMap,
  markFailed,
  markLoading,
  markReady,
  requestIdFor,
  sliceForMessage,
  type SliceId,
  type SliceMap
} from "./insights-view";

export type TelemetryTraceEvent = {
  id: string;
  operation: string;
  provider: string;
  model: string;
  status: string;
  source: string;
  traceId: string;
  spanId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokenUsageSource: string;
  promptChars: number;
  completionChars: number;
  maxOutputTokens: number;
  streaming: boolean;
  durationMs: number;
  error: string;
  startedUtc: string;
  completedUtc: string;
  promptCacheEligible: boolean;
  promptCacheKey: string;
  promptCacheAffinityKey: string;
  promptCacheStaticChars: number;
  promptCacheStaticTokens: number;
  promptCacheStrategy: string;
  promptCacheReason: string;
  modelRoutingComplexity: string;
  modelRoutingRecommendedTier: string;
  modelRoutingCascadeEligible: boolean;
  modelRoutingEstimatedInputTokens: number;
  modelRoutingSignals: string;
  modelRoutingReason: string;
};
export type TelemetrySnapshot = {
  events: TelemetryTraceEvent[];
  providers: Array<{ provider: string; eventCount: number; totalTokens: number; averageDurationMs: number; maxDurationMs: number }>;
  total: { eventCount: number; totalTokens: number; averageDurationMs: number };
  totalEvents: number;
  filteredEvents: number;
  snapshotUtc: string;
};
export type McpSnapshot = {
  configFiles: Array<{ source: string; path: string; exists: boolean; status: string; serverCount: number; error: string }>;
  servers: Array<{
    serverId: string;
    name: string;
    source: string;
    configPath: string;
    transport: string;
    command: string;
    argsPreview: string[];
    argumentCount: number;
    url: string;
    workingDirectory: string;
    envKeys: string[];
    envKeyCount: number;
    enabled: boolean;
    status: string;
    message: string;
    readiness: { status: string; checks: Array<{ name: string; status: string; message: string }> };
  }>;
  errors: Array<{ source: string; path: string; code: string; message: string }>;
  totalServers: number;
  scannedAtUtc: string;
};
export type LocalLlmSnapshot = {
  endpoints: Array<{
    name: string;
    kind: string;
    baseUrl: string;
    status: string;
    modelCount: number;
    elapsedMs: number;
    error: string;
    models: Array<{ id: string; ownedBy: string; family: string; parameterSize: string; quantization: string; sizeBytes: number; modifiedAtUtc: string }>;
  }>;
  availableEndpointCount: number;
  totalModelCount: number;
  offlineReady: boolean;
  offlineMode: {
    requested: boolean;
    status: string;
    requestedBy: string[];
    cloudProviderKeysPresent: string[];
    checks: Array<{ name: string; status: string; message: string }>;
  };
  warnings: string[];
  scannedAtUtc: string;
};
export type TerminalSnapshot = {
  status: string;
  ptySessionEnabled: boolean;
  shells: Array<{ name: string; kind: string; command: string; status: string; resolvedPath: string; message: string }>;
  toolchains: Array<{ name: string; kind: string; command: string; status: string; resolvedPath: string; message: string }>;
  checks: Array<{ name: string; status: string; message: string }>;
  scannedAtUtc: string;
};
export type GitTimeMachineSnapshot = {
  repositoryRoot: string;
  branchName: string;
  headHash: string;
  headShortHash: string;
  isRepository: boolean;
  readOnly: boolean;
  hasChanges: boolean;
  isClean: boolean;
  changedFileCount: number;
  conflictedFileCount: number;
  diffShortStat: string;
  limit: number;
  checkpointsTruncated: boolean;
  snapshotNamespace: string;
  suggestedSnapshotBranch: string;
  checkpoints: Array<{
    hash: string;
    shortHash: string;
    subject: string;
    authorName: string;
    authorDateUtc: string;
    parentShortHashes: string[];
    isHead: boolean;
    rollbackCandidate: boolean;
    riskFlags: string[];
  }>;
  readiness: { status: string; snapshotCreationRecommended: boolean; rollbackAvailable: boolean; requiresApproval: boolean; blockers: string[] };
  checks: Array<{ name: string; status: string; detail: string }>;
  warnings: string[];
  scannedAtUtc: string;
};
export type SemanticSnapshot = {
  status: string;
  mode: string;
  readOnly: boolean;
  vectorSearchEnabled: boolean;
  embeddingGenerationEnabled: boolean;
  codeSearchRecommended: boolean;
  index: { dbExists: boolean; sqliteCliAvailable: boolean; ftsAvailable: boolean; sqliteVecAvailable: boolean; fileCount: number; chunkCount: number; embeddingCacheEntryCount: number; chunkSources: Array<{ source: string; count: number }> };
  embedding: { localEndpointAvailable: boolean; candidateModelAvailable: boolean; availableEndpointCount: number; totalModelCount: number; candidateModels: Array<{ endpointName: string; endpointKind: string; modelId: string }> };
  checks: Array<{ name: string; status: string; message: string }>;
  recommendations: string[];
  skipped: string[];
  warnings: string[];
  scannedAtUtc: string;
};
export type RepomapSnapshot = {
  status: string;
  scannedFileCount: number;
  mappedFileCount: number;
  symbolCount: number;
  truncated: boolean;
  files: Array<{ path: string; language: string; symbolCount: number; symbols: Array<{ name: string; kind: string; signature: string; line: number }> }>;
};
export type CommitLearningSnapshot = {
  repositoryRoot: string;
  limit: number;
  totalCommits: number;
  commits: Array<{
    hash: string;
    shortHash: string;
    subject: string;
    authorName: string;
    authorDateUtc: string;
    intent: string;
    filesChanged: number;
    addedLines: number;
    deletedLines: number;
    topPaths: string[];
  }>;
  intents: Array<{ intent: string; commitCount: number; addedLines: number; deletedLines: number }>;
  hotspots: Array<{ path: string; changeCount: number; lastCommitShortHash: string; lastSubject: string }>;
  warnings: string[];
  scannedAtUtc: string;
};
export type SelfImprovementSnapshot = {
  repositoryRoot: string;
  status: string;
  proposalCount: number;
  limit: number;
  proposals: Array<{
    proposalId: string;
    kind: string;
    priority: string;
    title: string;
    rationale: string;
    suggestedAction: string;
    source: string;
    targetPath: string;
    requiresApproval: boolean;
    evidence: string[];
  }>;
  warnings: string[];
  scannedAtUtc: string;
};
export type InsightsDoctorSnapshot = {
  found: boolean | null;
  report: DoctorReport | null;
  action: string;
  lastError: string;
};

type InsightsState = {
  telemetry: TelemetrySnapshot | null;
  doctor: InsightsDoctorSnapshot;
  mcp: McpSnapshot | null;
  localLlm: LocalLlmSnapshot | null;
  terminal: TerminalSnapshot | null;
  gitTimeMachine: GitTimeMachineSnapshot | null;
  semantic: SemanticSnapshot | null;
  repomap: RepomapSnapshot | null;
  commitLearning: CommitLearningSnapshot | null;
  selfImprovement: SelfImprovementSnapshot | null;
  /** 조회 단위마다 자기 상태를 갖는다. 하나가 실패해도 나머지가 완료로 보이지 않게 한다. */
  slices: SliceMap;
  /** 어느 조회의 응답인지 알 수 없는 서버 오류. 구역 상태를 덮어쓰지 않고 따로 보관한다. */
  gatewayNotice: string;
  load: (id: SliceId) => void;
  loadMany: (ids: SliceId[]) => void;
  clearGatewayNotice: () => void;
};

/** 조회 단위 → 실제 전송 함수. 요청마다 자기 ID 를 붙인다. */
const SLICE_REQUESTS: Record<SliceId, () => boolean> = {
  telemetry: () => requestDesktopInsights.telemetry(100, requestIdFor("telemetry")),
  // doctor_result 는 운영 화면에서도 나온다. 그 응답도 진단 결과가 새로 온 것이므로 완료로 본다.
  doctor: () => requestDesktopInsights.doctorLast(requestIdFor("doctor")),
  mcp: () => requestDesktopInsights.mcpServers(requestIdFor("mcp")),
  localLlm: () => requestDesktopInsights.localLlm(requestIdFor("localLlm")),
  terminal: () => requestDesktopInsights.terminal(requestIdFor("terminal")),
  git: () => requestDesktopInsights.gitTimeMachine(30, requestIdFor("git")),
  semantic: () => requestDesktopInsights.semanticSearch(requestIdFor("semantic")),
  repomap: () => requestDesktopInsights.codeRepomap(80, requestIdFor("repomap")),
  commits: () => requestDesktopInsights.commitLearning(30, requestIdFor("commits")),
  improvements: () => requestDesktopInsights.selfImprovement(30, requestIdFor("improvements"))
};

const sliceTimers = new Map<SliceId, ReturnType<typeof setTimeout>>();

function clearSliceTimer(id: SliceId) {
  const timer = sliceTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    sliceTimers.delete(id);
  }
}

function armSliceTimer(id: SliceId) {
  clearSliceTimer(id);
  sliceTimers.set(
    id,
    setTimeout(() => {
      sliceTimers.delete(id);
      const state = useInsightsStore.getState();
      if (state.slices[id].status !== "loading") return;
      useInsightsStore.setState({
        slices: markFailed(state.slices, id, "응답이 오지 않았습니다. 다시 조회하세요.")
      });
    }, SLICE_TIMEOUT_MS)
  );
}

/** 응답을 받은 구역만 완료로 바꾼다. 다른 구역의 상태는 건드리지 않는다. */
function completeSlice(id: SliceId) {
  clearSliceTimer(id);
  useInsightsStore.setState((state) => ({
    slices: markReady(state.slices, id, new Date().toISOString())
  }));
}

export const useInsightsStore = create<InsightsState>((set) => ({
  telemetry: null,
  doctor: { found: null, report: null, action: "", lastError: "" },
  mcp: null,
  localLlm: null,
  terminal: null,
  gitTimeMachine: null,
  semantic: null,
  repomap: null,
  commitLearning: null,
  selfImprovement: null,
  slices: createSliceMap(),
  gatewayNotice: "",
  load: (id) => {
    set((state) => ({ slices: markLoading(state.slices, id) }));
    // 한 요청이 실패해도 나머지를 건너뛰지 않는다.
    // 이전 구현은 && 로 이어 붙여 앞선 전송이 실패하면 뒤의 요청을 아예 보내지 않았다.
    const sent = SLICE_REQUESTS[id]();
    if (!sent) {
      set((state) => ({ slices: markFailed(state.slices, id, "요청을 보내지 못했습니다. 연결을 확인하세요.") }));
      return;
    }
    armSliceTimer(id);
  },
  loadMany: (ids) => {
    for (const id of ids) useInsightsStore.getState().load(id);
  },
  clearGatewayNotice: () => set({ gatewayNotice: "" })
}));

function arr(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
function s(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
function n(value: unknown): number {
  return Number(value || 0);
}
function b(value: unknown): boolean {
  return value === true || value === "true";
}

function normalizeTelemetryEvent(event: Record<string, unknown>): TelemetryTraceEvent {
  return {
    id: s(event.id),
    operation: s(event.operation),
    provider: s(event.provider),
    model: s(event.model),
    status: s(event.status),
    source: s(event.source),
    traceId: s(event.traceId),
    spanId: s(event.spanId),
    promptTokens: n(event.promptTokens),
    completionTokens: n(event.completionTokens),
    totalTokens: n(event.totalTokens),
    tokenUsageSource: s(event.tokenUsageSource),
    promptChars: n(event.promptChars),
    completionChars: n(event.completionChars),
    maxOutputTokens: n(event.maxOutputTokens),
    streaming: b(event.streaming),
    durationMs: n(event.durationMs),
    error: s(event.error),
    startedUtc: s(event.startedUtc),
    completedUtc: s(event.completedUtc),
    promptCacheEligible: b(event.promptCacheEligible),
    promptCacheKey: s(event.promptCacheKey),
    promptCacheAffinityKey: s(event.promptCacheAffinityKey),
    promptCacheStaticChars: n(event.promptCacheStaticChars),
    promptCacheStaticTokens: n(event.promptCacheStaticTokens),
    promptCacheStrategy: s(event.promptCacheStrategy),
    promptCacheReason: s(event.promptCacheReason),
    modelRoutingComplexity: s(event.modelRoutingComplexity),
    modelRoutingRecommendedTier: s(event.modelRoutingRecommendedTier),
    modelRoutingCascadeEligible: b(event.modelRoutingCascadeEligible),
    modelRoutingEstimatedInputTokens: n(event.modelRoutingEstimatedInputTokens),
    modelRoutingSignals: s(event.modelRoutingSignals),
    modelRoutingReason: s(event.modelRoutingReason)
  };
}

export function useInsightsPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      const payload = (message.payload || {}) as Record<string, unknown>;
      // 응답을 받은 구역만 완료로 바꾼다. 한 응답이 열 구역 전체의 상태를 대신하지 않는다.
      const answered = typeof message.type === "string" ? sliceForMessage(message.type) : null;
      if (answered !== null) completeSlice(answered);
      if (message.type === "telemetry_snapshot") {
        useInsightsStore.setState({
          telemetry: {
            events: arr(payload.events).map(normalizeTelemetryEvent),
            providers: arr(payload.providers).map((p) => ({ provider: s(p.provider), eventCount: n(p.eventCount), totalTokens: n(p.totalTokens), averageDurationMs: n(p.averageDurationMs), maxDurationMs: n(p.maxDurationMs) })),
            total: { eventCount: n((payload.total as Record<string, unknown>)?.eventCount), totalTokens: n((payload.total as Record<string, unknown>)?.totalTokens), averageDurationMs: n((payload.total as Record<string, unknown>)?.averageDurationMs) },
            totalEvents: n(payload.totalEvents),
            filteredEvents: n(payload.filteredEvents),
            snapshotUtc: s(payload.snapshotUtc)
          }
        });
        return;
      }
      if (message.type === "doctor_result") {
        useInsightsStore.setState({
          doctor: {
            found: message.found === true,
            report: normalizeDoctorReport(message.report),
            action: s(message.action),
            lastError: ""
          }
        });
        return;
      }
      if (message.type === "mcp_servers_snapshot") {
        useInsightsStore.setState({
          mcp: {
            configFiles: arr(payload.configFiles).map((c) => ({
              source: s(c.source),
              path: s(c.path),
              exists: !!c.exists,
              status: s(c.status),
              serverCount: n(c.serverCount),
              error: s(c.error)
            })),
            servers: arr(payload.servers).map((sv) => {
              const readiness = (sv.readiness || {}) as Record<string, unknown>;
              return {
                serverId: s(sv.serverId),
                name: s(sv.name),
                source: s(sv.source),
                configPath: s(sv.configPath),
                transport: s(sv.transport),
                command: s(sv.command),
                argsPreview: Array.isArray(sv.argsPreview) ? sv.argsPreview.map(String) : [],
                argumentCount: n(sv.argumentCount),
                url: s(sv.url),
                workingDirectory: s(sv.workingDirectory),
                envKeys: Array.isArray(sv.envKeys) ? sv.envKeys.map(String) : [],
                envKeyCount: n(sv.envKeyCount),
                enabled: sv.enabled !== false,
                status: s(sv.status),
                message: s(sv.message),
                readiness: {
                  status: s(readiness.status),
                  checks: arr(readiness.checks).map((check) => ({ name: s(check.name), status: s(check.status), message: s(check.message) }))
                }
              };
            }),
            errors: arr(payload.errors).map((error) => ({ source: s(error.source), path: s(error.path), code: s(error.code), message: s(error.message) })),
            totalServers: n(payload.totalServers),
            scannedAtUtc: s(payload.scannedAtUtc)
          }
        });
        return;
      }
      if (message.type === "local_llm_snapshot") {
        const offlineMode = (payload.offlineMode || {}) as Record<string, unknown>;
        useInsightsStore.setState({
          localLlm: {
            endpoints: arr(payload.endpoints).map((e) => ({
              name: s(e.name),
              kind: s(e.kind),
              baseUrl: s(e.baseUrl),
              status: s(e.status),
              modelCount: n(e.modelCount),
              elapsedMs: n(e.elapsedMs),
              error: s(e.error),
              models: arr(e.models).map((model) => ({
                id: s(model.id),
                ownedBy: s(model.ownedBy || model.owned_by),
                family: s(model.family),
                parameterSize: s(model.parameterSize),
                quantization: s(model.quantization),
                sizeBytes: n(model.sizeBytes),
                modifiedAtUtc: s(model.modifiedAtUtc)
              }))
            })),
            availableEndpointCount: n(payload.availableEndpointCount),
            totalModelCount: n(payload.totalModelCount),
            offlineReady: !!payload.offlineReady,
            offlineMode: {
              requested: !!offlineMode.requested,
              status: s(offlineMode.status),
              requestedBy: Array.isArray(offlineMode.requestedBy) ? offlineMode.requestedBy.map(String) : [],
              cloudProviderKeysPresent: Array.isArray(offlineMode.cloudProviderKeysPresent) ? offlineMode.cloudProviderKeysPresent.map(String) : [],
              checks: arr(offlineMode.checks).map((check) => ({ name: s(check.name), status: s(check.status), message: s(check.message) }))
            },
            warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
            scannedAtUtc: s(payload.scannedAtUtc)
          }
        });
        return;
      }
      if (message.type === "terminal_capabilities_snapshot") {
        useInsightsStore.setState({
          terminal: {
            status: s(payload.status),
            ptySessionEnabled: !!payload.ptySessionEnabled,
            shells: arr(payload.shells).map((sh) => ({
              name: s(sh.name),
              kind: s(sh.kind),
              command: s(sh.command),
              status: s(sh.status),
              resolvedPath: s(sh.resolvedPath),
              message: s(sh.message)
            })),
            toolchains: arr(payload.toolchains).map((t) => ({
              name: s(t.name),
              kind: s(t.kind),
              command: s(t.command),
              status: s(t.status),
              resolvedPath: s(t.resolvedPath),
              message: s(t.message)
            })),
            checks: arr(payload.checks).map((check) => ({ name: s(check.name), status: s(check.status), message: s(check.message) })),
            scannedAtUtc: s(payload.scannedAtUtc)
          }
        });
        return;
      }
      if (message.type === "git_time_machine_snapshot") {
        const readiness = (payload.readiness || {}) as Record<string, unknown>;
        useInsightsStore.setState({
          gitTimeMachine: {
            repositoryRoot: s(payload.repositoryRoot),
            branchName: s(payload.branchName),
            headHash: s(payload.headHash),
            headShortHash: s(payload.headShortHash),
            isRepository: !!payload.isRepository,
            readOnly: payload.readOnly !== false,
            hasChanges: !!payload.hasChanges,
            isClean: !!payload.isClean,
            changedFileCount: n(payload.changedFileCount),
            conflictedFileCount: n(payload.conflictedFileCount),
            diffShortStat: s(payload.diffShortStat),
            limit: n(payload.limit),
            checkpointsTruncated: !!payload.checkpointsTruncated,
            snapshotNamespace: s(payload.snapshotNamespace),
            suggestedSnapshotBranch: s(payload.suggestedSnapshotBranch),
            checkpoints: arr(payload.checkpoints).map((c) => ({
              hash: s(c.hash),
              shortHash: s(c.shortHash),
              subject: s(c.subject),
              authorName: s(c.authorName),
              authorDateUtc: s(c.authorDateUtc),
              parentShortHashes: Array.isArray(c.parentShortHashes) ? c.parentShortHashes.map(String) : [],
              isHead: !!c.isHead,
              rollbackCandidate: !!c.rollbackCandidate,
              riskFlags: Array.isArray(c.riskFlags) ? c.riskFlags.map(String) : []
            })),
            readiness: {
              status: s(readiness.status),
              snapshotCreationRecommended: !!readiness.snapshotCreationRecommended,
              rollbackAvailable: !!readiness.rollbackAvailable,
              requiresApproval: !!readiness.requiresApproval,
              blockers: Array.isArray(readiness.blockers) ? readiness.blockers.map(String) : []
            },
            checks: arr(payload.checks).map((check) => ({ name: s(check.name), status: s(check.status), detail: s(check.detail) })),
            warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
            scannedAtUtc: s(payload.scannedAtUtc)
          }
        });
        return;
      }
      if (message.type === "semantic_search_readiness_snapshot") {
        const index = (payload.index || {}) as Record<string, unknown>;
        const embedding = (payload.embedding || {}) as Record<string, unknown>;
        useInsightsStore.setState({
          semantic: {
            status: s(payload.status),
            mode: s(payload.mode),
            readOnly: payload.readOnly !== false,
            vectorSearchEnabled: !!payload.vectorSearchEnabled,
            embeddingGenerationEnabled: !!payload.embeddingGenerationEnabled,
            codeSearchRecommended: !!payload.codeSearchRecommended,
            index: {
              dbExists: !!index.dbExists,
              sqliteCliAvailable: !!index.sqliteCliAvailable,
              ftsAvailable: !!index.ftsAvailable,
              sqliteVecAvailable: !!index.sqliteVecAvailable,
              fileCount: n(index.fileCount),
              chunkCount: n(index.chunkCount),
              embeddingCacheEntryCount: n(index.embeddingCacheEntryCount),
              chunkSources: arr(index.chunkSources).map((c) => ({ source: s(c.source), count: n(c.count) }))
            },
            embedding: {
              localEndpointAvailable: !!embedding.localEndpointAvailable,
              candidateModelAvailable: !!embedding.candidateModelAvailable,
              availableEndpointCount: n(embedding.availableEndpointCount),
              totalModelCount: n(embedding.totalModelCount),
              candidateModels: arr(embedding.candidateModels).map((m) => ({ endpointName: s(m.endpointName), endpointKind: s(m.endpointKind), modelId: s(m.modelId) }))
            },
            checks: arr(payload.checks).map((check) => ({ name: s(check.name), status: s(check.status), message: s(check.message) })),
            recommendations: Array.isArray(payload.recommendations) ? payload.recommendations.map(String) : [],
            skipped: Array.isArray(payload.skipped) ? payload.skipped.map(String) : [],
            warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
            scannedAtUtc: s(payload.scannedAtUtc)
          }
        });
        return;
      }
      if (message.type === "code_repomap_snapshot") {
        useInsightsStore.setState({
          repomap: {
            status: s(payload.status),
            scannedFileCount: n(payload.scannedFileCount),
            mappedFileCount: n(payload.mappedFileCount),
            symbolCount: n(payload.symbolCount),
            truncated: !!payload.truncated,
            files: arr(payload.files).map((f) => ({
              path: s(f.path),
              language: s(f.language),
              symbolCount: n(f.symbolCount),
              symbols: arr(f.symbols).map((sym) => ({ name: s(sym.name), kind: s(sym.kind), signature: s(sym.signature), line: n(sym.line) }))
            }))
          }
        });
        return;
      }
      if (message.type === "commit_learning_snapshot") {
        useInsightsStore.setState({
          commitLearning: {
            repositoryRoot: s(payload.repositoryRoot),
            limit: n(payload.limit),
            totalCommits: n(payload.totalCommits),
            commits: arr(payload.commits).map((c) => ({
              hash: s(c.hash),
              shortHash: s(c.shortHash),
              subject: s(c.subject),
              authorName: s(c.authorName),
              authorDateUtc: s(c.authorDateUtc),
              intent: s(c.intent),
              filesChanged: n(c.filesChanged),
              addedLines: n(c.addedLines),
              deletedLines: n(c.deletedLines),
              topPaths: Array.isArray(c.topPaths) ? c.topPaths.map(String) : []
            })),
            intents: arr(payload.intents).map((i) => ({ intent: s(i.intent), commitCount: n(i.commitCount), addedLines: n(i.addedLines), deletedLines: n(i.deletedLines) })),
            hotspots: arr(payload.hotspots).map((h) => ({ path: s(h.path), changeCount: n(h.changeCount), lastCommitShortHash: s(h.lastCommitShortHash), lastSubject: s(h.lastSubject) })),
            warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
            scannedAtUtc: s(payload.scannedAtUtc)
          }
        });
        return;
      }
      if (message.type === "self_improvement_snapshot") {
        useInsightsStore.setState({
          selfImprovement: {
            repositoryRoot: s(payload.repositoryRoot),
            status: s(payload.status),
            proposalCount: n(payload.proposalCount),
            limit: n(payload.limit),
            proposals: arr(payload.proposals).map((p) => ({
              proposalId: s(p.proposalId),
              kind: s(p.kind),
              priority: s(p.priority),
              title: s(p.title),
              rationale: s(p.rationale),
              suggestedAction: s(p.suggestedAction),
              source: s(p.source),
              targetPath: s(p.targetPath),
              requiresApproval: !!p.requiresApproval,
              evidence: Array.isArray(p.evidence) ? p.evidence.map(String) : []
            })),
            warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
            scannedAtUtc: s(payload.scannedAtUtc)
          }
        });
        return;
      }
      if (message.type === "error") {
        // 서버 오류에는 어느 요청의 응답인지 알려주는 값이 늘 붙지 않는다.
        // 요청 ID 가 있으면 그 구역만 실패로 바꾸고, 없으면 구역 상태를 건드리지 않고 따로 알린다.
        const requestId = typeof message.requestId === "string" ? message.requestId : "";
        const target = requestId.startsWith(REQUEST_PREFIX)
          ? (requestId.slice(REQUEST_PREFIX.length) as SliceId)
          : null;
        const text = s(message.message) || "오류";
        if (target !== null && useInsightsStore.getState().slices[target] !== undefined) {
          clearSliceTimer(target);
          useInsightsStore.setState((state) => ({ slices: markFailed(state.slices, target, text) }));
          return;
        }
        useInsightsStore.setState({
          gatewayNotice: `미들웨어가 오류를 보냈습니다: ${text} (어느 조회의 응답인지는 알 수 없습니다.)`
        });
      }
    });
  }, []);
}

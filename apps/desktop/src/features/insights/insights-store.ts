import { useEffect } from "react";
import { create } from "zustand";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopInsights } from "../middleware/insights-gateway";

type TelemetrySnapshot = {
  providers: Array<{ provider: string; eventCount: number; totalTokens: number; averageDurationMs: number; maxDurationMs: number }>;
  total: { eventCount: number; totalTokens: number; averageDurationMs: number };
  totalEvents: number;
};
type McpSnapshot = {
  configFiles: Array<{ source: string; path: string; status: string; serverCount: number }>;
  servers: Array<{ serverId: string; name: string; transport: string; status: string; message: string; readiness: string }>;
};
type LocalLlmSnapshot = {
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
type TerminalSnapshot = {
  status: string;
  ptySessionEnabled: boolean;
  shells: Array<{ name: string; command: string; status: string }>;
  toolchains: Array<{ name: string; command: string; status: string }>;
};
type GitTimeMachineSnapshot = {
  branchName: string;
  headShortHash: string;
  isRepository: boolean;
  isClean: boolean;
  changedFileCount: number;
  checkpoints: Array<{ shortHash: string; subject: string; authorName: string; authorDateUtc: string; isHead: boolean; rollbackCandidate: boolean }>;
};
type SemanticSnapshot = {
  status: string;
  mode: string;
  vectorSearchEnabled: boolean;
  embeddingGenerationEnabled: boolean;
  codeSearchRecommended: boolean;
  index: { dbExists: boolean; sqliteCliAvailable: boolean; ftsAvailable: boolean; sqliteVecAvailable: boolean; fileCount: number; chunkCount: number; embeddingCacheEntryCount: number; chunkSources: Array<{ source: string; count: number }> };
  embedding: { localEndpointAvailable: boolean; candidateModelAvailable: boolean; candidateModels: Array<{ endpointName: string; modelId: string }> };
};
type RepomapSnapshot = {
  status: string;
  scannedFileCount: number;
  mappedFileCount: number;
  symbolCount: number;
  truncated: boolean;
  files: Array<{ path: string; language: string; symbolCount: number; symbols: Array<{ name: string; kind: string; signature: string; line: number }> }>;
};
type CommitLearningSnapshot = {
  totalCommits: number;
  intents: Array<{ intent: string; commitCount: number; addedLines: number; deletedLines: number }>;
  hotspots: Array<{ path: string; changeCount: number; lastCommitShortHash: string; lastSubject: string }>;
};
type SelfImprovementSnapshot = {
  status: string;
  proposalCount: number;
  proposals: Array<{ proposalId: string; kind: string; priority: string; title: string; rationale: string; suggestedAction: string; requiresApproval: boolean }>;
};

type InsightsState = {
  telemetry: TelemetrySnapshot | null;
  mcp: McpSnapshot | null;
  localLlm: LocalLlmSnapshot | null;
  terminal: TerminalSnapshot | null;
  gitTimeMachine: GitTimeMachineSnapshot | null;
  semantic: SemanticSnapshot | null;
  repomap: RepomapSnapshot | null;
  commitLearning: CommitLearningSnapshot | null;
  selfImprovement: SelfImprovementSnapshot | null;
  loading: boolean;
  lastError: string;
  loadAll: () => void;
};

export const useInsightsStore = create<InsightsState>((set) => ({
  telemetry: null,
  mcp: null,
  localLlm: null,
  terminal: null,
  gitTimeMachine: null,
  semantic: null,
  repomap: null,
  commitLearning: null,
  selfImprovement: null,
  loading: false,
  lastError: "",
  loadAll: () => {
    set({ loading: true, lastError: "" });
    const ok =
      requestDesktopInsights.telemetry() &&
      requestDesktopInsights.mcpServers() &&
      requestDesktopInsights.localLlm() &&
      requestDesktopInsights.terminal() &&
      requestDesktopInsights.gitTimeMachine() &&
      requestDesktopInsights.semanticSearch() &&
      requestDesktopInsights.codeRepomap() &&
      requestDesktopInsights.commitLearning() &&
      requestDesktopInsights.selfImprovement();
    if (!ok) set({ loading: false, lastError: "인사이트 스냅샷 요청을 전송하지 못했다." });
  }
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

export function useInsightsPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      const payload = (message.payload || {}) as Record<string, unknown>;
      if (message.type === "telemetry_snapshot") {
        useInsightsStore.setState({
          loading: false,
          telemetry: {
            providers: arr(payload.providers).map((p) => ({ provider: s(p.provider), eventCount: n(p.eventCount), totalTokens: n(p.totalTokens), averageDurationMs: n(p.averageDurationMs), maxDurationMs: n(p.maxDurationMs) })),
            total: { eventCount: n((payload.total as Record<string, unknown>)?.eventCount), totalTokens: n((payload.total as Record<string, unknown>)?.totalTokens), averageDurationMs: n((payload.total as Record<string, unknown>)?.averageDurationMs) },
            totalEvents: n(payload.totalEvents)
          }
        });
        return;
      }
      if (message.type === "mcp_servers_snapshot") {
        useInsightsStore.setState({
          mcp: {
            configFiles: arr(payload.configFiles).map((c) => ({ source: s(c.source), path: s(c.path), status: s(c.status), serverCount: n(c.serverCount) })),
            servers: arr(payload.servers).map((sv) => ({ serverId: s(sv.serverId), name: s(sv.name), transport: s(sv.transport), status: s(sv.status), message: s(sv.message), readiness: s((sv.readiness as Record<string, unknown>)?.status) }))
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
            shells: arr(payload.shells).map((sh) => ({ name: s(sh.name), command: s(sh.command), status: s(sh.status) })),
            toolchains: arr(payload.toolchains).map((t) => ({ name: s(t.name), command: s(t.command), status: s(t.status) }))
          }
        });
        return;
      }
      if (message.type === "git_time_machine_snapshot") {
        useInsightsStore.setState({
          gitTimeMachine: {
            branchName: s(payload.branchName),
            headShortHash: s(payload.headShortHash),
            isRepository: !!payload.isRepository,
            isClean: !!payload.isClean,
            changedFileCount: n(payload.changedFileCount),
            checkpoints: arr(payload.checkpoints).map((c) => ({ shortHash: s(c.shortHash), subject: s(c.subject), authorName: s(c.authorName), authorDateUtc: s(c.authorDateUtc), isHead: !!c.isHead, rollbackCandidate: !!c.rollbackCandidate }))
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
              candidateModels: arr(embedding.candidateModels).map((m) => ({ endpointName: s(m.endpointName), modelId: s(m.modelId) }))
            }
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
            totalCommits: n(payload.totalCommits),
            intents: arr(payload.intents).map((i) => ({ intent: s(i.intent), commitCount: n(i.commitCount), addedLines: n(i.addedLines), deletedLines: n(i.deletedLines) })),
            hotspots: arr(payload.hotspots).map((h) => ({ path: s(h.path), changeCount: n(h.changeCount), lastCommitShortHash: s(h.lastCommitShortHash), lastSubject: s(h.lastSubject) }))
          }
        });
        return;
      }
      if (message.type === "self_improvement_snapshot") {
        useInsightsStore.setState({
          selfImprovement: {
            status: s(payload.status),
            proposalCount: n(payload.proposalCount),
            proposals: arr(payload.proposals).map((p) => ({
              proposalId: s(p.proposalId),
              kind: s(p.kind),
              priority: s(p.priority),
              title: s(p.title),
              rationale: s(p.rationale),
              suggestedAction: s(p.suggestedAction),
              requiresApproval: !!p.requiresApproval
            }))
          }
        });
        return;
      }
      if (message.type === "error") {
        useInsightsStore.setState({ loading: false, lastError: s(message.message) || "오류" });
      }
    });
  }, []);
}

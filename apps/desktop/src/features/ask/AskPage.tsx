import { useEffect, useRef } from "react";
import { BrainCircuit, FileImage, Inbox, Paperclip, Plus, RefreshCw, Search, Send, Trash2, X } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useAskPageBridge, useAskStore } from "./ask-store";
import { filesToVisionAttachments } from "./ask-vision";
import { AskVisionPanel } from "./AskVisionPanel";
import { MarkdownMessage } from "./MarkdownMessage";
import { Badge, Button, EmptyState, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

function MessageBubble({ role, text }: { role: string; text: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="prose-omnux max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-card px-3.5 py-2">
        <MarkdownMessage text={text} />
      </div>
    </div>
  );
}

function formatTime(value: string) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function ragTone(value: string): "success" | "warning" | "destructive" | "primary" | "default" | "outline" {
  const normalized = value.toLowerCase();
  if (/(recommended|hybrid|memory|code|web|session|repomap)/.test(normalized)) return "primary";
  if (/(none|no_retrieval|skipped)/.test(normalized)) return "outline";
  if (/(blocked|error|fail)/.test(normalized)) return "destructive";
  if (/(warn|pending)/.test(normalized)) return "warning";
  if (/(ready|ok)/.test(normalized)) return "success";
  return "default";
}

export function AskPage() {
  useAskPageBridge();
  const visionFileInputRef = useRef<HTMLInputElement>(null);
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useAskStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const displayedConversations = store.searchQuery
    ? store.searchResults
        .map((item) => ({
          id: item.conversationId,
          title: item.title,
          preview: item.snippet,
          updatedUtc: "",
          messageCount: 0,
          project: "",
          category: ""
        }))
        .filter((item) => item.id)
    : store.conversations;

  const handleVisionFiles = async (files: FileList | null) => {
    try {
      const attachments = await filesToVisionAttachments(files);
      useAskStore.setState({
        visionFiles: attachments,
        visionPreflight: null,
        lastError: attachments.length > 0 ? null : "지원되는 이미지 파일을 선택하세요."
      });
    } catch (error) {
      useAskStore.setState({ lastError: error instanceof Error ? error.message : "이미지 파일을 읽지 못했다." });
    }
  };

  useEffect(() => {
    if (canRequest) {
      store.loadConversations();
      store.loadMemoryNotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[560px] flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">질문</h1>
        <p className="text-sm text-muted-foreground">대화, 메모리, 모델 라우팅을 한 화면에서 확인합니다.</p>
      </div>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* 대화 목록 */}
        <CardBoundary title="대화 목록" card="navigation" onError={recordCardError}>
          {store.lastError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" className="flex-1" onClick={store.createConversation} disabled={!canRequest}>
              <Plus size={15} aria-hidden="true" /> 새 대화
            </Button>
            <Button variant="outline" size="icon" aria-label="새로고침" onClick={store.loadConversations} disabled={!canRequest}>
              <RefreshCw size={15} aria-hidden="true" />
            </Button>
          </div>

          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="pl-8"
              value={store.searchQuery}
              placeholder="대화 검색 후 Enter"
              onChange={(event) => useAskStore.setState({ searchQuery: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (canRequest) store.searchConversations(store.searchQuery);
                }
              }}
            />
            {store.searchQuery ? (
              <button
                type="button"
                onClick={store.clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                해제
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {displayedConversations.map((item) => {
              const active = item.id === store.activeConversationId;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group rounded-md border px-2 py-2 transition-colors duration-200",
                    active ? "border-primary/40 bg-accent" : "border-transparent hover:bg-accent/60"
                  )}
                >
                  <button type="button" className="flex w-full flex-col text-left" onClick={() => store.openConversation(item)} disabled={!canRequest}>
                    <span className="truncate text-sm font-medium">{item.title}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{item.preview || `${item.messageCount}개 메시지`}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{formatTime(item.updatedUtc) || item.category || "대화"}</span>
                  </button>
                  <div className="row-actions mt-1.5 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => store.renameConversation(item)} disabled={!canRequest}>
                      이름
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => store.saveConversationToMemory(item)} disabled={!canRequest}>
                      메모리
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => store.deleteConversation(item)}
                      disabled={!canRequest}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {displayedConversations.length === 0 ? (
              <EmptyState icon={Inbox} title="대화 없음" description={canRequest ? "새 대화를 시작해 보세요." : "미들웨어에 연결되면 대화가 표시됩니다."} />
            ) : null}
          </div>

          <div className="border-t border-border pt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>메모리</span>
              <span>{store.loadingMemoryNotes ? "조회 중" : `${store.memoryNotes.length}건`}</span>
            </div>
            <div className="mt-1.5 space-y-1">
              {store.memoryNotes.slice(0, 3).map((note) => (
                <div key={note.name} className="rounded-md bg-muted/40 px-2 py-1.5">
                  <p className="truncate text-xs font-medium">{note.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{note.excerpt || "메모리 노트"}</p>
                </div>
              ))}
            </div>
          </div>
        </CardBoundary>

        {/* 대화 본문 */}
        <CardBoundary title="대화 본문" card="operations" onError={recordCardError}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="outline">세션 {store.activeConversationId || "-"}</Badge>
            <select className={SELECT_CLASS} value={store.chatMode} onChange={(event) => store.setChatMode(event.target.value as typeof store.chatMode)}>
              <option value="single">single</option>
              <option value="orchestration">orchestration</option>
              <option value="multi">multi</option>
            </select>
            {store.pending ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Spinner size={13} /> 생성 중
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={store.runRagPreflight} disabled={!canRequest || store.ragPending || !store.input.trim()}>
              <BrainCircuit size={14} aria-hidden="true" /> {store.ragPending ? "점검 중" : "검색 점검"}
            </Button>
            <input
              ref={visionFileInputRef}
              className="sr-only"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                const files = event.currentTarget.files;
                void handleVisionFiles(files);
                event.currentTarget.value = "";
              }}
            />
            <Button variant="outline" size="sm" onClick={() => visionFileInputRef.current?.click()}>
              <Paperclip size={14} aria-hidden="true" /> 이미지
            </Button>
            <Button variant="outline" size="sm" onClick={store.runVisionPreflight} disabled={!canRequest || store.visionPending || store.visionFiles.length === 0}>
              <FileImage size={14} aria-hidden="true" /> {store.visionPending ? "점검 중" : "Vision 점검"}
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {store.ragPreflight ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={ragTone(store.ragPreflight.status)}>{store.ragPreflight.status || "preflight"}</Badge>
                      <Badge tone={ragTone(store.ragPreflight.primaryStrategy)}>{store.ragPreflight.primaryStrategy || "none"}</Badge>
                      <Badge tone={store.ragPreflight.retrievalRecommended ? "primary" : "outline"}>
                        {store.ragPreflight.retrievalRecommended ? "retrieval" : "no retrieval"}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{store.ragPreflight.queryPreview}</p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="RAG preflight 닫기" onClick={store.clearRagPreflight}>
                    <X size={14} aria-hidden="true" />
                  </Button>
                </div>
                <div className="mt-2 space-y-1">
                  {store.ragPreflight.candidates.slice(0, 4).map((candidate) => (
                    <div key={`${candidate.kind}-${candidate.suggestedRequestType}`} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5">
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">{candidate.kind}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{candidate.reason}</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge tone={ragTone(candidate.priority)}>{candidate.suggestedRequestType || candidate.priority}</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => store.runRagCandidate(candidate)}
                          disabled={
                            !canRequest ||
                            store.ragExecution?.loading ||
                            candidate.kind === "none" ||
                            !candidate.suggestedRequestType ||
                            (candidate.suggestedRequestType === "session_replay_get" && !store.activeConversationId)
                          }
                        >
                          조회
                        </Button>
                      </div>
                    </div>
                  ))}
                  {store.ragPreflight.candidates.length === 0 ? <p className="py-2 text-center text-xs text-muted-foreground">검색 후보 없음</p> : null}
                </div>
                {store.ragPreflight.signals.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {store.ragPreflight.signals.slice(0, 6).map((signal) => <Badge key={signal} tone="outline">{signal}</Badge>)}
                  </div>
                ) : null}
                {store.ragExecution ? (
                  <div className="mt-2 rounded-md border border-border bg-background/50 p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={ragTone(store.ragExecution.status)}>{store.ragExecution.status}</Badge>
                      <Badge tone="outline">{store.ragExecution.requestType}</Badge>
                      <Badge tone={ragTone(store.ragExecution.kind)}>{store.ragExecution.kind}</Badge>
                      {store.ragExecution.loading ? <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Spinner size={12} /> 조회 중</span> : null}
                    </div>
                    {store.ragExecution.error ? <p className="mt-1 truncate text-xs text-destructive">{store.ragExecution.error}</p> : null}
                    <div className="mt-2 space-y-1">
                      {store.ragExecution.items.slice(0, 6).map((item) => (
                        <div key={`${item.title}-${item.badge}`} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">{item.title}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">{item.detail || "detail -"}</span>
                          </span>
                          <span className="flex shrink-0 flex-wrap justify-end gap-1">
                            <Badge tone="outline">{item.badge || "-"}</Badge>
                            {item.badges?.slice(0, 3).map((badge) => <Badge key={badge} tone="outline">{badge}</Badge>)}
                          </span>
                        </div>
                      ))}
                      {!store.ragExecution.loading && store.ragExecution.items.length === 0 ? <p className="py-2 text-center text-xs text-muted-foreground">조회 결과 없음</p> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <AskVisionPanel files={store.visionFiles} preflight={store.visionPreflight} pending={store.visionPending} onClear={store.clearVisionPreflight} />
            {store.messages.map((message, index) => (
              <MessageBubble key={`${index}-${message.role}`} role={message.role} text={message.text} />
            ))}
            {store.messages.length === 0 ? (
              <EmptyState icon={Send} title="메시지를 입력해 대화를 시작하세요" description="single·orchestration·multi 모드로 모델 라우팅을 비교할 수 있습니다." />
            ) : null}

            {store.multiResult ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                {store.multiResult.summary ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">요약</p>
                    <p className="text-sm">{store.multiResult.summary}</p>
                  </div>
                ) : null}
                {store.multiResult.providers.map((item) => (
                  <div key={item.key} className="rounded-md border border-border bg-card p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{item.label}</span>
                      <Badge tone="primary">{item.model || "model -"}</Badge>
                    </div>
                    <p className="prose-omnux mt-1 text-sm text-muted-foreground">{item.text || "응답 없음"}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex items-end gap-2 border-t border-border pt-3">
            <Textarea
              className="min-h-[60px]"
              rows={2}
              value={store.input}
              placeholder="메시지를 입력하고 Enter (Shift+Enter 줄바꿈)"
              onChange={(event) => useAskStore.setState({ input: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (canRequest) store.sendMessage();
                }
              }}
            />
            <Button variant="primary" size="icon" aria-label="전송" onClick={store.sendMessage} disabled={!store.input.trim() || !canRequest}>
              <Send size={17} aria-hidden="true" />
            </Button>
          </div>
        </CardBoundary>
      </section>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Check, Globe, ListTodo, Mic, Paperclip, Plus, Send, X } from "lucide-react";
import { Card, cn } from "../../components/ui/primitives";
import {
  ASK_PROVIDER_OPTIONS,
  useAskStore,
  type AskChatMode,
  type AskModelProvider,
  type AskProvider
} from "../ask/ask-store";
import { abbreviateModel, inferComposerIntent, type ComposerIntent } from "./composer-intent";
import { sendFromHome } from "./composer-send";
import { useDictation } from "./useDictation";

type IntentMode = "auto" | ComposerIntent;
type PopoverId = "intent" | "mode" | "model" | "tools";

function intentText(mode: IntentMode): string {
  return mode === "auto" ? "Auto" : mode === "build" ? "Build" : "Ask";
}

const MODEL_PROVIDERS = ASK_PROVIDER_OPTIONS.filter((option) => option.value !== "auto") as Array<{
  value: AskModelProvider;
  label: string;
}>;

function intentLabel(intent: ComposerIntent): string {
  return intent === "build" ? "Build" : "Ask";
}

function chatModeLabel(mode: AskChatMode): string {
  if (mode === "single") return "Single";
  if (mode === "multi") return "Multi";
  return "Orchestration";
}

export function HeroComposer() {
  const modelCatalogs = useAskStore((state) => state.modelCatalogs);
  const loadModelCatalogs = useAskStore((state) => state.loadModelCatalogs);

  const [value, setValue] = useState("");
  const [intentMode, setIntentMode] = useState<IntentMode>("auto");
  const [chatMode, setChatMode] = useState<AskChatMode>("single");
  const [provider, setProvider] = useState<AskProvider>("auto");
  const [model, setModel] = useState<string | null>(null);
  const [thinkPlus, setThinkPlus] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [popover, setPopover] = useState<PopoverId | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dictation = useDictation((next) => setValue(next));
  const tauriRuntime = isTauri();

  const effectiveIntent: ComposerIntent = intentMode === "auto" ? inferComposerIntent(value) : intentMode;
  const connectedProviders = MODEL_PROVIDERS.filter((option) => (modelCatalogs[option.value]?.length || 0) > 0);
  const selectedProvider: AskModelProvider | null = provider !== "auto" ? provider : null;
  const providerModels = selectedProvider ? modelCatalogs[selectedProvider] || [] : [];
  const canSend = Boolean(value.trim()) || files.length > 0;
  const toolsOpen = popover === "tools" || (!tauriRuntime && popover === "model");
  // 자동(+미입력)일 땐 배지를 아예 숨긴다. 수동 선택했거나 입력이 있으면 Ask/Build 표시.
  const showBadge = intentMode !== "auto" || Boolean(value.trim());
  const intentOptions: readonly IntentMode[] = showBadge
    ? [effectiveIntent === "ask" ? "build" : "ask", "auto"]
    : ["ask", "build"];
  const chatModeOptions: readonly AskChatMode[] =
    chatMode === "single"
      ? ["orchestration", "multi"]
      : chatMode === "orchestration"
        ? ["single", "multi"]
        : ["single", "orchestration"];

  useEffect(() => {
    loadModelCatalogs();
  }, [loadModelCatalogs]);

  // 입력 길이에 따라 입력창이 아래로 자동 성장(최대 200px 후 스크롤).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // 바깥 클릭 / Esc 로 팝오버 닫기.
  useEffect(() => {
    if (!popover) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setPopover(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPopover(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [popover]);

  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const next = Array.from(incoming);
    if (next.length === 0) return;
    setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const submit = async () => {
    if (!canSend) return;
    setPopover(null);
    await sendFromHome({ intent: effectiveIntent, text: value.trim(), chatMode, provider, model, thinkPlus, files });
    setValue("");
    setFiles([]);
    setThinkPlus(false);
  };

  const modelButtonLabel =
    provider === "auto"
      ? "모델 자동"
      : model
        ? abbreviateModel(model)
        : ASK_PROVIDER_OPTIONS.find((p) => p.value === provider)?.label ?? "모델";
  const modelStatusLabel = provider === "auto" ? "Auto" : model ? abbreviateModel(model) : "LLM";

  return (
    <div ref={rootRef} className="relative">
      {/* pl: 카드 보더(1px) + 카드 내부 pl-4(16px) = 17px → 배지 텍스트를 입력창 텍스트 시작점과 정렬 */}
      {/* pr-[21px]: 모드 버튼(가운데 아이콘) 중심을 하단 Think+ 버튼 중심과 세로 정렬(3개 아이콘 간격은 동일 유지) */}
      <div className="relative z-20 mb-1 flex items-center justify-end gap-1.5 pl-[17px] pr-[21px]">
        <div className="mr-auto flex items-center gap-1.5">
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => setPopover((c) => (c === "intent" ? null : "intent"))}
              title="전송 대상 (Auto·Ask·Build)"
              className={cn(
                "flex shrink-0 items-center justify-center text-xs font-semibold leading-none transition-colors duration-200",
                !showBadge && popover !== "intent" ? "ml-[7px] w-4" : "w-auto",
                popover === "intent" ? "text-primary" : "text-muted-foreground/80 hover:text-foreground"
              )}
            >
              {showBadge ? intentLabel(effectiveIntent) : popover === "intent" ? "Auto" : "·"}
            </button>
            <div
              className={cn(
                "flex items-center overflow-hidden whitespace-nowrap transition-all duration-300 ease-out",
                popover === "intent" ? "max-w-[240px] opacity-100" : "max-w-0 opacity-0"
              )}
            >
              {intentOptions.map((opt) => (
                <span key={opt} className="flex items-center">
                  <span className="px-1.5 text-[10px] text-border" aria-hidden="true">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIntentMode(opt);
                      setPopover(null);
                    }}
                    className="text-xs font-medium leading-none text-muted-foreground/70 transition-colors duration-200 hover:text-foreground"
                  >
                    {intentText(opt)}
                  </button>
                </span>
              ))}
            </div>
          </div>

          <span className="text-[10px] text-border" aria-hidden="true">|</span>

          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => setPopover((current) => (current === "mode" ? null : "mode"))}
              title="응답 모드"
              className={cn(
                "shrink-0 text-xs font-semibold leading-none transition-colors duration-200",
                popover === "mode" ? "text-primary" : "text-muted-foreground/80 hover:text-foreground"
              )}
            >
              {chatModeLabel(chatMode)}
            </button>
            <div
              className={cn(
                "flex items-center overflow-hidden whitespace-nowrap transition-all duration-300 ease-out",
                popover === "mode" ? "max-w-[260px] opacity-100" : "max-w-0 opacity-0"
              )}
            >
              {chatModeOptions.map((option) => (
                <span key={option} className="flex items-center">
                  <span className="px-1.5 text-[10px] text-border" aria-hidden="true">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setChatMode(option);
                      setPopover(null);
                    }}
                    className="text-xs font-medium leading-none text-muted-foreground/70 transition-colors duration-200 hover:text-foreground"
                  >
                    {chatModeLabel(option)}
                  </button>
                </span>
              ))}
            </div>
          </div>

          <span className="text-[10px] text-border" aria-hidden="true">|</span>
          <button
            type="button"
            onClick={() => setPopover((current) => (current === "model" ? null : "model"))}
            title={model ?? "모델 선택"}
            className={cn(
              "max-w-40 truncate text-xs font-semibold leading-none transition-colors duration-200",
              popover === "model" ? "text-primary" : "text-muted-foreground/80 hover:text-foreground"
            )}
          >
            {modelStatusLabel}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {/* 입력 카드 — 한 줄 컴팩트 + 드롭존 */}
      <Card
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          addFiles(event.dataTransfer?.files ?? null);
        }}
        className={cn(
          "!mt-0 overflow-visible !rounded-3xl text-left !bg-card/60 transition-all duration-300 focus-within:!bg-card focus-within:scale-[1.01] focus-within:shadow-xl hover:!bg-card",
          dragActive && "ring-2 ring-primary/60"
        )}
      >
        <div className="flex items-center gap-2 pl-4 pr-1.5 py-2.5">
          <div className="flex shrink-0 items-center">
            <RoundButton
              icon={Plus}
              label="추가 메뉴"
              active={toolsOpen}
              className={cn("transition-transform duration-300", toolsOpen && "rotate-45")}
              onClick={() =>
                setPopover((current) =>
                  current === "tools" || (!tauriRuntime && current === "model") ? null : "tools"
                )
              }
            />
            <div
              className={cn(
                "flex items-center overflow-hidden transition-all duration-300 ease-out",
                toolsOpen
                  ? tauriRuntime
                    ? "w-8 opacity-100"
                    : "w-16 opacity-100"
                  : "pointer-events-none w-0 opacity-0"
              )}
            >
              <RoundButton
                icon={Paperclip}
                label="파일 첨부"
                active={files.length > 0}
                onClick={() => fileInputRef.current?.click()}
              />
              {!tauriRuntime ? (
                <RoundButton
                  icon={ListTodo}
                  label={`모델: ${modelButtonLabel}`}
                  active={popover === "model"}
                  onClick={() => setPopover((current) => (current === "model" ? null : "model"))}
                />
              ) : null}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            aria-label="omnux 명령 입력"
            rows={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="무엇을 할까요?"
            className="block max-h-[200px] min-w-0 flex-1 resize-none px-0 whitespace-pre-wrap break-keep bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none [overflow-wrap:anywhere] xl:text-base"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />

          {/* WKWebView(앱)는 SpeechRecognition 미지원 → 앱에서는 마이크 숨김(브라우저에서만 노출). */}
          {dictation.supported && !tauriRuntime ? (
            <RoundButton
              icon={Mic}
              label={dictation.listening ? "받아쓰기 중지" : "음성 입력"}
              active={dictation.listening}
              pulse={dictation.listening}
              className="left-1"
              onClick={() => dictation.toggle(value)}
            />
          ) : null}

          {tauriRuntime ? (
            <div className="shrink-0">
              <RoundButton
                icon={ListTodo}
                label={`모델: ${modelButtonLabel}`}
                active={popover === "model"}
                onClick={() => setPopover((current) => (current === "model" ? null : "model"))}
              />
            </div>
          ) : null}

          <RoundButton icon={Globe} label="Think+ (확장 추론)" active={thinkPlus} onClick={() => setThinkPlus((on) => !on)} />

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSend}
            aria-label={`${intentLabel(effectiveIntent)}으로 전송`}
            title={`${intentLabel(effectiveIntent)}으로 전송`}
            className="relative right-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-transparent text-primary/70 transition-all duration-300 hover:!bg-primary hover:text-primary-foreground active:scale-95 disabled:opacity-40"
          >
            <Send size={15} aria-hidden="true" />
          </button>
        </div>

        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
            popover === "model" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mx-3 mb-3 overflow-hidden rounded-2xl border border-border bg-muted/25 shadow-sm backdrop-blur-xl">
              <div className="flex h-11 items-center gap-1 overflow-x-auto border-b border-border px-2">
                <button
                  type="button"
                  onClick={() => {
                    setProvider("auto");
                    setModel(null);
                  }}
                  className={cn(
                    "flex h-7 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-xs font-medium transition-colors",
                    provider === "auto" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  자동
                  {provider === "auto" ? <Check size={12} aria-hidden="true" /> : null}
                </button>
                {connectedProviders.map((option) => {
                  const selected = provider === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setProvider(option.value);
                        setModel(null);
                      }}
                      className={cn(
                        "flex h-7 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-xs font-medium transition-colors",
                        selected ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      {selected ? <Check size={12} aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>

              <div className="h-[110px] overflow-hidden p-2">
                {selectedProvider ? (
                  providerModels.length > 0 ? (
                    <div className="grid h-full grid-flow-col grid-rows-3 auto-cols-fr gap-1">
                      {providerModels.map((modelId) => {
                        const selected = model === modelId;
                        return (
                          <button
                            key={modelId}
                            type="button"
                            title={modelId}
                            onClick={() => {
                              setModel(modelId);
                              setPopover(null);
                            }}
                            className={cn(
                              "flex min-w-0 items-center justify-between gap-1 rounded-lg px-2 text-left text-[11px] transition-colors",
                              selected ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                          >
                            <span className="truncate">{abbreviateModel(modelId)}</span>
                            {selected ? <Check size={12} className="shrink-0" aria-hidden="true" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="flex h-full items-center justify-center text-xs text-muted-foreground">모델 목록이 없습니다.</p>
                  )
                ) : (
                  <p className="flex h-full items-center justify-center text-xs text-muted-foreground">제공자를 선택하면 모델 목록이 표시됩니다.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 첨부 칩 */}
        {files.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
            {files.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="flex max-w-[200px] items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs"
              >
                <Paperclip size={11} className="shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{file.name}</span>
                <button type="button" onClick={() => removeFile(index)} aria-label={`${file.name} 제거`} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function RoundButton({
  icon: Icon,
  label,
  active = false,
  pulse = false,
  className,
  onClick
}: {
  icon: typeof Paperclip;
  label: string;
  active?: boolean;
  pulse?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-95",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className
      )}
    >
      <Icon size={16} aria-hidden="true" />
      {pulse ? <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" aria-hidden="true" /> : null}
    </button>
  );
}

import { useRef, useState } from "react";
import { Paperclip, Mic, MicOff, Plus, Globe, BookOpen } from "lucide-react";
import { useAskStore } from "../ask/ask-store";
import { ASK_PROVIDER_OPTIONS } from "../ask/ask-defaults";
import { mergeModelOptions } from "../ask/ask-models";
import { filesToAttachments, hasDraggedFiles } from "../ask/AskAttachments";
import { useVoiceInput } from "../ask/AskSpeech";
import { shortcutMatches, useDesktopPreferenceStore } from "../shell/preference-store";
import { abbreviateModel } from "../home/composer-intent";
import {
  AttachmentChip,
  CAPSULE_FIELD,
  CapsuleCard,
  CapsuleRow,
  ExpandChoice,
  ExpandDivider,
  ExtrasRow,
  MODE_CHOICES,
  ModelAccordion,
  RoundIcon,
  SendRound,
  ToolsReveal,
  modeChoiceLabel,
  useCapsuleDismiss
} from "../../components/capsule/capsule";
import { TuningChoices, type ContextBudget } from "../../components/capsule/tuning";
import type { ReasoningLevel } from "../ask/model-registry";
import type { AskChatMode, AskProvider } from "../ask/ask-types";

type OpenId = "mode" | "model" | "tools" | "reasoning" | "context" | null;

export function ChatComposer({ canRequest }: { canRequest: boolean }) {
  const state = useAskStore();
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState<OpenId>(null);
  const voice = useVoiceInput();
  const shortcuts = useDesktopPreferenceStore((s) => s.shortcuts);
  const canSend = canRequest && !state.pending && !state.readingFiles && (!!state.input.trim() || !!state.attachments.length);
  const toolsOpen = open === "tools";
  const provider = state.provider;
  const selectedModel = provider === "auto" ? null : state.selectedModels[provider] || null;
  const models = provider === "auto" ? [] : mergeModelOptions(provider, state.modelCatalogs[provider]);
  const modelLabel =
    provider === "auto"
      ? "자동"
      : selectedModel
        ? abbreviateModel(selectedModel)
        : ASK_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? "모델";
  const modeOptions = MODE_CHOICES.filter((entry) => entry.value !== state.chatMode);
  const grow = () => {
    const node = area.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(96, Math.max(24, node.scrollHeight))}px`;
  };
  const attach = async (files: FileList | File[] | null) => {
    const current = useAskStore.getState();
    if (current.readingFiles || !files?.length) return;
    useAskStore.setState({ readingFiles: true });
    try {
      const result = await filesToAttachments(files, current.attachments.length);
      useAskStore.getState().addAttachments(result.items);
      if (result.error) useAskStore.setState({ lastError: result.error });
    } catch (error) {
      useAskStore.setState({ lastError: error instanceof Error ? error.message : "파일을 읽지 못했습니다." });
    } finally {
      useAskStore.setState({ readingFiles: false });
    }
  };
  const send = () => {
    if (canSend) {
      voice.stop();
      setOpen(null);
      state.sendMessage();
      requestAnimationFrame(grow);
    }
  };

  useCapsuleDismiss(Boolean(open), root, () => setOpen(null));

  return (
    <div ref={root} className="min-w-0">
      <ExtrasRow>
        <ExpandChoice
          label={modeChoiceLabel(state.chatMode)}
          title="모드"
          open={open === "mode"}
          options={modeOptions}
          onToggle={() => setOpen((current) => (current === "mode" ? null : "mode"))}
          onSelect={(value) => {
            state.setChatMode(value as AskChatMode);
            if (value !== "single") state.setSidePanel("models");
            setOpen(null);
          }}
        />
        <ExpandDivider />
        <button
          type="button"
          title="모델 선택"
          aria-expanded={open === "model"}
          onClick={() => setOpen((current) => (current === "model" ? null : "model"))}
          className={`max-w-40 truncate rounded-sm text-xs font-semibold leading-none transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
            open === "model" ? "text-primary" : "text-muted-foreground/80 hover:text-foreground"
          }`}
        >
          {modelLabel}
        </button>
        <TuningChoices
          provider={provider}
          model={selectedModel}
          reasoning={state.reasoningEffort}
          context={state.contextBudget}
          webSearch={state.webSearchEnabled}
          openId={open === "reasoning" || open === "context" ? open : null}
          onToggle={(id) => setOpen((current) => (current === id ? null : id))}
          onReasoning={(value) => {
            state.setReasoningEffort(value as ReasoningLevel);
            setOpen(null);
          }}
          onContext={(value) => {
            state.setContextBudget(value as ContextBudget);
            setOpen(null);
          }}
        />
      </ExtrasRow>
      <CapsuleCard
        className="chat-compose"
        dragging={dragging}
        role="region"
        aria-label="질문 작성"
        onDragOver={(event) => {
          if (hasDraggedFiles(event.dataTransfer)) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          if (hasDraggedFiles(event.dataTransfer)) {
            event.preventDefault();
            setDragging(false);
            void attach(event.dataTransfer.files);
          }
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <CapsuleRow>
            <label htmlFor="chat-request" className="chat-sr">
              {state.messages.length ? "이어서 질문하기" : "무엇이 궁금하신가요?"}
            </label>
            <div className="flex shrink-0 items-center">
              <RoundIcon
                icon={Plus}
                label="추가 메뉴"
                active={toolsOpen}
                className={toolsOpen ? "rotate-45" : ""}
                onClick={() => setOpen((current) => (current === "tools" ? null : "tools"))}
              />
              <ToolsReveal open={toolsOpen} widthClass="w-16">
                <RoundIcon icon={Paperclip} label="파일 첨부" active={state.attachments.length > 0} disabled={state.readingFiles} onClick={() => input.current?.click()} />
                <RoundIcon
                  icon={BookOpen}
                  label="참고 자료"
                  active={state.selectedMemoryNotes.length > 0}
                  onClick={() => {
                    state.setSidePanel("memory");
                    setOpen(null);
                  }}
                />
              </ToolsReveal>
            </div>
            <textarea
              id="chat-request"
              ref={area}
              rows={1}
              value={state.input}
              placeholder="무엇이 궁금하신가요?"
              className={CAPSULE_FIELD}
              onChange={(event) => {
                state.setInput(event.target.value);
                grow();
              }}
              onPaste={(event) => {
                if (event.clipboardData.files.length) {
                  event.preventDefault();
                  void attach(event.clipboardData.files);
                }
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                if ((event.key === "Enter" && !event.shiftKey) || shortcutMatches(event.nativeEvent, shortcuts.send)) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <input
              className="chat-file-input"
              ref={input}
              type="file"
              multiple
              aria-label="질문 첨부 파일"
              onChange={(event) => {
                void attach(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
            {voice.supported ? (
              <RoundIcon
                icon={voice.active ? MicOff : Mic}
                label="음성 입력"
                active={voice.active}
                pulse={voice.active}
                onClick={() => voice.toggle(state.input)}
              />
            ) : null}
            <RoundIcon icon={Globe} label="Think+" active={state.thinkPlus} onClick={() => state.setThinkPlus(!state.thinkPlus)} />
            <SendRound label="질문 보내기" disabled={!canSend} />
          </CapsuleRow>
        </form>
        <ModelAccordion
          open={open === "model"}
          providers={ASK_PROVIDER_OPTIONS}
          selectedProvider={provider}
          models={models}
          selectedModel={selectedModel}
          onProvider={(value) => state.setProvider(value as AskProvider)}
          onModel={(value) => {
            if (provider !== "auto") state.setSelectedModel(provider, value);
            setOpen(null);
          }}
        />
        {(state.attachmentPanelOpen || state.attachments.length > 0) && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2.5" aria-label="첨부한 파일">
            {state.attachments.map((file, index) => (
              <AttachmentChip
                key={`${file.name}-${index}`}
                name={file.name}
                detail={`(${Math.ceil(file.sizeBytes / 1024)} KB)`}
                onRemove={() => useAskStore.setState((s) => ({ attachments: s.attachments.filter((_, i) => i !== index) }))}
              />
            ))}
            {!state.attachments.length && (
              <button type="button" className="chat-button" onClick={() => input.current?.click()}>
                파일 선택
              </button>
            )}
          </div>
        )}
        {voice.error && (
          <p role="alert" className="chat-error">
            {voice.error}
          </p>
        )}
        {state.readingFiles && (
          <p role="status" className="chat-muted px-4 pb-2">
            파일을 읽고 있습니다.
          </p>
        )}
        {dragging && (
          <p role="status" className="px-4 pb-2 text-xs">
            여기에 파일을 놓으세요.
          </p>
        )}
      </CapsuleCard>
    </div>
  );
}

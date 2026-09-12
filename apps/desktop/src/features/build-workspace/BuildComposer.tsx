import { useEffect, useRef, useState } from "react";
import { Globe, Paperclip, Plus } from "lucide-react";
import { useBuildWorkspace, busyBuild } from "./build-state";
import { modelOptions, providers, type BuildMode, type BuildProvider, type ContextBudget, type ReasoningEffort } from "./build-model";
import { TuningChoices } from "../../components/capsule/tuning";
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

type OpenId = "mode" | "model" | "tools" | "reasoning" | "context" | null;

export function BuildComposer({ connected }: { connected: boolean }) {
  const state = useBuildWorkspace();
  const busy = busyBuild(state);
  const files = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<OpenId>(null);
  const [dragging, setDragging] = useState(false);
  const settings = state.settings;
  const provider = settings.provider;
  const selectedModel = provider === "auto" ? null : settings.models[provider] || null;
  const models = provider === "auto" ? [] : modelOptions(provider, state.catalogs);
  const modelLabel =
    provider === "auto"
      ? "자동"
      : selectedModel
        ? abbreviateModel(selectedModel)
        : providers.find((option) => option.value === provider)?.label ?? "모델";
  const modeOptions = MODE_CHOICES.filter((entry) => entry.value !== settings.mode);
  const accordionProviders = providers.map((option) => (option.value === "auto" ? { value: "auto", label: "자동" } : option));
  const canSend = connected && !busy && (!!state.input.trim() || state.attachments.length > 0);
  const toolsOpen = open === "tools";
  const modeLocked = Boolean(state.activeId);
  const grow = () => {
    const node = area.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(96, Math.max(24, node.scrollHeight))}px`;
  };

  useEffect(() => {
    if (open === "model") state.loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useCapsuleDismiss(Boolean(open), root, () => setOpen(null));

  const send = () => {
    if (!canSend) return;
    setOpen(null);
    state.run();
    requestAnimationFrame(grow);
  };

  return (
    <div ref={root} className="min-w-0">
      <ExtrasRow>
        <ExpandChoice
          label={modeChoiceLabel(settings.mode)}
          title="모드"
          open={open === "mode"}
          options={modeOptions}
          disabled={modeLocked || busy}
          onToggle={() => setOpen((current) => (current === "mode" ? null : "mode"))}
          onSelect={(value) => {
            if (modeLocked) return;
            state.patchSettings({ mode: value as BuildMode });
            if (value !== "single") useBuildWorkspace.setState({ settingsOpen: true });
            setOpen(null);
          }}
        />
        <ExpandDivider />
        <button
          type="button"
          title="모델 선택"
          aria-expanded={open === "model"}
          disabled={busy}
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
          reasoning={settings.reasoning}
          context={settings.context}
          webSearch={settings.webSearch}
          disabled={busy}
          openId={open === "reasoning" || open === "context" ? open : null}
          onToggle={(id) => setOpen((current) => (current === id ? null : id))}
          onReasoning={(value) => {
            state.patchSettings({ reasoning: value as ReasoningEffort });
            setOpen(null);
          }}
          onContext={(value) => {
            state.patchSettings({ context: value as ContextBudget });
            setOpen(null);
          }}
        />
      </ExtrasRow>
      <CapsuleCard
        className="build-compose"
        dragging={dragging}
        role="region"
        aria-label="빌드 요청"
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.types).includes("Files")) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          setDragging(false);
          if (!busy) void state.attach(Array.from(event.dataTransfer.files));
        }}
      >
        <form
          className="build-composer"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <CapsuleRow>
            <label className="build-sr" htmlFor="build-workspace-request">
              만들거나 바꾸고 싶은 내용
            </label>
            <div className="flex shrink-0 items-center">
              <RoundIcon
                icon={Plus}
                label="추가 메뉴"
                active={toolsOpen}
                disabled={busy}
                className={toolsOpen ? "rotate-45" : ""}
                onClick={() => setOpen((current) => (current === "tools" ? null : "tools"))}
              />
              <ToolsReveal open={toolsOpen} widthClass="w-8">
                <RoundIcon icon={Paperclip} label="파일 첨부" active={state.attachments.length > 0} disabled={busy} onClick={() => files.current?.click()} />
              </ToolsReveal>
            </div>
            <textarea
              id="build-workspace-request"
              ref={area}
              rows={1}
              value={state.input}
              placeholder="무엇을 만들까요?"
              className={CAPSULE_FIELD}
              onChange={(event) => {
                useBuildWorkspace.setState({ input: event.target.value });
                grow();
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              onPaste={(event) => {
                const values = Array.from(event.clipboardData.files);
                if (values.length && !busy) {
                  event.preventDefault();
                  void state.attach(values);
                }
              }}
            />
            <input
              ref={files}
              className="build-file-input"
              type="file"
              multiple
              aria-label="빌드에 첨부할 파일"
              onChange={(event) => {
                const values = Array.from(event.target.files || []);
                event.target.value = "";
                void state.attach(values);
              }}
            />
            <RoundIcon icon={Globe} label="Think+" active={settings.think} disabled={busy} onClick={() => state.patchSettings({ think: !settings.think })} />
            <SendRound label={state.currentResult ? "요청 보내기" : "만들기"} disabled={!canSend} />
          </CapsuleRow>
        </form>
        <ModelAccordion
          open={open === "model"}
          providers={accordionProviders}
          selectedProvider={provider}
          models={models}
          selectedModel={selectedModel}
          onProvider={(value) => state.patchSettings({ provider: value as BuildProvider })}
          onModel={(value) => {
            if (provider !== "auto") state.patchSettings({ models: { ...settings.models, [provider]: value } });
            setOpen(null);
          }}
        />
        {state.attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
            {state.attachments.map((file, index) => (
              <AttachmentChip
                key={`${file.name}-${index}`}
                name={file.name}
                onRemove={() => useBuildWorkspace.setState((current) => ({ attachments: current.attachments.filter((_, i) => i !== index) }))}
              />
            ))}
          </div>
        ) : null}
        {state.readingFiles ? (
          <p role="status" className="build-muted px-4 pb-2">
            첨부 파일을 읽고 있습니다.
          </p>
        ) : null}
        {dragging ? (
          <p role="status" className="px-4 pb-2 text-xs">
            여기에 파일을 놓으세요.
          </p>
        ) : null}
      </CapsuleCard>
    </div>
  );
}

/** 스킬과 참고 노트. 작성칸 안에 접어 두지 않고 화면 탭 하나로 뺀다. */
export function BuildReferences({ connected }: { connected: boolean }) {
  const state = useBuildWorkspace();
  const busy = busyBuild(state);
  useEffect(() => {
    if (connected) state.loadReferences();
  }, [connected]);
  return (
    <fieldset disabled={busy} className="build-form-fields">
      {state.pending.skills || state.pending.memory ? (
        <p className="build-muted" role="status">
          참고 자료를 불러오고 있습니다.
        </p>
      ) : null}
      <label>
        적용할 스킬
        <select value={state.settings.skill} onChange={(event) => state.patchSettings({ skill: event.target.value })}>
          <option value="">자동 선택</option>
          {state.skills.map((skill) => (
            <option key={`${skill.scope}:${skill.name}`} value={`${skill.scope}:${skill.name}`}>
              {skill.name} · {skill.scope === "global" ? "전역" : "프로젝트"}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="build-note-options">
        <legend>참고할 노트</legend>
        {state.memory.length ? (
          state.memory.map((note) => (
            <label key={note.name}>
              <input
                type="checkbox"
                checked={state.settings.memory.includes(note.name)}
                onChange={(event) =>
                  state.patchSettings({
                    memory: event.target.checked ? [...state.settings.memory, note.name] : state.settings.memory.filter((name) => name !== note.name)
                  })
                }
              />
              <span>{note.name}</span>
            </label>
          ))
        ) : (
          <p className="build-muted">저장된 노트가 없습니다.</p>
        )}
      </fieldset>
    </fieldset>
  );
}

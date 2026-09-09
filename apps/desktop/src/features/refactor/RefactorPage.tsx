import { useState } from "react";
import { Check, FileCode, Replace, ScanText, Type } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useRefactorPageBridge, useRefactorStore } from "./refactor-store";
import { describeBlocked, isPreviewForAnotherFile, type RefactorFormState } from "./refactor-model";

/* ============================================================================
   리뷰 화면.
   순서가 정해져 있다: 파일 → 바꿀 내용 → 확인하고 적용.
   그 순서를 캡슐 탭 셋으로 그대로 만든다. 각 단계는 한 화면에 들어간다.
   ============================================================================ */

type TabId = "file" | "edit" | "apply";

export function RefactorPage() {
  useRefactorPageBridge();

  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const connected = bridgeStatus === "connected" && authStatus === "authenticated";

  const store = useRefactorStore();
  const [tab, setTab] = useState<TabId>("file");

  const form: RefactorFormState = {
    path: store.path,
    anchorLines: store.anchorLines,
    anchorStartLine: store.anchorStartLine,
    anchorEndLine: store.anchorEndLine,
    anchorReplacement: store.anchorReplacement,
    anchorDelete: store.anchorDelete,
    pattern: store.pattern,
    replacement: store.replacement,
    symbol: store.symbol,
    newName: store.newName,
    previewId: store.previewId,
    previewPath: store.previewPath
  };

  const tabs: ScreenTab[] = [
    { id: "file", label: "1. 파일", icon: FileCode, badge: store.anchorLines.length > 0 ? `${store.anchorLines.length}줄` : undefined },
    { id: "edit", label: "2. 바꿀 내용", icon: ScanText },
    { id: "apply", label: "3. 확인·적용", icon: Check, badge: store.previewId ? "준비됨" : undefined }
  ];

  return (
    <Screen
      title="리뷰"
      hint="파일을 읽고, 바뀔 내용을 먼저 본 다음 적용합니다."
      notice={
        !connected ? (
          <ScreenNotice tone="warning">연결되지 않았습니다.</ScreenNotice>
        ) : store.lastError ? (
          <ScreenNotice tone="danger">{store.lastError}</ScreenNotice>
        ) : store.lastMessage ? (
          <ScreenNotice>{store.lastMessage}</ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="리뷰 단계" />

      {tab === "file" ? <FileStep form={form} connected={connected} /> : null}
      {tab === "edit" ? <EditStep form={form} connected={connected} /> : null}
      {tab === "apply" ? <ApplyStep form={form} connected={connected} /> : null}
    </Screen>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      {children}
    </div>
  );
}

function FileStep({ form, connected }: { form: RefactorFormState; connected: boolean }) {
  const store = useRefactorStore();
  const blocked = describeBlocked("read", form);

  return (
    <Frame>
      <div className="flex min-w-0 shrink-0 flex-col gap-2 border-b border-border p-3 sm:flex-row">
        <Input
          className="min-w-0 flex-1 font-mono text-xs"
          value={store.path}
          aria-label="파일 경로"
          placeholder="작업 폴더 기준 경로 또는 절대 경로"
          onChange={(event) => store.setField("path", event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && blocked.length === 0) store.read();
          }}
        />
        <Button
          variant="primary"
          size="md"
          className="shrink-0"
          onClick={store.read}
          disabled={!connected || store.pending || blocked.length > 0}
        >
          {store.pending && store.pendingKind === "read" ? <Spinner size={14} /> : null} 읽기
        </Button>
      </div>

      {store.loadedPath ? (
        <p className="shrink-0 truncate border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          {store.loadedPath} · {store.anchorLines.length}줄
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {store.content ? (
          <pre className="min-w-0 whitespace-pre p-3 font-mono text-[11px] leading-relaxed">{store.content}</pre>
        ) : (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {blocked || "경로를 넣고 읽기를 누르면 줄 번호와 함께 본문이 나옵니다."}
          </p>
        )}
      </div>
    </Frame>
  );
}

function EditStep({ form, connected }: { form: RefactorFormState; connected: boolean }) {
  const store = useRefactorStore();
  const [mode, setMode] = useState<"lines" | "pattern" | "rename">("lines");

  const kinds = [
    { id: "lines" as const, label: "줄 범위", icon: ScanText },
    { id: "pattern" as const, label: "패턴", icon: Replace },
    { id: "rename" as const, label: "이름", icon: Type }
  ];

  const blocked =
    mode === "lines" ? describeBlocked("preview", form) : mode === "pattern" ? describeBlocked("ast", form) : describeBlocked("rename", form);
  const busy =
    store.pending &&
    ((mode === "lines" && store.pendingKind === "preview") ||
      (mode === "pattern" && store.pendingKind === "ast") ||
      (mode === "rename" && store.pendingKind === "rename"));

  const submit = () => {
    if (mode === "lines") store.anchorPreview();
    else if (mode === "pattern") store.astReplace();
    else store.lspRename();
  };

  return (
    <Frame>
      <div className="flex min-w-0 shrink-0 gap-1.5 overflow-x-auto border-b border-border px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {kinds.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={mode === entry.id}
            onClick={() => setMode(entry.id)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              mode === entry.id ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {mode === "lines" ? (
          <>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <label className="flex min-w-0 flex-col gap-1 text-[11px]">
                시작 줄
                <Input
                  className="h-8 font-mono text-xs"
                  inputMode="numeric"
                  value={form.anchorStartLine}
                  onChange={(event) => store.setField("anchorStartLine", event.target.value)}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[11px]">
                끝 줄
                <Input
                  className="h-8 font-mono text-xs"
                  inputMode="numeric"
                  value={form.anchorEndLine}
                  onChange={(event) => store.setField("anchorEndLine", event.target.value)}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={form.anchorDelete}
                onChange={(event) => store.setAnchorDelete(event.target.checked)}
              />
              이 줄을 지웁니다 (바꿔 넣을 코드 없음)
            </label>
            {form.anchorDelete ? null : (
              <Textarea
                rows={8}
                className="font-mono text-[11px]"
                value={form.anchorReplacement}
                aria-label="바꿔 넣을 코드"
                onChange={(event) => store.setField("anchorReplacement", event.target.value)}
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              읽은 시점의 줄과 정확히 맞을 때만 보냅니다. 그 사이 파일이 바뀌었으면 다시 읽어야 합니다.
            </p>
          </>
        ) : null}

        {mode === "pattern" ? (
          <>
            <label className="flex min-w-0 flex-col gap-1 text-[11px]">
              찾을 패턴
              <Input className="h-8 font-mono text-xs" value={form.pattern} onChange={(event) => store.setField("pattern", event.target.value)} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-[11px]">
              바꿔 넣을 코드
              <Input className="h-8 font-mono text-xs" value={form.replacement} onChange={(event) => store.setField("replacement", event.target.value)} />
            </label>
            <p className="text-[11px] text-muted-foreground">
              서버에서 켜 두어야 씁니다. 꺼져 있으면 <span className="font-mono">OMNUX_REFACTOR_ENABLE_AST_GREP=1</span> 이 필요하다는 응답이 옵니다.
            </p>
          </>
        ) : null}

        {mode === "rename" ? (
          <>
            <label className="flex min-w-0 flex-col gap-1 text-[11px]">
              지금 이름
              <Input className="h-8 font-mono text-xs" value={form.symbol} onChange={(event) => store.setField("symbol", event.target.value)} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-[11px]">
              새 이름
              <Input className="h-8 font-mono text-xs" value={form.newName} onChange={(event) => store.setField("newName", event.target.value)} />
            </label>
            <p className="text-[11px] text-muted-foreground">
              이 방식도 서버에서 켜 두어야 씁니다. <span className="font-mono">OMNUX_REFACTOR_ENABLE_LSP=1</span>
            </p>
          </>
        ) : null}
      </div>

      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t border-border p-3">
        <Button variant="primary" size="sm" onClick={submit} disabled={!connected || store.pending || blocked.length > 0}>
          {busy ? <Spinner size={12} /> : null} 미리보기 만들기
        </Button>
        {blocked ? <span className="min-w-0 break-words text-[11px] text-muted-foreground">{blocked}</span> : null}
      </div>
    </Frame>
  );
}

function ApplyStep({ form, connected }: { form: RefactorFormState; connected: boolean }) {
  const store = useRefactorStore();
  const blocked = describeBlocked("apply", form);

  return (
    <Frame>
      <div className="shrink-0 space-y-1 border-b border-border px-3 py-2">
        {store.previewId ? (
          <p className="min-w-0 break-all font-mono text-[11px] text-muted-foreground">{store.previewId}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">미리보기를 만들면 바뀔 내용이 여기에 나옵니다.</p>
        )}
        {isPreviewForAnotherFile(form) ? (
          <p className="min-w-0 break-words text-[11px] text-destructive">
            지금 미리보기는 {store.previewPath} 것이고 경로 칸은 {store.path} 입니다. 다시 만드세요.
          </p>
        ) : null}
        {store.applied ? <p className="text-[11px] text-success">적용됨</p> : null}
      </div>

      {store.issues.length > 0 ? (
        <ul className="shrink-0 space-y-1 border-b border-border bg-warning/10 px-3 py-2">
          {store.issues.map((issue, index) => (
            <li key={index} className="min-w-0 whitespace-pre-wrap break-words text-[11px] text-warning">
              {issue}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {store.previewDiff ? (
          <pre className="min-w-0 whitespace-pre p-3 font-mono text-[11px] leading-relaxed">{store.previewDiff}</pre>
        ) : (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">아직 미리보기가 없습니다.</p>
        )}
      </div>

      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t border-border p-3">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => void store.apply()}
          disabled={!connected || store.pending || blocked.length > 0}
        >
          {store.pending && store.pendingKind === "apply" ? <Spinner size={12} /> : null} 파일에 적용
        </Button>
        <span className="min-w-0 break-words text-[11px] text-muted-foreground">
          {blocked || "적용하기 전에 한 번 더 확인 창이 뜹니다."}
        </span>
      </div>
    </Frame>
  );
}

import { useEffect, useRef } from "react";
import { Play, Square } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useBuildTerminal } from "./build-terminal";
import { useBuildWorkspace, busyBuild } from "./build-state";

const STATUS_LABEL: Record<string, string> = {
  idle: "실행 전",
  starting: "실행 준비 중",
  running: "실행 중",
  exited: "실행 끝남",
  failed: "실행 실패"
};

/**
 * 만든 프로그램을 그대로 돌려 보는 화면. 미들웨어가 의사 터미널에 띄우고 출력을 그대로
 * 흘려주므로, 여기서는 키 입력만 되돌려 주면 게임·입력 프롬프트가 그대로 동작한다.
 */
export function BuildTerminal({ connected }: { connected: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const state = useBuildTerminal();
  const build = useBuildWorkspace();
  const busy = busyBuild(build);
  const running = state.status === "running" || state.status === "starting";

  useEffect(() => {
    if (!host.current || term.current) return undefined;
    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      scrollback: 5000,
      theme: { background: "#0b0b0d", foreground: "#e6e6e6" }
    });
    const addon = new FitAddon();
    terminal.loadAddon(addon);
    terminal.open(host.current);
    term.current = terminal;
    fit.current = addon;

    // 탭이 아직 그려지기 전이면 크기를 잴 수 없어 FitAddon 이 던진다. 다음 프레임에 맞춘다.
    const safeFit = () => {
      try {
        addon.fit();
      } catch {
        /* 숨겨져 있거나 크기가 0이면 다음 표시 때 다시 맞춘다. */
      }
    };
    const fitFrame = requestAnimationFrame(safeFit);

    const detach = useBuildTerminal.getState().attach(data => terminal.write(data));
    const input = terminal.onData(data => useBuildTerminal.getState().send(data));
    const observer = new ResizeObserver(safeFit);
    observer.observe(host.current);

    return () => {
      cancelAnimationFrame(fitFrame);
      observer.disconnect();
      input.dispose();
      detach();
      terminal.dispose();
      term.current = null;
      fit.current = null;
    };
  }, []);

  const run = () => {
    let size: { cols: number; rows: number } | undefined;
    try {
      size = fit.current?.proposeDimensions();
    } catch {
      size = undefined;
    }

    useBuildTerminal.getState().start(build.activeId, build.target, {
      cols: Math.max(40, Math.round(size?.cols ?? 100)),
      rows: Math.max(10, Math.round(size?.rows ?? 30))
    });
    term.current?.focus();
  };

  return (
    <div className="build-form-fields">
      <div className="build-actions">
        <button
          type="button"
          className="build-button"
          disabled={!connected || busy || running || !build.activeId}
          onClick={run}
        >
          <Play size={13} aria-hidden="true" /> 프로그램 실행
        </button>
        <button type="button" className="build-button build-quiet" disabled={!running} onClick={() => useBuildTerminal.getState().stop()}>
          <Square size={13} aria-hidden="true" /> 중지
        </button>
        <span className="build-muted">{STATUS_LABEL[state.status] ?? state.status}</span>
      </div>
      {state.message ? (
        <p className={state.status === "failed" ? "build-error" : "build-muted"} role="status">
          {state.message}
        </p>
      ) : null}
      {state.previewUrl ? (
        <p className="build-muted">
          브라우저에서 볼 결과물입니다. <a href={state.previewUrl} target="_blank" rel="noreferrer">프리뷰 열기</a>
        </p>
      ) : null}
      {state.command ? <p className="build-muted">실행 명령: {state.command}</p> : null}
      <div ref={host} className="build-terminal" role="application" aria-label="프로그램 실행 화면" />
      <p className="build-muted">화면을 클릭하면 키 입력이 프로그램으로 전달됩니다.</p>
    </div>
  );
}

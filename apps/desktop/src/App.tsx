import { useMemo, useState } from "react";
import { AskPage } from "./features/ask/AskPage";
import { BuildPage } from "./features/build/BuildPage";
import { AutomatePage } from "./features/automate/AutomatePage";
import { ExplorePage } from "./features/explore/ExplorePage";
import { OperationsPage } from "./features/ops/OperationsPage";
import {
  DesktopNavigation,
  type DesktopPageDefinition,
  type DesktopPageId
} from "./features/shell/DesktopNavigation";
import { PageBoundary } from "./features/shell/PageBoundary";
import { ShellOverviewPage } from "./features/shell/ShellOverviewPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { useMiddlewareBootstrapEvents } from "./use-middleware-bootstrap-events";
import { useMiddlewareRuntimeProbe } from "./use-middleware-runtime-probe";
import { useMiddlewareSessionBridge } from "./use-middleware-session";

const SHELL_NOTES = [
  "Rust 셸은 창과 생명주기만 담당",
  ".NET 미들웨어가 LLM, 코딩, 루틴, 리팩터 전담",
  "desktop shell boundary contract로 경계 검사"
];

function App() {
  useMiddlewareBootstrapEvents();
  useMiddlewareRuntimeProbe();
  useMiddlewareSessionBridge();

  const [activePage, setActivePage] = useState<DesktopPageId>("shell");
  const pages = useMemo<DesktopPageDefinition[]>(
    () => [
      {
        id: "shell",
        label: "셸",
        description: "런타임 경계",
        render: () => <ShellOverviewPage />
      },
      {
        id: "ask",
        label: "Ask",
        description: "대화 / 메모리",
        render: () => <AskPage />
      },
      {
        id: "build",
        label: "Build",
        description: "코딩 실행 / 롤백",
        render: () => <BuildPage />
      },
      {
        id: "explore",
        label: "Explore",
        description: "웹 / 세션",
        render: () => <ExplorePage />
      },
      {
        id: "automate",
        label: "Automate",
        description: "루틴",
        render: () => <AutomatePage />
      },
      {
        id: "settings",
        label: "Settings",
        description: "메모리 / 백업",
        render: () => <SettingsPage />
      },
      {
        id: "operations",
        label: "운영",
        description: "read-only 조회",
        render: () => <OperationsPage />
      }
    ],
    []
  );
  const activePageDefinition = pages.find((page) => page.id === activePage) || pages[0];

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Omnux Desktop</p>
          <h1>앱 셸만 맡는 Tauri 데스크톱</h1>
          <p className="lede">
            Rust는 창과 앱 생명주기만 다루고, 실제 비즈니스 로직은 .NET 미들웨어가 전담한다.
          </p>
        </div>
        <aside className="panel">
          <h2>경계 요약</h2>
          <ul>
            {SHELL_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </aside>
      </section>
      <DesktopNavigation pages={pages} activePage={activePage} onSelectPage={setActivePage} />
      <PageBoundary page={activePageDefinition.id}>{activePageDefinition.render()}</PageBoundary>
      <p className="footer-note">데스크톱 셸은 healthz/readyz와 WebSocket ping/pong까지만 확인하고, 도메인 작업은 .NET 미들웨어에 위임한다.</p>
    </main>
  );
}

export default App;

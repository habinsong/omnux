import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import type { DesktopPageId } from "../shell/DesktopNavigation";

const QUICK_NAV: { id: DesktopPageId; label: string; description: string }[] = [
  { id: "ask", label: "Ask", description: "대화 · 메모리 · 질문" },
  { id: "build", label: "Build", description: "코딩 실행 · 롤백 복원" },
  { id: "logic", label: "Logic", description: "그래프 구조 · 실행" },
  { id: "automate", label: "Automate", description: "루틴 목록 · 생성" },
  { id: "explore", label: "Explore", description: "웹 검색 · 세션" },
  { id: "settings", label: "Settings", description: "메모리 · 백업" },
  { id: "operations", label: "운영", description: "Doctor · cleanup · task" },
  { id: "shell", label: "셸 경계", description: "런타임 · 부트 계약" }
];

export function HomePage() {
  const navigate = useDesktopNavigationStore((state) => state.setActivePage);
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const runtime = useDesktopShellStore((state) => state.runtime);
  const middlewareStatus = useDesktopShellStore((state) => state.middleware.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);

  return (
    <section className="grid">
      <CardBoundary title="바로 가기" card="navigation" onError={recordCardError}>
        <p className="routine-wizard-intro">기능 화면으로 이동합니다. 모든 도메인 작업은 .NET 미들웨어가 전담합니다.</p>
        <div className="home-quicknav">
          {QUICK_NAV.map((item) => (
            <button key={item.id} className="desktop-tab" type="button" onClick={() => navigate(item.id)}>
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </CardBoundary>

      <CardBoundary title="연결 상태" card="middleware" onError={recordCardError}>
        <dl className="status-list">
          <div>
            <dt>WS bridge</dt>
            <dd>
              <span className={`status-pill status-${bridgeStatus}`}>{bridgeStatus}</span>
            </dd>
          </div>
          <div>
            <dt>auth</dt>
            <dd>
              <span className={`status-pill status-${authStatus}`}>{authStatus}</span>
            </dd>
          </div>
          <div>
            <dt>middleware</dt>
            <dd>
              <span className={`status-pill status-${middlewareStatus}`}>{middlewareStatus}</span>
            </dd>
          </div>
          <div>
            <dt>healthz / readyz</dt>
            <dd>{`${runtime.healthStatus} / ${runtime.readyStatus}`}</dd>
          </div>
          <div>
            <dt>bootstrap</dt>
            <dd>{runtime.bootstrapPhase}</dd>
          </div>
        </dl>
        <p className="routine-wizard-intro" style={{ marginTop: 12 }}>
          인증 전에는 데이터 액션 버튼이 비활성화됩니다. 좌측 상단에서 OTP 인증을 진행하세요.
        </p>
      </CardBoundary>
    </section>
  );
}

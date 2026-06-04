# omnux 프로젝트 기술 평가

## 1. 개요 및 아키텍처 요약
omnux 프로젝트는 단순한 챗봇 래퍼(Wrapper)나 프론트엔드 프로젝트가 아니라, C# 기반의 강력한 미들웨어 엔진(`omnux-middleware`)을 중심으로 구축된 **"로컬 우선 AI 에이전트 오케스트레이션 미들웨어"**입니다.
이 백엔드는 사용자 의도 분석, 메모리 및 컨텍스트 관리, 다중 모델 라우팅, 보안 샌드박스, 과금/스폰 제어 등 엔터프라이즈급 인프라 요소들을 자체 내장하고 있습니다.

## 2. 주요 기술적 성숙도 및 핵심 모듈 평가

### 2.1 다중 모델 및 프로바이더 오케스트레이션 (Multi-Model Routing)
- Groq, Gemini, Cerebras, Nvidia, Codex, Copilot 등 다양한 LLM API를 지원하며, **Fallback Policy(다중 모델 순차 우회기)** 와 **Router Intent Classifier**를 통해 런타임에 최적의 모델로 요청을 라우팅하는 고도화된 컨트롤러를 갖추고 있습니다.
- API 키 관리는 평문이 아닌 macOS Native Keychain(`SecretLoader.cs`) 및 `0600` 파일 권한 검증 등 운영체제 수준의 강력한 보안 로직으로 보호됩니다.

### 2.2 Swarm (다중 에이전트) 제어 및 경제 시스템
- **Agent Spawn Admission Limiter**: 토큰 버킷(Token Bucket) 알고리즘을 사용해 백그라운드 에이전트의 무한 복제 및 스폰(Spawn) 요청을 큐잉(Queueing)하고 동시성을 제어합니다.
- **Agent Spawn Daily Cost Ledger**: 하루 토큰 사용 상한(Daily Token Cap)을 관리하여 LLM 폭주로 인한 요금 폭탄을 미연에 방지합니다.

### 2.3 보안 및 샌드박스 (Security & Execution)
- 파이썬 등 언어 실행을 위한 전용 **Python Sandbox Client**와 C, C++, Java, Kotlin, Bash 등을 포괄하는 **Universal Code Runner**를 탑재하여 위험한 코드 실행을 격리합니다.
- 프롬프트 인젝션 방어(`ExternalContentGuard.cs`) 및 출력 텍스트의 유해성 필터링(`ChatOutputSanitizerPolicy.cs`)을 통해 입력부터 출력까지 모든 채널을 필터링합니다.

### 2.4 데이터 저장 및 검색 최적화 (Memory & FTS)
- 외부 데이터베이스 없이 자체 구현된 **TF-IDF 기반 Full-Text Search (FTS) 엔진**(`MemoryIndexDocumentSync.cs`)을 통해 메모리 노트를 인덱싱하고 검색합니다.
- Atomic File Store (임시 파일 쓰기 후 원자적 Rename)를 통한 동시성 쓰기 충돌 방지 로직이 결합되어 데이터 무결성을 보장합니다.

### 2.5 브라우저 통합 및 렌더링 (Web & UI)
- 백엔드 코드 내에 **Playwright Headless Browser (Node.js)** 구동 스크립트를 내장하여, C#에서 웹 페이지를 렌더링하고 DOM을 조작하거나 크롤링합니다.
- 프론트엔드가 없는 상태에서도 백엔드 자체 HTTP 서버(`GatewayApiEndpoint.cs`)가 구동되어 IFrame 샌드박스를 통해 AI가 짠 코드를 **라이브 코딩 프리뷰(Live Coding Preview)** 로 제공합니다.
- 특정 프론트엔드/게임 생성 요청 시 불필요한 루프를 끄고 토큰을 최대치로 해제하는 **One-Shot UI Clone 모드**가 탑재되어 속도와 효율을 극대화합니다.

### 2.6 휴리스틱 기반 자연어 및 외부 채널 인터페이스
- 텔레그램 등의 채널을 통해 들어온 한국어 입력의 의도(Intent)를 분석하고, 6만 바이트가 넘는 거대한 정규식 매퍼(`NaturalCommandValidationPolicy.cs`)를 통해 내부 슬래시 명령어(Canonical Command)로 치환합니다.
- 텔레그램 보이스 노트를 Base64로 받아 **STT 엔진**을 통해 텍스트로 변환하는 파이프라인까지 내장되어 있습니다.

## 3. 결론 및 다음 단계

현재 omnux 백엔드는 총 50개의 숨겨진 엔터프라이즈급 기능이 촘촘히 얽혀 있는 고도화된 미들웨어 구조를 갖추고 있습니다. 미들웨어 인프라는 이미 충분히 확장되어 있으므로, 이제는 이 거대한 백엔드의 기능을 시각화하고 활용할 수 있는 **[차세대 데스크톱 앱(Tauri 기반 UI/UX 프론트엔드)]** 를 구축/연동하는 것이 가장 시급하고 중요한 단계입니다.

> [!IMPORTANT]
> 본 평가는 사용자의 기술 평가 요청에 따른 것으로, 50개의 숨겨진 백엔드 기능 분석을 총망라한 최종 진단입니다.

---
**사용자 확인 요청**
1. 50개의 백엔드 심층 평가는 이것으로 충분합니까?
2. 이제 발견된 이 엄청난 백엔드 API 기능들을 시각적으로 엮어내기 위한 **[차세대 프론트엔드(UI/UX) 구현 작업]** 으로 전환하시겠습니까?

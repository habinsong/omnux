namespace Omnux.Middleware;

internal static class TelegramHelpTextPolicy
{
    public static string Build(string? topic = null)
    {
        var normalized = (topic ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized == "llm")
        {
            return """
                   [LLM 도움말]
                   그냥 자연어로 먼저 말해도 됩니다.
                   - "단일 모드로 바꿔"
                   - "Codex로 바꿔"
                   - "모델 목록 보여줘"
                   - "다중 요약 담당을 Gemini로 설정해"

                   자주 쓰는 slash:
                   - /talk [low|high]
                   - /code [low|high]
                   - /model <groq|gemini|copilot|cerebras|nvidia|codex>
                   - /llm status
                   - /llm models [groq|gemini|copilot|cerebras|nvidia|codex|all]
                   - /llm usage
                   - /llm mode <single|orchestration|multi>
                   - /llm single provider <groq|gemini|copilot|cerebras|nvidia|codex>
                   - /llm single model <model-id>
                   - /llm orchestration provider <auto|groq|gemini|copilot|cerebras|nvidia|codex>
                   - /llm orchestration model <model-id>
                   - /llm multi <groq|gemini|copilot|cerebras|nvidia|codex> <model-id>
                   - /llm multi summary <auto|groq|gemini|copilot|cerebras|nvidia|codex>
                   """;
        }

        if (normalized == "routine")
        {
            return """
                   [루틴 도움말]
                   자연어 예시:
                   - "루틴 목록 보여줘"
                   - "루틴 생성: 매일 아침 8시에 뉴스 요약"
                   - "루틴 수정 rt-20260301093000-ab12cd34 매일 9시에 서버 상태 점검"
                   - "루틴 실행 rt-20260301093000-ab12cd34"
                   - "루틴 실행 이력 rt-20260301093000-ab12cd34"
                   - "루틴 재전송 rt-20260301093000-ab12cd34 1741482000000"

                   정확히 제어할 때:
                   - /routine list
                   - /routine create <요청>
                   - /routine update <routine-id> <요청>
                   - /routine run <routine-id>
                   - /routine runs <routine-id>
                   - /routine detail <routine-id> <ts>
                   - /routine resend <routine-id> <ts>
                   - /routine on <routine-id>
                   - /routine off <routine-id>
                   - /routine delete <routine-id>
                   """;
        }

        if (normalized == "skill" || normalized == "skills")
        {
            return """
                   [스킬 도움말]
                   자연어 예시:
                   - "스킬 목록 보여줘"
                   - "casual-empathy 스킬 사용해"
                   - "스킬 해제"
                   - "공감하는 일상 대화 스킬 만들어줘"

                   정확히 제어할 때:
                   - /skill status — 현재 활성 스킬 확인
                   - /skill list
                   - /skill use <name> [project|global]
                   - /skill get <name> [project|global]
                   - /skill create <name> [project|global]
                     한 줄 설명
                     ---
                     스킬 본문
                   - /skill off
                   - /skill quick <별명> <스킬이름> — 단축 별명 등록 (예: /skill quick e eli5)
                   - /skill quick list — 등록된 별명 목록
                   - /skill quick remove <별명>
                     ↳ 등록 후 /<별명> [질문] 으로 즉시 호출 가능 (예: /e 디지털 카메라 원리)
                   """;
        }

        if (normalized == "coding")
        {
            return """
                   [코딩 도움말]
                   자연어 예시:
                   - "단일 코딩으로 로그인 페이지와 API까지 만들어줘"
                   - "오케스트레이션 코딩으로 지금 워크스페이스 점검하고 개선해줘"
                   - "다중 코딩으로 같은 요구사항 비교해줘"
                   - "단일 코딩 제공자를 Codex로 바꿔"
                   - "다중 코딩 워커 Gemini 모델을 gemini-3.1-pro로 설정해"
                   - "최근 코딩 결과 보여줘"
                   - "코딩 파일 1 보여줘"

                   자주 쓰는 slash:
                   - /coding status
                   - /coding mode <single|orchestration|multi>
                   - /coding language [single|orchestration|multi] <language|auto>
                   - /coding run <요구사항>
                   - /coding single provider <auto|groq|gemini|copilot|cerebras|nvidia|codex>
                   - /coding single model <model-id>
                   - /coding single run <요구사항>
                   - /coding orchestration provider <auto|groq|gemini|copilot|cerebras|nvidia|codex>
                   - /coding orchestration model <model-id>
                   - /coding orchestration worker <provider> <model-id|none>
                   - /coding orchestration run [요구사항]
                   - /coding multi provider <auto|groq|gemini|copilot|cerebras|nvidia|codex>
                   - /coding multi model <model-id>
                   - /coding multi worker <provider> <model-id|none>
                   - /coding multi run <요구사항>
                   - /coding last
                   - /coding files
                   - /coding file <번호|경로>
                   - /coding download <번호|경로> — 텔레그램 첨부로 다운로드
                   """;
        }

        if (normalized == "refactor")
        {
            return """
                   [Safe Refactor 도움말]
                   쉬운 흐름:
                   1. /refactor read <path> [start] [end]
                   2. /refactor preview <path> <start> <end>
                      다음 줄부터 교체 코드를 붙여 넣기
                   3. /refactor apply

                   예시:
                   /refactor read apps/omnux-middleware/src/CommandService.Telegram.cs 10 20
                   /refactor preview apps/omnux-middleware/src/CommandService.Telegram.cs 12 14
                   새 코드...

                   또는:
                   /refactor preview 12 14
                   새 코드...

                   slash 없이도 가능:
                   refactor preview apps/omnux-middleware/src/CommandService.Telegram.cs 12 14 ::: 새 코드

                   상태 확인:
                   - /refactor status
                   """;
        }

        if (normalized == "doctor")
        {
            return """
                   [진단 도움말]
                   - /doctor
                   - /doctor last
                   - /doctor json
                   - /doctor last json

                   자연어 예시:
                   - "환경 진단해줘"
                   - "최근 진단 보여줘"
                   - "doctor 결과를 json으로 보여줘"
                   """;
        }

        if (normalized == "plan")
        {
            return """
                   [계획 도움말]
                   자연어 예시:
                   - "계획 목록 보여줘"
                   - "계획 생성: doctor 기능 구현"
                   - "계획 리뷰 plan_20260308103000001"

                   정확히 제어할 때:
                   - /plan list
                   - /plan get <plan-id>
                   - /plan create [--mode fast|interview] [--constraint <제약>]... <요청>
                   - /plan review <plan-id>
                   - /plan approve <plan-id>
                   - /plan run <plan-id>
                   """;
        }

        if (normalized == "task")
        {
            return """
                   [작업 도움말]
                   자연어 예시:
                   - "작업 목록 보여줘"
                   - "작업 상태 graph_20260308123500001"
                   - "작업 실행 graph_20260308123500001"

                   정확히 제어할 때:
                   - /task list
                   - /task create <plan-id>
                   - /task status <graph-id>
                   - /task run <graph-id>
                   - /task cancel <graph-id> <task-id>
                   - /task output <graph-id> <task-id>
                   """;
        }

        if (normalized == "notebook" || normalized == "handoff")
        {
            return """
                   [노트북 도움말]
                   자연어 예시:
                   - "노트북 보여줘"
                   - "노트북에 decision 계획은 task graph로 실행한다고 기록해줘"
                   - "인수인계 문서 만들어줘"

                   정확히 제어할 때:
                   - /notebook show [project-key]
                   - /notebook append <learning|decision|verification> <내용>
                   - /handoff [project-key]

                   안내:
                   - 텔레그램은 알림/트리거에 가깝게 쓰고, 무거운 작업은 데스크톱으로 넘깁니다.
                   - `/handoff` 는 그 연결 문서를 만드는 명령입니다.
                   """;
        }

        if (normalized == "memory")
        {
            return """
                   [메모리 도움말]
                   자연어 예시:
                   - "메모리 초기화해줘"
                   - "메모리 노트 만들어줘"
                   - "메모리 compact로 저장해줘"

                   정확히 제어할 때:
                   - /memory clear
                   - /memory create [compact]
                   """;
        }

        if (normalized == "natural")
        {
            return """
                   [자연어 제어 도움말]
                   슬래시 없이도 대부분의 제어를 처리합니다.

                   지원 예시:
                   - "단일 모드로 바꿔"
                   - "Codex로 바꿔"
                   - "단일 코딩으로 로그인 페이지 만들어줘"
                   - "최근 코딩 결과 보여줘"
                   - "리팩터 상태 보여줘"
                   - "모델 목록 보여줘"
                   - "메모리 초기화"
                   - "환경 진단해줘"
                   - "계획 목록 보여줘"
                   - "작업 상태 graph_..."
                   - "노트북 보여줘"
                   - "루틴 생성: 매일 09:00 서버 상태 점검"

                   보안 정책:
                   - 프로세스 종료는 /kill <pid> 슬래시 명령으로만 허용됩니다.
                   """;
        }

        return """
               [omnux Telegram 도움말]
               먼저 자연어로 말해도 됩니다.
               - "단일 모드로 바꿔"
               - "Codex로 바꿔"
               - "단일 코딩으로 로그인 페이지 만들어줘"
               - "단일 코딩 제공자를 Codex로 바꿔"
               - "최근 코딩 결과 보여줘"
               - "환경 진단해줘"
               - "루틴 목록 보여줘"
               - "노트북 보여줘"

               🎙️ 음성 메시지: 자동 전사(STT) 후 LLM에 전달. 들은 내용을 echo로 확인 후 답변.
               🖼️ 사진 첨부: Vision 모델로 이미지 분석. 캡션이 없으면 "첨부 분석" 자동 안내.
               📎 문서/파일 첨부: PDF/텍스트/코드 등은 모델이 직접 참조해 요약·분석.

               자주 쓰는 slash:
               - /talk [low|high]
               - /code [low|high]
               - /coding status
               - /coding run <요구사항>
               - /coding last
               - /refactor read <path>
               - /model <groq|gemini|copilot|cerebras|codex>
               - /llm status
               - /skill list
               - /skill use <name>
               - /skill status (또는 /off)
               - /think on|off|status
               - /web on|off|status
               - /history [N]
               - /doctor
               - /routine list
               - /plan list
               - /task list
               - /notebook show
               - /memory create [compact]

               더 보기:
               - /help llm
               - /help skill
               - /help coding
               - /help refactor
               - /help doctor
               - /help routine
               - /help plan
               - /help task
               - /help notebook
               - /help memory
               - /help natural
               """;
    }
}

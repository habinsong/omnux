namespace Omnux.Middleware;

public sealed partial class RoutineApplicationService
{
    private static string BuildRoutineGenerationPrompt(string request, string schedule, string systemPrompt, string baseConfig)
    {
        return $"""
                {systemPrompt}

                {baseConfig}

                [사용자 루틴 요청]
                {request}

                [정규화 스케줄]
                {schedule}

                요구사항:
                1) 이 코드는 스케줄러가 이미 실행할 시점에 호출한다. 실행 여부를 코드 안에서 다시 판단하지 마라.
                2) 현재 시간/요일/날짜 확인, sleep, while true, cron/crontab 등록, 백그라운드 daemon화 금지
                3) 요청 원문에 스케줄 표현이 있어도 정규화 스케줄을 우선으로 보고, 구현은 작업 자체만 수행
                4) 한 번 실행되면 즉시 작업을 수행하고 종료
                5) macOS/Linux 모두 동작 가능한 루틴 코드
                6) 외부 의존 최소화
                7) 실행 결과를 stdout 텍스트로 요약 출력
                8) stdout은 비워두지 말 것. 사람이 읽는 최종 결과를 3문장 이상 또는 구조화된 목록으로 출력
                9) 민감정보 노출 금지
                10) Linux 전용 옵션(top -bn1, free -m 등)을 그대로 쓰지 말고 macOS/Linux 공통 또는 분기 가능한 방식으로 작성

                금지 예시:
                - CURRENT_HOUR=$(date +%H)
                - DAY_OF_WEEK=$(date +%u)
                - if now.hour == 8:
                - schedule.every(...)
                - while true:
                - sleep 60
                - top -bn1

                출력 형식:
                PLAN:
                - 단계1
                - 단계2

                LANGUAGE=<bash 또는 python>
                ```bash
                # 실행 가능한 전체 코드
                ```
                """;
    }

    private static int EstimatePromptTokens(string text)
    {
        var length = (text ?? string.Empty).Length;
        return Math.Max(1, length / 3);
    }

    private static string ExtractPlanText(string raw)
    {
        var text = (raw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return "계획 텍스트 없음";
        }

        var fenceIndex = text.IndexOf("```", StringComparison.Ordinal);
        if (fenceIndex <= 0)
        {
            return text.Length <= 1500 ? text : text[..1500] + "...";
        }

        var plan = text[..fenceIndex].Trim();
        return string.IsNullOrWhiteSpace(plan) ? "계획 텍스트 없음" : (plan.Length <= 1500 ? plan : plan[..1500] + "...");
    }

    private static string EnsureRoutineShebang(string code, string language)
    {
        var normalized = (code ?? string.Empty).Trim().TrimStart('\uFEFF');
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return normalized;
        }

        if (language == "bash")
        {
            var body = normalized;
            if (body.StartsWith("#!/usr/bin/env bash", StringComparison.Ordinal))
            {
                body = body["#!/usr/bin/env bash".Length..].TrimStart();
            }
            else if (body.StartsWith("#!/bin/bash", StringComparison.Ordinal))
            {
                body = body["#!/bin/bash".Length..].TrimStart();
            }

            if (body.StartsWith("set -euo pipefail", StringComparison.Ordinal))
            {
                body = body["set -euo pipefail".Length..].TrimStart();
            }

            return """
                   #!/usr/bin/env bash
                   set -euo pipefail

                   # omnux portability shim (macOS/Linux)
                   if ! command -v free >/dev/null 2>&1; then
                     free() {
                       echo "              total        used        free"
                       echo "Mem:           n/a         n/a         n/a"
                       if command -v vm_stat >/dev/null 2>&1; then
                         echo ""
                         vm_stat | head -n 6
                       fi
                       return 0
                     }
                   fi

                   if [ "$(uname -s)" = "Darwin" ]; then
                     top() {
                       local remapped=()
                       local replaced=0
                       for arg in "$@"; do
                         if [ "$arg" = "-bn1" ]; then
                           remapped+=("-l" "1")
                           replaced=1
                         else
                           remapped+=("$arg")
                         fi
                       done
                       if [ "$replaced" -eq 1 ]; then
                         command top "${remapped[@]}"
                         return $?
                       fi
                       command top "$@"
                     }
                   fi

                   """ + body;
        }

        if (language == "python" && !normalized.StartsWith("#!/usr/bin/env python3", StringComparison.Ordinal))
        {
            return "#!/usr/bin/env python3\n" + normalized;
        }

        return normalized;
    }

    internal static string BuildFallbackRoutineCode(string request, RoutineSchedule schedule)
    {
        var escaped = EscapeForSingleQuotes(request);
        return $"""
                #!/usr/bin/env bash
                set -euo pipefail

                echo "[Routine] 요청: '{escaped}'"
                echo "[Routine] 스케줄: {schedule.Display}"
                echo "[Routine] 실행시각: $(date '+%Y-%m-%d %H:%M:%S')"
                echo "[Routine] 자동 생성 코드가 유효하지 않아 기본 템플릿으로 실행했습니다."
                echo "[Routine] 실제 작업 로직은 루틴 수정 저장으로 재생성하세요."
                """;
    }

    private static string EscapeForSingleQuotes(string text)
    {
        return (text ?? string.Empty).Replace("'", "'\"'\"'", StringComparison.Ordinal);
    }
}

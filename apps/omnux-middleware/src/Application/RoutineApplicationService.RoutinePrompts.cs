using System.Text;

namespace Omnux.Middleware;

public sealed partial class RoutineApplicationService
{
    private void EnsureRoutinePromptFiles()
    {
        try
        {
            Directory.CreateDirectory(_routinePromptDir);
            var systemPromptPath = Path.Combine(_routinePromptDir, "system_prompt.md");
            var baseConfigPath = Path.Combine(_routinePromptDir, "기본 구성.md");

            if (!File.Exists(systemPromptPath))
            {
                File.WriteAllText(
                    systemPromptPath,
                    """
                    # Routine System Prompt
                    - 목적: 반복 작업 자동화를 위한 루틴을 계획하고 실행 가능한 코드로 생성한다.
                    - 출력: 반드시 PLAN 섹션 + LANGUAGE 선언 + 단일 코드블록.
                    - 가장 중요: 스케줄은 루틴 엔진이 이미 처리한다. 코드 안에서 현재 시각/요일/날짜를 다시 확인하거나 대기하지 마라.
                    - 금지: cron 등록, while true, sleep 기반 무한 대기, CURRENT_HOUR/CURRENT_MINUTE/DAY_OF_WEEK 계산, datetime.now()로 실행 여부 판단.
                    - 실행 방식: 코드가 호출되면 즉시 작업을 수행하고 결과를 stdout에 완결된 한국어 텍스트로 남긴다.
                    - 결과 품질: 표준 출력은 비워두지 말고, 핵심 결과/요약/실패 원인을 사람이 읽을 수 있게 출력한다.
                    - 제약: macOS/Linux 모두 동작 가능한 방식 우선, 외부 의존 최소화.
                    - 보안: 파괴적 명령 금지, 사용자 경로 외 쓰기 금지, 민감정보 출력 금지.
                    """,
                    new UTF8Encoding(false)
                );
            }

            if (!File.Exists(baseConfigPath))
            {
                File.WriteAllText(
                    baseConfigPath,
                    """
                    # 기본 구성
                    1. 스케줄은 엔진이 담당하므로 코드에서 시간/요일 조건문을 두지 않는다.
                    2. 실행 환경은 bash 또는 python 중 하나만 사용하고, 한 번 실행될 때 즉시 끝나야 한다.
                    3. 출력은 항상 stdout에 남긴다. 결과가 없더라도 실제 수행 결과나 실패 원인을 설명한다.
                    4. 네트워크/외부 사이트 접근이 실패하면 stderr 또는 stdout에 원인과 대체 안내를 짧게 남긴다.
                    5. 사용자가 적은 요청 원문에 스케줄 표현이 섞여 있어도, 구현은 순수 작업 내용만 수행한다.
                    """,
                    new UTF8Encoding(false)
                );
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[routine] prompt init failed: {ex.Message}");
        }
    }
}

using System.Text;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<(string Language, string Code, string RawText)> TryRepairRoutineCodeAsync(
        string objective,
        string rawText,
        string model,
        string request,
        RoutineSchedule schedule,
        CancellationToken cancellationToken
    )
    {
        var truncatedRaw = (rawText ?? string.Empty).Trim();
        if (truncatedRaw.Length > 5000)
        {
            truncatedRaw = truncatedRaw[..5000] + "\n...(truncated)...";
        }

        var repairPrompt = $"""
                           {objective}

                           [검토 결과]
                           이전 초안은 잘못되었습니다.
                           - 코드 내부에서 실행 시각/요일/날짜를 다시 판단하거나 대기 로직을 넣었습니다.
                           - 루틴 엔진이 이미 스케줄을 처리하므로, 코드는 호출 즉시 작업을 수행해야 합니다.

                           [수정 지시]
                           - 시간/요일/date/datetime/weekday/sleep/while true/cron 관련 실행 조건을 모두 제거하세요.
                           - 한 번 실행되면 즉시 작업을 수행하고 종료하세요.
                           - stdout에 실제 결과를 남기세요.
                           - 이전 초안을 참조하되, 잘못된 스케줄 제어 로직은 버리세요.

                           [이전 초안]
                           {truncatedRaw}
                           """;

        var regenerated = await GenerateByProviderSafeAsync(
            "groq",
            model,
            repairPrompt,
            cancellationToken,
            Math.Min(_context.CodingMaxOutputTokens, 4200)
        );
        var reparsed = GeneratedCodeCandidatePolicy.ParseCodeCandidate(regenerated.Text, "bash");
        var repairedLanguage = reparsed.Language is "bash" or "python" ? reparsed.Language : "bash";
        var repairedCode = string.IsNullOrWhiteSpace(reparsed.Code)
            ? string.Empty
            : EnsureRoutineShebang(reparsed.Code, repairedLanguage);

        if (string.IsNullOrWhiteSpace(reparsed.Code) || RoutineCodeNeedsRepair(repairedLanguage, repairedCode))
        {
            return (repairedLanguage, repairedCode, regenerated.Text);
        }

        return (repairedLanguage, repairedCode, regenerated.Text);
    }

    private sealed record RoutineCodeValidation(bool Ok, IReadOnlyList<string> Warnings);

    private static RoutineCodeValidation ValidateRoutineGeneratedCode(string language, string code, string request)
    {
        var warnings = new List<string>();
        var normalizedLanguage = NormalizeRoutineScriptLanguage(language);
        var normalizedCode = (code ?? string.Empty).Trim();
        var loweredCode = normalizedCode.ToLowerInvariant();
        var loweredRequest = (request ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedCode))
        {
            warnings.Add("생성된 실행 코드가 비어 있습니다.");
        }

        if (RoutineCodeNeedsRepair(normalizedLanguage, normalizedCode))
        {
            warnings.Add("루틴 스케줄러가 담당해야 할 시간 판단/대기 로직이 있거나 출력이 부족합니다.");
        }

        if (loweredCode.Contains("실제 작업 로직은 루틴 수정 저장으로 재생성", StringComparison.Ordinal)
            || loweredCode.Contains("자동 생성 코드가 유효하지 않아 기본 템플릿", StringComparison.Ordinal)
            || loweredCode.Contains("todo", StringComparison.Ordinal)
            || loweredCode.Contains("pass  #", StringComparison.Ordinal)
            || loweredCode.Contains("not implemented", StringComparison.Ordinal))
        {
            warnings.Add("실제 작업 대신 템플릿/TODO/미구현 코드가 포함되어 있습니다.");
        }

        if (ContainsAny(loweredRequest, "http", "url", "뉴스", "news", "api", "웹", "사이트")
            && !ContainsAny(loweredCode, "curl", "http", "requests", "urllib", "fetch", "invoke-webrequest"))
        {
            warnings.Add("요청은 웹/URL/API 작업처럼 보이지만 코드에 네트워크 접근 로직이 없습니다.");
        }

        if (ContainsAny(loweredRequest, "파일", "저장", "csv", "json", "다운로드")
            && !ContainsAny(loweredCode, "open(", "write", "cat >", "tee ", "download", "curl -o", "out-file"))
        {
            warnings.Add("요청은 파일 생성/저장 작업처럼 보이지만 파일 출력 로직이 부족합니다.");
        }

        return new RoutineCodeValidation(warnings.Count == 0, warnings);
    }

    private static bool RoutineCodeNeedsRepair(string language, string code)
    {
        var normalizedLanguage = (language ?? string.Empty).Trim().ToLowerInvariant();
        var normalizedCode = (code ?? string.Empty).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedCode))
        {
            return true;
        }

        var hasScheduleGate =
            normalizedCode.Contains("current_hour", StringComparison.Ordinal)
            || normalizedCode.Contains("current_minute", StringComparison.Ordinal)
            || normalizedCode.Contains("day_of_week", StringComparison.Ordinal)
            || normalizedCode.Contains("schedule.every", StringComparison.Ordinal)
            || normalizedCode.Contains("crontab", StringComparison.Ordinal)
            || normalizedCode.Contains("apscheduler", StringComparison.Ordinal)
            || normalizedCode.Contains("while true", StringComparison.Ordinal)
            || normalizedCode.Contains("sleep 60", StringComparison.Ordinal)
            || normalizedCode.Contains("time.sleep(", StringComparison.Ordinal)
            || normalizedCode.Contains("datetime.now()", StringComparison.Ordinal)
            || normalizedCode.Contains("weekday()", StringComparison.Ordinal)
            || normalizedCode.Contains("date +%u", StringComparison.Ordinal)
            || normalizedCode.Contains("date +%w", StringComparison.Ordinal)
            || normalizedCode.Contains("top -bn1", StringComparison.Ordinal);

        if (hasScheduleGate)
        {
            return true;
        }

        if (normalizedLanguage == "bash")
        {
            return !normalizedCode.Contains("echo ", StringComparison.Ordinal)
                && !normalizedCode.Contains("printf ", StringComparison.Ordinal)
                && !normalizedCode.Contains("cat <<", StringComparison.Ordinal);
        }

        if (normalizedLanguage == "python")
        {
            return !normalizedCode.Contains("print(", StringComparison.Ordinal);
        }

        return false;
    }

    private static string WriteRoutineScript(string runDir, string language, string code)
    {
        var scriptFileName = string.Equals(language, "python", StringComparison.OrdinalIgnoreCase) ? "run.py" : "run.sh";
        var scriptPath = Path.Combine(runDir, scriptFileName);
        File.WriteAllText(scriptPath, code, new UTF8Encoding(false));
        if (!OperatingSystem.IsWindows())
        {
            try
            {
                File.SetUnixFileMode(scriptPath,
                    UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute |
                    UnixFileMode.GroupRead | UnixFileMode.GroupExecute |
                    UnixFileMode.OtherRead | UnixFileMode.OtherExecute);
            }
            catch
            {
            }
        }

        return scriptPath;
    }
}

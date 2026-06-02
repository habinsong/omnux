using System.Text;

namespace Omnux.Middleware;

internal static class RoutineCommandPolicy
{
    private const string LogicGraphExecutionMode = "logic_graph";

    public static string BuildHelpText()
    {
        return """
               [루틴 명령]
               자연어 예시:
               - "루틴 목록 보여줘"
               - "루틴 생성: 매일 아침 8시에 뉴스 요약"
               - "루틴 실행 rt-20260301093000-ab12cd34"

               정확히 제어할 때:
               /routine list
               /routine create <요청>
               /routine create browser --model <model> [--url <start-url>] [--tool-profile <playwright_only|desktop_control>] <요청>
               /routine update <routine-id> <요청>
               /routine update <routine-id> browser --model <model> [--url <start-url>] [--tool-profile <playwright_only|desktop_control>] <요청>
               /routine run <routine-id>
               /routine runs <routine-id>
               /routine detail <routine-id> <ts>
               /routine resend <routine-id> <ts>
               /routine on <routine-id>
               /routine off <routine-id>
               /routine delete <routine-id>
               """;
    }

    public static string FormatActionResult(RoutineActionResult result)
    {
        if (!result.Ok)
        {
            return $"루틴 오류: {result.Message}";
        }

        if (result.Routine == null)
        {
            return result.Message;
        }

        return $"""
                {result.Message}
                id={result.Routine.Id}
                title={result.Routine.Title}
                mode={FormatExecutionModeLabel(result.Routine.ResolvedExecutionMode)}
                schedule={result.Routine.ScheduleText}
                next={result.Routine.NextRunLocal}
                script={result.Routine.ScriptPath}
                model={result.Routine.CoderModel}
                """;
    }

    public static string FormatExecutionModeLabel(string? executionMode)
    {
        return NormalizeRoutineExecutionMode(executionMode) switch
        {
            "browser_agent" => "browser_agent",
            LogicGraphExecutionMode => LogicGraphExecutionMode,
            "url" => "url",
            "web" => "web",
            _ => "script"
        };
    }

    public static bool LooksLikeRoutineRequest(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        var hasRepeat = ContainsAny(normalized, "매일", "매주", "반복", "루틴", "정기", "매달", "every day", "schedule");
        var hasIntent = ContainsAny(normalized, "해줘", "만들어", "자동화", "추가", "등록", "생성", "set up", "create");
        return hasRepeat && hasIntent;
    }

    private static string NormalizeRoutineExecutionMode(string? executionMode)
    {
        var normalized = (executionMode ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "web" => "web",
            "url" => "url",
            "script" => "script",
            "browser_agent" => "browser_agent",
            LogicGraphExecutionMode => LogicGraphExecutionMode,
            _ => string.Empty
        };
    }

    public static bool TryParseBrowserCommand(
        IEnumerable<string> tokens,
        out RoutineBrowserCommandSpec spec,
        out string error
    )
    {
        var tokenList = tokens.Select(token => token.Trim()).Where(token => token.Length > 0).ToList();
        string? provider = null;
        string? model = null;
        string? startUrl = null;
        string? toolProfile = null;
        var requestTokens = new List<string>();

        for (var i = 0; i < tokenList.Count; i += 1)
        {
            var token = tokenList[i];
            if (token.Equals("--provider", StringComparison.OrdinalIgnoreCase))
            {
                if (i + 1 >= tokenList.Count)
                {
                    spec = new RoutineBrowserCommandSpec(string.Empty, null, string.Empty, null, null);
                    error = "usage: /routine create browser --model <model> [--url <start-url>] [--tool-profile <playwright_only|desktop_control>] <요청>";
                    return false;
                }

                provider = tokenList[++i];
                continue;
            }

            if (token.Equals("--model", StringComparison.OrdinalIgnoreCase))
            {
                if (i + 1 >= tokenList.Count)
                {
                    spec = new RoutineBrowserCommandSpec(string.Empty, null, string.Empty, null, null);
                    error = "usage: /routine create browser --model <model> [--url <start-url>] [--tool-profile <playwright_only|desktop_control>] <요청>";
                    return false;
                }

                model = tokenList[++i];
                continue;
            }

            if (token.Equals("--url", StringComparison.OrdinalIgnoreCase))
            {
                if (i + 1 >= tokenList.Count)
                {
                    spec = new RoutineBrowserCommandSpec(string.Empty, null, string.Empty, null, null);
                    error = "usage: /routine create browser --model <model> [--url <start-url>] [--tool-profile <playwright_only|desktop_control>] <요청>";
                    return false;
                }

                startUrl = tokenList[++i];
                continue;
            }

            if (token.Equals("--tool-profile", StringComparison.OrdinalIgnoreCase))
            {
                if (i + 1 >= tokenList.Count)
                {
                    spec = new RoutineBrowserCommandSpec(string.Empty, null, string.Empty, null, null);
                    error = "usage: /routine create browser --model <model> [--url <start-url>] [--tool-profile <playwright_only|desktop_control>] <요청>";
                    return false;
                }

                toolProfile = tokenList[++i];
                continue;
            }

            requestTokens.Add(token);
        }

        var request = string.Join(' ', requestTokens).Trim();
        if (string.IsNullOrWhiteSpace(model))
        {
            spec = new RoutineBrowserCommandSpec(string.Empty, null, string.Empty, null, null);
            error = "브라우저 루틴은 --model <model> 이 필요합니다.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(request))
        {
            spec = new RoutineBrowserCommandSpec(string.Empty, null, string.Empty, null, null);
            error = "브라우저 루틴 요청을 입력하세요.";
            return false;
        }

        spec = new RoutineBrowserCommandSpec(request, provider, model.Trim(), startUrl, toolProfile);
        error = string.Empty;
        return true;
    }

    private static bool ContainsAny(string text, params string[] patterns)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        foreach (var pattern in patterns)
        {
            if (!string.IsNullOrWhiteSpace(pattern)
                && text.Contains(pattern, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    internal sealed record RoutineBrowserCommandSpec(
        string Request,
        string? Provider,
        string Model,
        string? StartUrl,
        string? ToolProfile
    );
}

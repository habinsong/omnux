using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal static class CodingExecutionSafetyPolicy
{
    private static readonly Regex DangerousGeneratedRunCommandRegex = new(
        @"(^|[;&|]\s*)(?:sudo|su|rm\s+(?:-[A-Za-z]*r[A-Za-z]*|-?[A-Za-z]*f[A-Za-z]*r)|mkfs|dd\s+|chmod\s+-R|chown\s+-R|curl\b[^;&|]*\|\s*(?:sh|bash|zsh)|wget\b[^;&|]*\|\s*(?:sh|bash|zsh))\b|>\s*(?:/Users|/home|/private|/tmp|/var|/etc)/",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );

    // dev 서버/watch 처럼 종료되지 않고 루프를 막을 수 있는 명령. 즉시 실행하지 않고 마지막 검증 단계로 지연시킨다.
    private static readonly Regex LikelyLongRunningCommandRegex = new(
        @"(^|[;&|]\s*|\s)(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:dev|start|serve|watch)\b"
        + @"|(^|\s)(?:webpack-dev-server|nodemon|http-server|live-server|serve)\b"
        + @"|\bwebpack\s+serve\b"
        + @"|(^|\s)(?:vite|next|nuxt)(?:\s+(?:dev|serve|preview))?\s*(?=$|[;&|])"
        + @"|--watch\b"
        + @"|\b(?:flask\s+run|uvicorn|gunicorn|streamlit\s+run|daphne|hypercorn)\b"
        + @"|\bpython3?\s+-m\s+http\.server\b"
        + @"|\bphp\s+-S\b"
        + @"|\btail\s+-f\b"
        + @"|(^|\s)watch\s+\S",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );

    public static bool IsLikelyLongRunningCommand(string? command)
    {
        var normalized = CodingFallbackPolicy.NormalizeGeneratedRunCommand(command);
        return !string.IsNullOrWhiteSpace(normalized) && LikelyLongRunningCommandRegex.IsMatch(normalized);
    }

    public static bool ShouldTrustDeferredVerificationCommand(
        string language,
        string objective,
        string command,
        Func<string, string, bool>? isFrontendLikeCodingTask = null
    )
    {
        var normalizedLanguage = CodingLanguagePolicy.NormalizeLanguageForCode(language);
        if (string.IsNullOrWhiteSpace(command))
        {
            return false;
        }

        if (normalizedLanguage is "html" or "css" or "java" or "c" or "cpp")
        {
            return false;
        }

        if (normalizedLanguage is "javascript" or "typescript" or "react-vite"
            && (isFrontendLikeCodingTask?.Invoke(objective ?? string.Empty, normalizedLanguage) ?? false))
        {
            return false;
        }

        if (IsInteractiveProgramObjective(objective ?? string.Empty, normalizedLanguage, isFrontendLikeCodingTask))
        {
            return false;
        }

        return normalizedLanguage is "python" or "javascript" or "typescript" or "go" or "rust" or "php" or "ruby" or "swift" or "bash";
    }

    public static bool IsInteractiveProgramObjective(
        string objective,
        string normalizedLanguage,
        Func<string, string, bool>? isFrontendLikeCodingTask = null
    )
    {
        var language = CodingLanguagePolicy.NormalizeLanguageForCode(normalizedLanguage);
        var text = CodingLanguagePolicy.ExtractLatestCodingRequestText(WebUtility.HtmlDecode(objective ?? string.Empty)).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        // 요청당 한 번 판정해 둔 신호가 있으면 우선 따른다. 다만 그 판정은 LLM 한 번 호출이라
        // 틀릴 수 있는데, "pygame", "테트리스" 처럼 오해할 수 없는 단어가 요청에 박혀 있으면
        // 판정이 false 로 와도 게임으로 본다(실측: 판정이 false 로 떨어지면 게임 검증이 통째로
        // 빠지고 모델이 쓴 단위 테스트가 최종 검증이 되어 실패했다). 둘 중 하나라도 켜지면 대화형이다.
        var resolved = CodingTaskSignalResolver.TryGet(objective);
        var resolvedInteractive = resolved != null && (resolved.Interactive || resolved.Gui || resolved.Game);
        return resolvedInteractive
               || MatchesInteractiveKeywords(text, language, objective ?? string.Empty, isFrontendLikeCodingTask);
    }

    /// <summary>
    /// 요청 문장 자체에 대화형 근거가 있는지. LLM 판정이 대화형이라고 해도 요청에도, 만들어진
    /// 코드에도 근거가 없으면 게임 기준을 강요하지 않기 위해 쓴다.
    /// </summary>
    public static bool HasInteractiveKeywordEvidence(
        string objective,
        string normalizedLanguage,
        Func<string, string, bool>? isFrontendLikeCodingTask = null
    )
    {
        var language = CodingLanguagePolicy.NormalizeLanguageForCode(normalizedLanguage);
        var text = CodingLanguagePolicy.ExtractLatestCodingRequestText(WebUtility.HtmlDecode(objective ?? string.Empty)).ToLowerInvariant();
        return !string.IsNullOrWhiteSpace(text)
               && MatchesInteractiveKeywords(text, language, objective ?? string.Empty, isFrontendLikeCodingTask);
    }

    /// <summary>판정 신호가 없거나 놓쳤을 때 쓰는 어휘 폴백. 한국어 요청도 여기서 걸러진다.</summary>
    private static bool MatchesInteractiveKeywords(
        string text,
        string language,
        string objective,
        Func<string, string, bool>? isFrontendLikeCodingTask
    )
    {
        if (language == "python")
        {
            return ContainsAny(
                text,
                "game",
                "shooter",
                "shooting",
                "tetris",
                "pong",
                "snake",
                "tkinter",
                "pygame",
                "arcade",
                "sprite",
                "animation",
                "graphic",
                "gui",
                "window",
                "mainloop",
                "canvas",
                "keyboard",
                "mouse",
                "게임",
                "테트리스",
                "벽돌깨기",
                "슈팅",
                "마리오",
                "아케이드",
                "미로",
                "퍼즐",
                "창을 띄",
                "키보드",
                "마우스",
                "애니메이션"
            );
        }

        if (language is "javascript" or "typescript" or "react-vite")
        {
            return (isFrontendLikeCodingTask?.Invoke(objective ?? string.Empty, language) ?? false)
                   || ContainsAny(text, "canvas", "animation", "sprite", "dom", "browser", "게임", "애니메이션");
        }

        if (language == "bash")
        {
            return ContainsAny(text, "watch", "tail -f", "server", "serve", "dev server");
        }

        return false;
    }

    public static bool LooksLikeFilePathForDirectoryAction(string? resolvedPath, IReadOnlyList<string>? requestedPaths)
    {
        var normalized = CodingFallbackPolicy.NormalizeRequestedCodingPath(resolvedPath);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        if (requestedPaths != null
            && requestedPaths.Any(path => string.Equals(CodingFallbackPolicy.NormalizeRequestedCodingPath(path), normalized, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        var extension = Path.GetExtension(normalized);
        return !string.IsNullOrWhiteSpace(extension);
    }

    public static string SanitizePathSegment(string raw)
    {
        var value = (raw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (char.IsLetterOrDigit(ch) || ch == '-' || ch == '_' || ch == '.')
            {
                builder.Append(ch);
            }
        }

        return builder.Length == 0 ? string.Empty : builder.ToString();
    }

    public static bool IsDangerousGeneratedRunCommand(string? command)
    {
        var normalized = CodingFallbackPolicy.NormalizeGeneratedRunCommand(command);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        return DangerousGeneratedRunCommandRegex.IsMatch(normalized);
    }

    public static string NormalizeActionType(string? rawType, string? path, string? content, string? command)
    {
        return CodingLoopPlanParser.NormalizeActionType(rawType, path, content, command);
    }

    private static bool ContainsAny(string text, params string[] patterns)
    {
        return patterns.Any(pattern => text.Contains(pattern, StringComparison.OrdinalIgnoreCase));
    }
}

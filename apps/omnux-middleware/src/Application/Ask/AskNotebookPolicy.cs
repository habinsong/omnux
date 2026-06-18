using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed record AskNotebookAppendRequest(string Kind, string Content);

internal static class AskNotebookPolicy
{
    private static readonly Regex NotebookRecallRegex = new(
        @"(노트북.{0,12}(내용|기록|결정|검증|배운\s*점|이어보기|보여|찾아|알려)|이전\s*결정|검증\s*(결과|기록)|배운\s*점|이어보기)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase
    );

    private static readonly Regex AppendRegex = new(
        @"노트북(?:에|으로)?\s*(?:(결정|검증|verification|decision|배운\s*점|학습|learning)(?:으로)?\s*)?(기록해|기록해줘|메모해|메모해줘|추가해|추가해줘|저장해|저장해줘)\s*[:：]?\s*(.+)$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase
    );

    public static bool ShouldRetrieve(string? input)
    {
        var normalized = (input ?? string.Empty).Trim();
        return normalized.Length > 0 && NotebookRecallRegex.IsMatch(normalized);
    }

    public static bool TryBuildAppendRequest(
        string? input,
        out AskNotebookAppendRequest? request
    )
    {
        request = null;
        var normalized = (input ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return false;
        }

        var match = AppendRegex.Match(normalized);
        if (!match.Success)
        {
            return false;
        }

        var content = match.Groups[3].Value.Trim().TrimStart(':', '：').Trim();
        if (content.Length == 0)
        {
            return false;
        }

        request = new AskNotebookAppendRequest(
            ResolveKind(match.Groups[1].Value),
            content
        );
        return true;
    }

    private static string ResolveKind(string rawKind)
    {
        var normalized = (rawKind ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized is "결정" or "decision")
        {
            return "decision";
        }

        if (normalized is "검증" or "verification")
        {
            return "verification";
        }

        return "learning";
    }
}

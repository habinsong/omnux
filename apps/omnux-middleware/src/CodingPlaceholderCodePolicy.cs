using System.Text.RegularExpressions;

namespace Omnux.Middleware;

/// <summary>
/// 만들어진 코드가 "미구현 껍데기"인지 본다.
/// 낱말 `todo` 자체를 세면 할 일 관리자처럼 그 낱말이 도메인 용어인 프로젝트가 통째로 더미로
/// 몰린다(실측: `todo_cli` 패키지가 실행·테스트를 통과하고도 0점). 그래서 관례대로 쓰는 대문자
/// 표시(`# TODO:`, `// FIXME`)와 미구현 예외만 센다.
/// </summary>
public static class CodingPlaceholderCodePolicy
{
    private static readonly Regex MarkerRegex = new(
        @"(?://|\#|/\*|\*)\s*(?:TODO|FIXME|XXX)\b"
        + @"|\b(?:TODO|FIXME)\s*[:(]"
        + @"|\bNotImplementedError\b"
        + @"|\bNotImplementedException\b"
        + @"|(?i:\bnot\s+implemented\b)"
        + @"|(?i:(?://|\#)\s*placeholder)"
        + @"|미구현",
        RegexOptions.Multiline | RegexOptions.Compiled
    );

    /// <summary>표시가 적어도 이만큼이면 미구현 중심으로 본다.</summary>
    private const int MarkersForPlaceholderHeavy = 2;

    /// <summary>코드가 이보다 짧으면 표시 하나만으로도 미구현 중심으로 본다.</summary>
    private const int SmallCodeLineCount = 25;

    public static int CountMarkers(string? text) =>
        string.IsNullOrWhiteSpace(text) ? 0 : MarkerRegex.Matches(text).Count;

    public static bool LooksPlaceholderHeavy(IReadOnlyDictionary<string, string> sources)
    {
        var text = string.Join("\n", (sources ?? new Dictionary<string, string>()).Values);
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        var markers = CountMarkers(text);
        if (markers == 0)
        {
            return false;
        }

        var meaningfulLines = text
            .Split('\n')
            .Select(line => line.Trim())
            .Count(line => line.Length > 0
                           && !line.StartsWith("//", StringComparison.Ordinal)
                           && !line.StartsWith("#", StringComparison.Ordinal));
        return markers >= MarkersForPlaceholderHeavy || meaningfulLines < SmallCodeLineCount;
    }
}

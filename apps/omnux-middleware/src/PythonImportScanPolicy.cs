using System.Text.RegularExpressions;

namespace Omnux.Middleware;

/// <summary>
/// 파이썬 소스에서 import 하는 최상위 모듈 이름만 뽑는다.
///
/// 정규식 문자 클래스에 개행을 넣으면 안 된다. 예전에는 <c>[A-Za-z0-9_.,\s]</c> 를 써서
/// "import unittest" 다음 줄의 "from stats import mean, median, stdev" 까지 한 덩어리로
/// 삼켰고, median·stdev 를 외부 패키지로 오인해 pip install 이 매번 실패했다(실측).
/// </summary>
public static class PythonImportScanPolicy
{
    private static readonly Regex ImportRegex = new(
        "^[ \t]*import[ \t]+(?<mods>[A-Za-z0-9_., \t]+)",
        RegexOptions.Compiled | RegexOptions.Multiline
    );

    private static readonly Regex FromImportRegex = new(
        "^[ \t]*from[ \t]+(?<mod>[A-Za-z0-9_.]+)[ \t]+import[ \t]+",
        RegexOptions.Compiled | RegexOptions.Multiline
    );

    public static IReadOnlyList<string> ExtractRootModules(string? sourceText)
    {
        var text = sourceText ?? string.Empty;
        var modules = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (Match match in ImportRegex.Matches(text))
        {
            var parts = (match.Groups["mods"].Value ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var part in parts)
            {
                // "import numpy as np" 의 별칭은 버리고 앞 토큰만 본다.
                var token = part.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                AddRoot(modules, token);
            }
        }

        foreach (Match match in FromImportRegex.Matches(text))
        {
            AddRoot(modules, match.Groups["mod"].Value);
        }

        return modules.OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static void AddRoot(HashSet<string> modules, string? token)
    {
        var root = (token ?? string.Empty).Split('.', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.Trim();
        if (!string.IsNullOrWhiteSpace(root))
        {
            modules.Add(root!);
        }
    }
}

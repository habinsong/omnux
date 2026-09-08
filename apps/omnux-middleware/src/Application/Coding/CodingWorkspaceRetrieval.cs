using System.Text;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal static class CodingWorkspaceRetrieval
{
    public static async Task<string?> BuildAsync(string root, string objective, CancellationToken cancellationToken)
    {
        if (AskAutoRetrievalPolicy.IsDisabledValue(Environment.GetEnvironmentVariable("OMNUX_CODING_AUTO_RETRIEVAL"))) return null;
        var paths = await ProjectFileInventory.ReadAsync(root, cancellationToken);
        var snapshot = new CodeRepomapSnapshotService(root, selectedFiles: paths).GetSnapshot(300, cancellationToken);
        if (snapshot.Files.Count == 0) return null;
        var request = CodingLanguagePolicy.ExtractLatestCodingRequestText(objective);
        var terms = Regex.Matches(request, @"[\p{L}\p{N}_./-]{3,}").Select(match => match.Value).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var selected = snapshot.Files.OrderByDescending(file => terms.Count(term => file.Path.Contains(term, StringComparison.OrdinalIgnoreCase)
                || file.Symbols.Any(symbol => symbol.Name.Contains(term, StringComparison.OrdinalIgnoreCase))))
            .ThenBy(file => file.Path, StringComparer.Ordinal).Take(12);
        var builder = new StringBuilder("현재 작업 폴더의 참조 위치입니다. 필요한 파일은 읽기 도구로 확인하세요.\n");
        foreach (var file in selected)
        {
            builder.AppendLine($"### code:{file.Path}");
            foreach (var symbol in file.Symbols.Take(6)) builder.AppendLine($"- {symbol.Name} · {symbol.Kind} · {symbol.Line}행");
        }
        if (snapshot.Truncated) builder.AppendLine("파일 목록 일부만 포함했습니다.");
        return builder.ToString();
    }
}

using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal sealed record MemoryChunkPlanEntry(
    int StartLine,
    int EndLine,
    string Text
);

internal static partial class MemoryChunkingPolicy
{
    private static readonly HashSet<string> CodeExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".cs", ".js", ".mjs", ".ts", ".tsx", ".py"
    };

    public static IReadOnlyList<MemoryChunkPlanEntry> Chunk(
        string path,
        string source,
        string content,
        int chunkTokens,
        int overlapTokens
    )
    {
        var lines = NormalizeLines(content);
        if (lines.Length == 0)
        {
            return Array.Empty<MemoryChunkPlanEntry>();
        }

        var maxChars = Math.Max(32, chunkTokens * 4);
        if (IsCodeDocument(path, source))
        {
            var structured = ChunkCode(lines, Path.GetExtension(path), maxChars, overlapTokens);
            if (structured.Count > 0)
            {
                return structured;
            }
        }

        return ChunkSliding(lines, maxChars, Math.Max(0, overlapTokens * 4), startLine: 1);
    }

    private static bool IsCodeDocument(string path, string source)
    {
        return string.Equals(source, "project", StringComparison.Ordinal)
               && CodeExtensions.Contains(Path.GetExtension(path));
    }

    private static IReadOnlyList<MemoryChunkPlanEntry> ChunkCode(
        IReadOnlyList<string> lines,
        string extension,
        int maxChars,
        int overlapTokens
    )
    {
        var starts = FindDeclarationStarts(lines, extension);
        if (starts.Count == 0)
        {
            return Array.Empty<MemoryChunkPlanEntry>();
        }

        var result = new List<MemoryChunkPlanEntry>();
        if (starts[0] > 0)
        {
            AddSegment(result, lines, 0, starts[0] - 1, maxChars, overlapTokens);
        }

        for (var i = 0; i < starts.Count; i += 1)
        {
            var start = IncludeLeadingContext(lines, starts[i]);
            var end = i + 1 < starts.Count ? starts[i + 1] - 1 : lines.Count - 1;
            AddSegment(result, lines, start, end, maxChars, overlapTokens);
        }

        return result;
    }

    private static IReadOnlyList<int> FindDeclarationStarts(IReadOnlyList<string> lines, string extension)
    {
        var starts = new List<int>();
        for (var i = 0; i < lines.Count; i += 1)
        {
            if (IsDeclarationBoundary(lines[i], extension))
            {
                starts.Add(i);
            }
        }

        return starts;
    }

    private static bool IsDeclarationBoundary(string line, string extension)
    {
        return extension.ToLowerInvariant() switch
        {
            ".cs" => IsCSharpBoundary(line),
            ".js" or ".mjs" or ".ts" or ".tsx" => IsJavaScriptBoundary(line),
            ".py" => IsPythonBoundary(line),
            _ => false
        };
    }

    private static bool IsCSharpBoundary(string line)
    {
        var trimmed = line.Trim();
        if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("//", StringComparison.Ordinal))
        {
            return false;
        }

        if (CSharpTypeRegex().IsMatch(trimmed))
        {
            return true;
        }

        if (!trimmed.Contains('(') || !trimmed.Contains(')'))
        {
            return false;
        }

        if (ControlFlowRegex().IsMatch(trimmed))
        {
            return false;
        }

        return CSharpCallableRegex().IsMatch(trimmed) || CSharpConstructorRegex().IsMatch(trimmed);
    }

    private static bool IsJavaScriptBoundary(string line)
    {
        var trimmed = line.Trim();
        if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("//", StringComparison.Ordinal))
        {
            return false;
        }

        if (ControlFlowRegex().IsMatch(trimmed))
        {
            return false;
        }

        return JavaScriptTypeRegex().IsMatch(trimmed)
               || JavaScriptFunctionRegex().IsMatch(trimmed)
               || JavaScriptAssignmentRegex().IsMatch(trimmed)
               || JavaScriptMethodRegex().IsMatch(trimmed);
    }

    private static bool IsPythonBoundary(string line)
    {
        var trimmed = line.TrimStart();
        return trimmed.StartsWith("def ", StringComparison.Ordinal)
               || trimmed.StartsWith("async def ", StringComparison.Ordinal)
               || trimmed.StartsWith("class ", StringComparison.Ordinal);
    }

    private static int IncludeLeadingContext(IReadOnlyList<string> lines, int start)
    {
        var adjusted = start;
        for (var i = start - 1; i >= 0; i -= 1)
        {
            var trimmed = lines[i].Trim();
            if (string.IsNullOrWhiteSpace(trimmed)
                || trimmed.StartsWith("//", StringComparison.Ordinal)
                || trimmed.StartsWith("#", StringComparison.Ordinal)
                || trimmed.StartsWith("[", StringComparison.Ordinal)
                || trimmed.StartsWith("*", StringComparison.Ordinal)
                || trimmed.StartsWith("/*", StringComparison.Ordinal)
                || trimmed.StartsWith("///", StringComparison.Ordinal))
            {
                adjusted = i;
                continue;
            }

            break;
        }

        return adjusted;
    }

    private static void AddSegment(
        List<MemoryChunkPlanEntry> result,
        IReadOnlyList<string> lines,
        int start,
        int end,
        int maxChars,
        int overlapTokens
    )
    {
        if (start < 0 || end < start || start >= lines.Count)
        {
            return;
        }

        var safeEnd = Math.Min(end, lines.Count - 1);
        var text = JoinLines(lines, start, safeEnd);
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        if (text.Length <= maxChars)
        {
            result.Add(new MemoryChunkPlanEntry(start + 1, safeEnd + 1, text));
            return;
        }

        var slice = lines.Skip(start).Take(safeEnd - start + 1).ToArray();
        result.AddRange(ChunkSliding(slice, maxChars, Math.Max(0, overlapTokens * 4), start + 1));
    }

    private static IReadOnlyList<MemoryChunkPlanEntry> ChunkSliding(
        IReadOnlyList<string> lines,
        int maxChars,
        int overlapChars,
        int startLine
    )
    {
        var result = new List<MemoryChunkPlanEntry>();
        var current = new List<(string Segment, int LineNo)>();
        var currentChars = 0;

        void Flush()
        {
            if (current.Count == 0)
            {
                return;
            }

            var text = string.Join("\n", current.Select(x => x.Segment));
            if (!string.IsNullOrWhiteSpace(text))
            {
                result.Add(new MemoryChunkPlanEntry(current[0].LineNo, current[^1].LineNo, text));
            }
        }

        void CarryOverlap()
        {
            if (overlapChars <= 0 || current.Count == 0)
            {
                current.Clear();
                currentChars = 0;
                return;
            }

            var kept = new List<(string Segment, int LineNo)>();
            var chars = 0;
            for (var i = current.Count - 1; i >= 0; i -= 1)
            {
                var item = current[i];
                kept.Insert(0, item);
                chars += item.Segment.Length + 1;
                if (chars >= overlapChars)
                {
                    break;
                }
            }

            current = kept;
            currentChars = chars;
        }

        for (var i = 0; i < lines.Count; i += 1)
        {
            var lineNo = startLine + i;
            foreach (var segment in SplitLine(lines[i] ?? string.Empty, maxChars))
            {
                var segmentChars = segment.Length + 1;
                if (current.Count > 0 && currentChars + segmentChars > maxChars)
                {
                    Flush();
                    CarryOverlap();
                }

                current.Add((segment, lineNo));
                currentChars += segmentChars;
            }
        }

        Flush();
        return result;
    }

    private static string[] NormalizeLines(string content)
    {
        return (content ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n');
    }

    private static string JoinLines(IReadOnlyList<string> lines, int start, int end)
    {
        return string.Join("\n", lines.Skip(start).Take(end - start + 1));
    }

    private static IReadOnlyList<string> SplitLine(string line, int maxChars)
    {
        if (line.Length == 0)
        {
            return new[] { string.Empty };
        }

        if (line.Length <= maxChars)
        {
            return new[] { line };
        }

        var segments = new List<string>((line.Length / maxChars) + 1);
        for (var start = 0; start < line.Length; start += maxChars)
        {
            var length = Math.Min(maxChars, line.Length - start);
            segments.Add(line.Substring(start, length));
        }

        return segments;
    }

    [GeneratedRegex("\\b(class|interface|record|struct|enum)\\s+[A-Za-z_][A-Za-z0-9_]*")]
    private static partial Regex CSharpTypeRegex();

    [GeneratedRegex("^(if|for|foreach|while|switch|catch|using|lock|return|throw|new)\\b")]
    private static partial Regex ControlFlowRegex();

    [GeneratedRegex("^(public|private|protected|internal|static|async|sealed|partial|readonly|override|virtual|extern|unsafe|new|\\s)+[A-Za-z0-9_<>,\\[\\]?\\.]+\\s+[A-Za-z_][A-Za-z0-9_]*\\s*\\(")]
    private static partial Regex CSharpCallableRegex();

    [GeneratedRegex("^(public|private|protected|internal|static|extern|unsafe|\\s)+[A-Za-z_][A-Za-z0-9_]*\\s*\\(")]
    private static partial Regex CSharpConstructorRegex();

    [GeneratedRegex("^(export\\s+)?(class|interface|type|enum)\\s+[A-Za-z_][A-Za-z0-9_]*")]
    private static partial Regex JavaScriptTypeRegex();

    [GeneratedRegex("^(export\\s+)?(async\\s+)?function\\s+[A-Za-z_][A-Za-z0-9_]*\\s*\\(")]
    private static partial Regex JavaScriptFunctionRegex();

    [GeneratedRegex("^(export\\s+)?(const|let|var)\\s+[A-Za-z_][A-Za-z0-9_]*\\s*=\\s*(async\\s*)?(function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_][A-Za-z0-9_]*\\s*=>)")]
    private static partial Regex JavaScriptAssignmentRegex();

    [GeneratedRegex("^(public|private|protected|static|async|get|set)?\\s*[A-Za-z_][A-Za-z0-9_]*\\s*\\([^)]*\\)\\s*\\{")]
    private static partial Regex JavaScriptMethodRegex();
}

using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal sealed partial class CodeRepomapSnapshotService
{
    private const int DefaultFileLimit = 80;
    private const int MaxFileLimit = 300;
    private const int MaxSymbolsPerFile = 40;
    private const long MaxFileBytes = 512 * 1024;
    private static readonly string[] ProjectRoots = { "apps", "scripts", "workspace" };
    private static readonly HashSet<string> CodeExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".cs", ".js", ".mjs", ".ts", ".tsx", ".py"
    };

    private static readonly HashSet<string> ExcludedDirectoryNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ".git", ".runtime", ".cache", "node_modules", "bin", "obj", "dist", "build", "target", "__pycache__"
    };

    private readonly string _workspaceRoot;
    private readonly Func<DateTimeOffset> _utcNow;

    public CodeRepomapSnapshotService(string workspaceRoot, Func<DateTimeOffset>? utcNow = null)
    {
        _workspaceRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(workspaceRoot) ? "." : workspaceRoot);
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public CodeRepomapSnapshot GetSnapshot(int? limit = null)
    {
        if (!Directory.Exists(_workspaceRoot))
        {
            return new CodeRepomapSnapshot(
                "error",
                _workspaceRoot,
                Array.Empty<CodeRepomapFile>(),
                0,
                0,
                0,
                Truncated: false,
                new[] { "workspace root does not exist" },
                _utcNow()
            );
        }

        var fileLimit = Math.Clamp(limit ?? DefaultFileLimit, 1, MaxFileLimit);
        var warnings = new List<string>();
        var files = new List<CodeRepomapFile>();
        var scanned = 0;
        var truncated = false;
        foreach (var filePath in EnumerateCodeFiles())
        {
            if (files.Count >= fileLimit)
            {
                truncated = true;
                break;
            }

            scanned += 1;
            var file = TryMapFile(filePath, warnings);
            if (file is not null)
            {
                files.Add(file);
            }
        }

        return new CodeRepomapSnapshot(
            files.Count == 0 ? "empty" : "ok",
            _workspaceRoot,
            files,
            scanned,
            files.Count,
            files.Sum(file => file.SymbolCount),
            truncated,
            warnings,
            _utcNow()
        );
    }

    private IEnumerable<string> EnumerateCodeFiles()
    {
        foreach (var root in ResolveScanRoots())
        {
            var pending = new Stack<string>();
            pending.Push(root);
            while (pending.Count > 0)
            {
                var directory = pending.Pop();
                IEnumerable<string> childDirectories;
                try
                {
                    childDirectories = Directory.EnumerateDirectories(directory);
                }
                catch
                {
                    childDirectories = Array.Empty<string>();
                }

                foreach (var child in childDirectories)
                {
                    if (!ExcludedDirectoryNames.Contains(Path.GetFileName(child)))
                    {
                        pending.Push(child);
                    }
                }

                IEnumerable<string> files;
                try
                {
                    files = Directory.EnumerateFiles(directory);
                }
                catch
                {
                    files = Array.Empty<string>();
                }

                foreach (var file in files)
                {
                    if (CodeExtensions.Contains(Path.GetExtension(file)))
                    {
                        yield return Path.GetFullPath(file);
                    }
                }
            }
        }
    }

    private IReadOnlyList<string> ResolveScanRoots()
    {
        return ProjectRoots
            .Select(root => Path.Combine(_workspaceRoot, root))
            .Where(Directory.Exists)
            .Select(Path.GetFullPath)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(path => path, StringComparer.Ordinal)
            .ToArray();
    }

    private CodeRepomapFile? TryMapFile(string filePath, ICollection<string> warnings)
    {
        try
        {
            var info = new FileInfo(filePath);
            if (info.Length > MaxFileBytes)
            {
                warnings.Add($"skipped_large_file:{ToRelativePath(filePath)}");
                return null;
            }

            var content = File.ReadAllText(filePath);
            if (LooksBinary(content))
            {
                warnings.Add($"skipped_binary_file:{ToRelativePath(filePath)}");
                return null;
            }

            var symbols = ExtractSymbols(filePath, content).Take(MaxSymbolsPerFile).ToArray();
            if (symbols.Length == 0)
            {
                return null;
            }

            return new CodeRepomapFile(
                ToRelativePath(filePath),
                ResolveLanguage(filePath),
                symbols.Length,
                symbols
            );
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            warnings.Add($"read_failed:{ToRelativePath(filePath)}");
            return null;
        }
    }

    private IReadOnlyList<CodeRepomapSymbol> ExtractSymbols(string filePath, string content)
    {
        var extension = Path.GetExtension(filePath).ToLowerInvariant();
        var lines = NormalizeLines(content);
        var result = new List<CodeRepomapSymbol>();
        for (var index = 0; index < lines.Length; index += 1)
        {
            var symbol = extension switch
            {
                ".cs" => TryExtractCSharp(lines[index], index + 1),
                ".js" or ".mjs" or ".ts" or ".tsx" => TryExtractJavaScript(lines[index], index + 1),
                ".py" => TryExtractPython(lines[index], index + 1),
                _ => null
            };
            if (symbol is not null)
            {
                result.Add(symbol);
            }
        }

        return result;
    }

    private static CodeRepomapSymbol? TryExtractCSharp(string line, int lineNo)
    {
        var trimmed = line.Trim();
        if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("//", StringComparison.Ordinal))
        {
            return null;
        }

        var typeMatch = CSharpTypeRegex().Match(trimmed);
        if (typeMatch.Success)
        {
            return BuildSymbol(typeMatch.Groups["name"].Value, typeMatch.Groups["kind"].Value, trimmed, lineNo);
        }

        if (!trimmed.Contains('(') || !trimmed.Contains(')') || ControlFlowRegex().IsMatch(trimmed))
        {
            return null;
        }

        if (CSharpCallableRegex().IsMatch(trimmed) || CSharpConstructorRegex().IsMatch(trimmed))
        {
            return BuildSymbol(ExtractNameBeforeParen(trimmed), "method", trimmed, lineNo);
        }

        return null;
    }

    private static CodeRepomapSymbol? TryExtractJavaScript(string line, int lineNo)
    {
        var trimmed = line.Trim();
        if (string.IsNullOrWhiteSpace(trimmed)
            || trimmed.StartsWith("//", StringComparison.Ordinal)
            || ControlFlowRegex().IsMatch(trimmed))
        {
            return null;
        }

        var typeMatch = JavaScriptTypeRegex().Match(trimmed);
        if (typeMatch.Success)
        {
            return BuildSymbol(typeMatch.Groups["name"].Value, typeMatch.Groups["kind"].Value, trimmed, lineNo);
        }

        var functionMatch = JavaScriptFunctionRegex().Match(trimmed);
        if (functionMatch.Success)
        {
            return BuildSymbol(functionMatch.Groups["name"].Value, "function", trimmed, lineNo);
        }

        var assignmentMatch = JavaScriptAssignmentRegex().Match(trimmed);
        if (assignmentMatch.Success)
        {
            return BuildSymbol(assignmentMatch.Groups["name"].Value, "function", trimmed, lineNo);
        }

        var methodMatch = JavaScriptMethodRegex().Match(trimmed);
        return methodMatch.Success
            ? BuildSymbol(methodMatch.Groups["name"].Value, "method", trimmed, lineNo)
            : null;
    }

    private static CodeRepomapSymbol? TryExtractPython(string line, int lineNo)
    {
        var trimmed = line.TrimStart();
        var match = PythonDeclarationRegex().Match(trimmed);
        return match.Success
            ? BuildSymbol(match.Groups["name"].Value, match.Groups["kind"].Value, trimmed, lineNo)
            : null;
    }

    private static CodeRepomapSymbol BuildSymbol(string name, string kind, string signature, int line)
    {
        return new CodeRepomapSymbol(
            string.IsNullOrWhiteSpace(name) ? "anonymous" : name.Trim(),
            string.IsNullOrWhiteSpace(kind) ? "symbol" : kind.Trim(),
            TrimSignature(signature),
            line
        );
    }

    private static string ExtractNameBeforeParen(string signature)
    {
        var beforeParen = signature.Split('(', 2)[0].Trim();
        var tokens = beforeParen.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return tokens.Length == 0 ? "anonymous" : tokens[^1].Trim();
    }

    private static string TrimSignature(string signature)
    {
        var normalized = (signature ?? string.Empty).Trim();
        return normalized.Length <= 180 ? normalized : normalized[..180] + "...";
    }

    private static string[] NormalizeLines(string content)
    {
        return (content ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n');
    }

    private static bool LooksBinary(string content)
    {
        var probeLength = Math.Min(content.Length, 4096);
        for (var i = 0; i < probeLength; i += 1)
        {
            if (content[i] == '\0')
            {
                return true;
            }
        }

        return false;
    }

    private string ToRelativePath(string filePath)
    {
        return Path.GetRelativePath(_workspaceRoot, filePath).Replace(Path.DirectorySeparatorChar, '/');
    }

    private static string ResolveLanguage(string path)
    {
        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".cs" => "csharp",
            ".js" or ".mjs" => "javascript",
            ".ts" or ".tsx" => "typescript",
            ".py" => "python",
            _ => "unknown"
        };
    }

    [GeneratedRegex("\\b(?<kind>class|interface|record|struct|enum)\\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)")]
    private static partial Regex CSharpTypeRegex();

    [GeneratedRegex("^(if|for|foreach|while|switch|catch|using|lock|return|throw|new)\\b")]
    private static partial Regex ControlFlowRegex();

    [GeneratedRegex("^(public|private|protected|internal|static|async|sealed|partial|readonly|override|virtual|extern|unsafe|new|\\s)+[A-Za-z0-9_<>,\\[\\]?\\.]+\\s+[A-Za-z_][A-Za-z0-9_]*\\s*\\(")]
    private static partial Regex CSharpCallableRegex();

    [GeneratedRegex("^(public|private|protected|internal|static|extern|unsafe|\\s)+[A-Za-z_][A-Za-z0-9_]*\\s*\\(")]
    private static partial Regex CSharpConstructorRegex();

    [GeneratedRegex("^(export\\s+)?(?<kind>class|interface|type|enum)\\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)")]
    private static partial Regex JavaScriptTypeRegex();

    [GeneratedRegex("^(export\\s+)?(async\\s+)?function\\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)\\s*\\(")]
    private static partial Regex JavaScriptFunctionRegex();

    [GeneratedRegex("^(export\\s+)?(const|let|var)\\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(async\\s*)?(function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_][A-Za-z0-9_]*\\s*=>)")]
    private static partial Regex JavaScriptAssignmentRegex();

    [GeneratedRegex("^(public|private|protected|static|async|get|set)?\\s*(?<name>[A-Za-z_][A-Za-z0-9_]*)\\s*\\([^)]*\\)\\s*\\{?")]
    private static partial Regex JavaScriptMethodRegex();

    [GeneratedRegex("^(?<kind>class|def|async def)\\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)")]
    private static partial Regex PythonDeclarationRegex();
}

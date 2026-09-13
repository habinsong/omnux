using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class CodingApplicationService
{
    private string BuildWorkspaceSnapshot(string workspaceRoot, string provider, int? maxEntriesOverride = null)
    {
        try
        {
            if (!Directory.Exists(workspaceRoot))
            {
                return "(workspace not found)";
            }

            var configuredMaxEntries = Math.Max(
                20,
                string.Equals(provider, "copilot", StringComparison.OrdinalIgnoreCase)
                    ? Math.Min(_context.CodingWorkspaceSnapshotMaxEntries, 60)
                    : _context.CodingWorkspaceSnapshotMaxEntries
            );
            var maxEntries = maxEntriesOverride.HasValue
                ? Math.Max(12, maxEntriesOverride.Value)
                : configuredMaxEntries;
            var files = Directory.EnumerateFiles(workspaceRoot, "*", SearchOption.AllDirectories)
                .Select(path => Path.GetRelativePath(workspaceRoot, path))
                .Where(path => !CodingWorkspaceFilePolicy.ShouldSkip(path))
                .ToArray();
            if (files.Length == 0)
            {
                return "(empty)";
            }

            var lines = new List<string>();
            lines.Add($"total_files={files.Length}");
            foreach (var relative in files.Take(maxEntries))
            {
                var fullPath = Path.Combine(workspaceRoot, relative);
                long size = 0;
                try
                {
                    size = new FileInfo(fullPath).Length;
                }
                catch
                {
                }

                lines.Add($"{relative} ({size}B)");
            }

            if (files.Length > maxEntries)
            {
                lines.Add($"... +{files.Length - maxEntries} files");
            }

            return string.Join("\n", lines);
        }
        catch (Exception ex)
        {
            return $"(snapshot error: {ex.Message})";
        }
    }

    private string ResolveWorkspaceRoot()
    {
        var configured = string.IsNullOrWhiteSpace(_paths.WorkspaceRootDir)
            ? Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."))
            : _paths.WorkspaceRootDir;
        var fullPath = Path.GetFullPath(configured);
        try
        {
            Directory.CreateDirectory(fullPath);
        }
        catch
        {
        }

        return fullPath;
    }

    private string ResolveCodingWorkspaceRoot(string? workspaceRootOverride)
    {
        var candidate = string.IsNullOrWhiteSpace(workspaceRootOverride)
            ? ResolveWorkspaceRoot()
            : Path.GetFullPath(workspaceRootOverride);

        try
        {
            Directory.CreateDirectory(candidate);
        }
        catch
        {
        }

        return candidate;
    }

    private string CreateCodingRunWorkspaceRoot(string modeLabel)
    {
        var workspaceRoot = ResolveWorkspaceRoot();
        var runsRoot = Path.Combine(workspaceRoot, "runs");
        Directory.CreateDirectory(runsRoot);

        var safeMode = CodingExecutionSafetyPolicy.SanitizePathSegment((modeLabel ?? string.Empty).ToLowerInvariant());
        if (string.IsNullOrWhiteSpace(safeMode))
        {
            safeMode = "coding";
        }

        for (var attempt = 0; attempt < 5; attempt++)
        {
            var timestamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmssfff", CultureInfo.InvariantCulture);
            var suffix = Guid.NewGuid().ToString("N")[..8];
            var folderName = $"{timestamp}-{safeMode}-{suffix}";
            var runRoot = Path.Combine(runsRoot, folderName);
            if (Directory.Exists(runRoot))
            {
                continue;
            }

            Directory.CreateDirectory(runRoot);
            return runRoot;
        }

        var fallbackRoot = Path.Combine(runsRoot, $"{DateTimeOffset.UtcNow:yyyyMMdd-HHmmssfff}-{safeMode}");
        Directory.CreateDirectory(fallbackRoot);
        return fallbackRoot;
    }

    // 같은 대화에서 이전 코딩 실행 폴더가 있으면 이어서 작업하도록 재사용한다.
    // Claude Code/Codex 처럼 한 대화 안에서 같은 프로젝트를 계속 다듬기 위함(싱글/오케스트레이션).
    private string ResolveOrCreateCodingRunWorkspaceRoot(SessionContext session, string modeLabel)
    {
        if (modeLabel != "multi" && session.Thread.CodingProject != null) return session.Thread.CodingProject.Path;
        var reusable = TryResolveReusableConversationRunDirectory(session, modeLabel);
        if (string.IsNullOrWhiteSpace(reusable) && session.Thread.LatestCodingResult?.CheckpointId is { Length: > 0 })
        {
            throw new InvalidOperationException("중단한 작업 폴더를 찾을 수 없거나 안전하게 열 수 없습니다. 원래 폴더를 복원하거나 새 작업을 만들어 주세요.");
        }
        return string.IsNullOrWhiteSpace(reusable)
            ? CreateCodingRunWorkspaceRoot(modeLabel)
            : reusable!;
    }

    private string? TryResolveReusableConversationRunDirectory(SessionContext session, string modeLabel)
    {
        var latest = session.Thread.LatestCodingResult;
        if (latest == null)
        {
            return null;
        }

        // 모드가 일치하는 이전 결과만 재사용한다(예: 다중 비교 결과 폴더를 단일에서 재사용하지 않음).
        if (!string.Equals(latest.Mode, modeLabel, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var candidate = NormalizeStoredRunDirectory(latest.Execution.RunDirectory);
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return null;
        }

        string fullCandidate;
        try
        {
            fullCandidate = Path.GetFullPath(candidate);
        }
        catch
        {
            return null;
        }

        if (!Directory.Exists(fullCandidate))
        {
            return null;
        }

        // 보안: workspace/runs 하위 폴더만 재사용한다.
        var runsRoot = Path.Combine(ResolveWorkspaceRoot(), "runs");
        return IsPathUnderRoot(fullCandidate, runsRoot) && CodingPreviewPolicy.IsRegularDirectoryWithinRun(fullCandidate, runsRoot)
            ? fullCandidate : null;
    }

    private static bool IsPathUnderRoot(string candidatePath, string rootPath)
    {
        var fullRoot = Path.GetFullPath(rootPath)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var fullCandidate = Path.GetFullPath(candidatePath)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        if (string.Equals(fullCandidate, fullRoot, comparison))
        {
            return true;
        }

        var rootWithSlash = fullRoot + Path.DirectorySeparatorChar;
        return fullCandidate.StartsWith(rootWithSlash, comparison);
    }

    private static string? ResolveActionPathOrFallback(
        string actionType,
        string? path,
        string? content,
        IReadOnlyList<string>? requestedPaths = null,
        string? workspaceRoot = null
    )
    {
        var normalizedPath = string.IsNullOrWhiteSpace(workspaceRoot)
            ? CodingFallbackPolicy.NormalizeGeneratedActionPath(path)
            : NormalizeGeneratedActionPathForWorkspace(path, workspaceRoot);
        if (!string.IsNullOrWhiteSpace(normalizedPath))
        {
            return normalizedPath;
        }

        if (actionType == "write_file" || actionType == "append_file")
        {
            var requestedPath = CodingFallbackPolicy.SelectRequestedCodingPath(requestedPaths, CodingLanguagePolicy.GuessLanguageFromPath(CodingFallbackPolicy.InferFallbackPathForGeneratedCode(content), "auto"), content);
            if (!string.IsNullOrWhiteSpace(requestedPath))
            {
                return requestedPath;
            }

            return CodingFallbackPolicy.InferFallbackPathForGeneratedCode(content);
        }

        return null;
    }

    private static string NormalizeGeneratedActionPathForWorkspace(string? path, string workspaceRoot)
    {
        var normalized = CodingFallbackPolicy.NormalizeGeneratedActionPath(path);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        normalized = CodingFallbackPolicy.CollapseKnownCodingRootPrefixes(normalized);
        if (!Path.IsPathRooted(normalized))
        {
            normalized = normalized.Replace('\\', '/').Trim('/');
            return CodingFallbackPolicy.IsSafeRelativeCodingPath(normalized) ? normalized : string.Empty;
        }

        try
        {
            var fullPath = Path.GetFullPath(normalized);
            if (IsPathUnderRoot(fullPath, workspaceRoot))
            {
                return Path.GetRelativePath(workspaceRoot, fullPath).Replace('\\', '/');
            }

            return string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string ResolveWorkspacePath(string workspaceRoot, string? relativeOrAbsolutePath)
    {
        var raw = (relativeOrAbsolutePath ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            throw new InvalidOperationException("path is required");
        }

        if (Path.IsPathRooted(raw))
        {
            var fullPath = Path.GetFullPath(raw);
            if (!IsPathUnderRoot(fullPath, workspaceRoot))
            {
                throw new InvalidOperationException("workspace 밖 경로는 코딩탭 자동 작업에서 사용할 수 없습니다.");
            }

            return fullPath;
        }

        var resolved = Path.GetFullPath(Path.Combine(workspaceRoot, raw));
        if (!IsPathUnderRoot(resolved, workspaceRoot))
        {
            throw new InvalidOperationException("workspace 밖 경로는 코딩탭 자동 작업에서 사용할 수 없습니다.");
        }

        return resolved;
    }

    private static string TryBuildExplicitVerificationCommand(
        string objectiveText,
        string workspaceRoot,
        IReadOnlyCollection<string> changedFiles
    )
    {
        if (string.IsNullOrWhiteSpace(objectiveText))
        {
            return string.Empty;
        }

        foreach (Match match in ExplicitShellExecutionCommandRegex.Matches(objectiveText))
        {
            var rawCommand = (match.Groups["cmd"].Value ?? string.Empty).Trim().ToLowerInvariant();
            var normalizedPath = CodingFallbackPolicy.NormalizeRequestedCodingPath(match.Groups["path"].Value.Replace('\\', '/'));
            if (string.IsNullOrWhiteSpace(normalizedPath))
            {
                continue;
            }

            string fullPath;
            try
            {
                fullPath = ResolveWorkspacePath(workspaceRoot, normalizedPath);
            }
            catch
            {
                continue;
            }

            if (!File.Exists(fullPath))
            {
                continue;
            }

            if (changedFiles.Count > 0 && !changedFiles.Contains(fullPath, StringComparer.OrdinalIgnoreCase))
            {
                continue;
            }

            var safePath = EscapeShellArg(fullPath);
            return rawCommand switch
            {
                "node" => $"if command -v node >/dev/null 2>&1; then node {safePath}; else echo 'node 없음'; exit 1; fi",
                "python" or "python3" => $"python3 {safePath}",
                "bash" => $"if command -v bash >/dev/null 2>&1; then bash {safePath}; else echo 'bash 없음'; exit 1; fi",
                _ => string.Empty
            };
        }

        return string.Empty;
    }

    private static string TrySelectExplicitExecutionTargetPath(
        string objectiveText,
        string workspaceRoot,
        IReadOnlyCollection<string> changedFiles
    )
    {
        if (string.IsNullOrWhiteSpace(objectiveText))
        {
            return string.Empty;
        }

        foreach (Match match in ExplicitExecutionTargetRegex.Matches(objectiveText))
        {
            var normalizedPath = CodingFallbackPolicy.NormalizeRequestedCodingPath(match.Groups["path"].Value.Replace('\\', '/'));
            if (string.IsNullOrWhiteSpace(normalizedPath))
            {
                continue;
            }

            string fullPath;
            try
            {
                fullPath = ResolveWorkspacePath(workspaceRoot, normalizedPath);
            }
            catch
            {
                continue;
            }

            if (!File.Exists(fullPath))
            {
                continue;
            }

            if (changedFiles.Count > 0 && !changedFiles.Contains(fullPath, StringComparer.OrdinalIgnoreCase))
            {
                continue;
            }

            return fullPath;
        }

        return string.Empty;
    }

    private static string? SelectEntryLikeChangedFile(string normalizedLanguage, IReadOnlyCollection<string> changedFiles)
    {
        var preferredNames = normalizedLanguage switch
        {
            "javascript" => new[] { "index.js", "main.js", "app.js", "server.js", "cli.js" },
            "typescript" => new[] { "index.ts", "main.ts", "app.ts", "server.ts", "cli.ts", "main.tsx", "App.tsx" },
            "react-vite" => new[] { "main.tsx", "main.jsx", "App.tsx", "App.jsx", "index.html" },
            "python" => new[] { "main.py", "app.py", "run.py", "cli.py" },
            "java" => new[] { "Main.java", "App.java", "Run.java" },
            "go" => new[] { "main.go" },
            "rust" => new[] { "main.rs", "lib.rs" },
            "php" => new[] { "index.php", "app.php" },
            "ruby" => new[] { "app.rb", "main.rb" },
            "swift" => new[] { "main.swift" },
            "c" => new[] { "main.c", "app.c" },
            "cpp" => new[] { "main.cpp", "app.cpp" },
            "bash" => new[] { "run.sh", "main.sh" },
            _ => Array.Empty<string>()
        };

        foreach (var preferredName in preferredNames)
        {
            var matched = changedFiles.FirstOrDefault(path =>
                !string.IsNullOrWhiteSpace(path)
                && File.Exists(path)
                && string.Equals(Path.GetFileName(path), preferredName, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(matched))
            {
                return matched;
            }
        }

        return null;
    }

    private static bool ShouldPreferProgramExecutionForVerification(string objective, string normalizedLanguage, string? expectedOutput)
    {
        if (!string.IsNullOrWhiteSpace(expectedOutput))
        {
            return true;
        }

        if (IsInteractiveProgramObjective(objective, normalizedLanguage))
        {
            return false;
        }

        if (normalizedLanguage is not ("python" or "javascript" or "typescript" or "react-vite" or "go" or "rust" or "php" or "ruby" or "swift" or "bash"))
        {
            return false;
        }

        if (CodingExpectedOutputPolicy.LooksLikeStdoutVerificationRequest(objective)
            || CodingTaskSignalPolicy.LooksLikeProgramRunRequest(objective))
        {
            return true;
        }

        // 만들고 나서 한 번도 돌려 보지 않으면 "동작한다"는 근거가 없다. 예전에는 요청 문장에
        // '실행'/'출력' 같은 말이 있을 때만 실행해서, 그냥 "만들어 줘"로 끝난 요청은 컴파일만 하고
        // 끝났다. 실행 가능한 언어이고 대화형(입력 대기·GUI·게임)도 상주 서비스도 아니면 기본으로
        // 실행한다. 실행 직후 stdin 이 닫히므로 input() 을 기다리다 멈추지 않는다(EOF 로 즉시 종료).
        return !LooksLikeLongRunningServiceObjective(objective);
    }

    /// <summary>서버·데몬·감시처럼 끝나지 않는 프로그램인지. 이런 건 검증에서 직접 실행하지 않는다.</summary>
    private static bool LooksLikeLongRunningServiceObjective(string objective)
    {
        var text = (objective ?? string.Empty).ToLowerInvariant();
        return ContainsAny(
            text,
            "서버",
            "server",
            "daemon",
            "데몬",
            "상주",
            "watch",
            "감시",
            "실시간",
            "webhook",
            "웹훅",
            "listen",
            "포트를 열"
        );
    }

    private static IReadOnlyList<string> CollectWorkspaceMaterializedFiles(string workspaceRoot)
    {
        try
        {
            if (!Directory.Exists(workspaceRoot))
            {
                return Array.Empty<string>();
            }

            return Directory.EnumerateFiles(workspaceRoot, "*", SearchOption.AllDirectories)
                .Where(path => !string.IsNullOrWhiteSpace(path))
                .Where(path => !CodingWorkspaceFilePolicy.ShouldSkip(Path.GetRelativePath(workspaceRoot, path)))
                .Select(Path.GetFullPath)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static int MergeWorkspaceMaterializedFiles(string workspaceRoot, ISet<string> changedFiles)
    {
        if (changedFiles == null)
        {
            return 0;
        }

        var merged = 0;
        foreach (var path in CollectWorkspaceMaterializedFiles(workspaceRoot))
        {
            if (changedFiles.Add(path))
            {
                merged++;
            }
        }

        return merged;
    }

    // 명령 내 모든 python/python3 호출을 .venv/bin/python 으로 바꾼다(경로로 쓰인 .../python 제외).
    // 모델은 `python3 test.py && python3 main.py` 처럼 체이닝하므로 선두 토큰만 바꾸면 두 번째
    // 호출이 시스템 파이썬으로 가 설치한 패키지를 못 찾는다(pygame 등 ModuleNotFound).
    private static readonly Regex WorkspacePythonInvocationRegex = new(
        @"(?<![\w./\\-])python3?(?=\s)",
        RegexOptions.Compiled
    );

    private static string RewritePythonInterpreterToWorkspaceVenv(string command, string workDir)
    {
        if (OperatingSystem.IsWindows() || string.IsNullOrWhiteSpace(command))
        {
            return command;
        }

        // 이미 .venv / __omni_py 를 참조하거나 venv 생성(`-m venv`) 명령이면 건드리지 않는다.
        if (command.Contains(".venv", StringComparison.Ordinal)
            || command.Contains("__omni_py", StringComparison.Ordinal)
            || command.Contains("-m venv", StringComparison.Ordinal))
        {
            return command;
        }

        var venvPython = Path.Combine(workDir ?? string.Empty, ".venv", "bin", "python");
        if (string.IsNullOrWhiteSpace(workDir) || !File.Exists(venvPython))
        {
            return command;
        }

        return WorkspacePythonInvocationRegex.Replace(command, ".venv/bin/python");
    }

    private static string NormalizePythonCommandForShell(string command)
    {
        var raw = command ?? string.Empty;
        var trimmed = raw.TrimStart();
        if (OperatingSystem.IsWindows() || string.IsNullOrWhiteSpace(trimmed))
        {
            return raw;
        }

        if (!trimmed.StartsWith("python", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("python3", StringComparison.OrdinalIgnoreCase))
        {
            return raw;
        }

        if (trimmed.Length > "python".Length)
        {
            var next = trimmed["python".Length];
            if (!char.IsWhiteSpace(next))
            {
                return raw;
            }
        }

        var prefixLength = raw.Length - trimmed.Length;
        var suffix = trimmed.Length > "python".Length ? trimmed["python".Length..] : string.Empty;
        return new string(' ', prefixLength) + "python3" + suffix;
    }
}

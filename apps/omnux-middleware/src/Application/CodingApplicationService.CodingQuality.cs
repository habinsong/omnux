using System.Text;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class CodingApplicationService
{
    private sealed record CodingQualityGateResult(
        bool Ok,
        int Score,
        string Summary,
        IReadOnlyList<string> Passed,
        IReadOnlyList<string> Failed
    );

    private static CodingQualityGateResult EvaluateCodingQualityGate(
        string objective,
        string language,
        string workspaceRoot,
        IReadOnlyCollection<string> changedFiles,
        CodeExecutionResult execution
    )
    {
        var normalizedLanguage = CodingLanguagePolicy.NormalizeLanguageForCode(language);
        var objectiveText = CodingLanguagePolicy.ExtractLatestCodingRequestText(objective ?? string.Empty);
        var files = (changedFiles ?? Array.Empty<string>())
            .Where(path => !string.IsNullOrWhiteSpace(path) && File.Exists(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var passed = new List<string>();
        var failed = new List<string>();

        if (files.Length == 0)
        {
            failed.Add("생성/수정 파일이 없습니다.");
        }
        else
        {
            passed.Add($"생성/수정 파일 {files.Length}개 확인");
        }

        var sourceByFile = ReadCodingSources(files);
        var mergedSource = string.Join("\n", sourceByFile.Values).ToLowerInvariant();
        if (LooksLikeDummyOrPlaceholderImplementation(sourceByFile))
        {
            failed.Add("TODO/placeholder/미구현 중심 코드가 남아 있습니다.");
        }
        else if (sourceByFile.Count > 0)
        {
            passed.Add("더미/TODO 중심 구현 아님");
        }

        var projectProfile = ResolveCodingProjectProfile(objectiveText, normalizedLanguage);
        var requiresTestEvidence = CodingTestEvidencePolicy.ShouldRequireTestEvidence(
            objectiveText,
            normalizedLanguage,
            files,
            projectProfile.PrefersMultiFile
        );
        if (requiresTestEvidence)
        {
            if (CodingTestEvidencePolicy.HasTestEvidence(files, execution.Command))
            {
                passed.Add("테스트 증거 확인");
            }
            else if (string.Equals(execution.Status, "ok", StringComparison.OrdinalIgnoreCase))
            {
                // 프로그램이 실제로 성공 실행됐으면(exit=0) 단위 테스트 부재로 전체를 실패시키지
                // 않는다. 게임/앱은 "실행됨"이 곧 검증이다. 테스트는 권장 사항으로만 표기한다.
                passed.Add("실행 검증 통과(단위 테스트는 권장)");
            }
            else
            {
                failed.Add("프로젝트성 코드 변경인데 테스트 파일 또는 테스트 실행 명령 증거가 없습니다.");
            }
        }

        var requestedPaths = CodingFallbackPolicy.ExtractRequestedCodingPaths(objectiveText, normalizedLanguage);
        foreach (var requestedPath in requestedPaths.Take(12))
        {
            var full = ResolveWorkspacePath(workspaceRoot, requestedPath);
            if (File.Exists(full))
            {
                passed.Add($"요청 파일 존재: {requestedPath}");
            }
            else
            {
                failed.Add($"요청 파일 누락: {requestedPath}");
            }
        }

        var gameLikeObjective = IsGameLikeCodingTask(objectiveText, normalizedLanguage);
        Console.Error.WriteLine(
            $"[quality-gate] 적용 기준: game={gameLikeObjective} "
            + $"frontend={IsFrontendLikeCodingTask(objectiveText, normalizedLanguage)} "
            + $"browser={LooksLikeBrowserAppObjective(objectiveText)} "
            + $"cli={LooksLikeCliObjective(objectiveText)} language={normalizedLanguage}"
        );
        if (gameLikeObjective || IsInteractiveProgramObjective(objectiveText, normalizedLanguage))
        {
            EvaluateGameQuality(objectiveText, normalizedLanguage, files, mergedSource, passed, failed, gameLikeObjective);
        }

        if (IsFrontendLikeCodingTask(objectiveText, normalizedLanguage) || LooksLikeBrowserAppObjective(objectiveText))
        {
            EvaluateFrontendQuality(workspaceRoot, files, mergedSource, sourceByFile, passed, failed);
        }

        if (LooksLikeCliObjective(objectiveText))
        {
            EvaluateCliQuality(normalizedLanguage, mergedSource, passed, failed);
        }

        EvaluateLanguageProjectQuality(normalizedLanguage, workspaceRoot, files, mergedSource, objectiveText, passed, failed);

        if (string.Equals(execution.Status, "ok", StringComparison.OrdinalIgnoreCase))
        {
            passed.Add("최종 실행/검증 exit=0");
        }
        else if (!string.Equals(execution.Status, "skipped", StringComparison.OrdinalIgnoreCase))
        {
            failed.Add($"최종 실행 상태가 성공이 아닙니다: {execution.Status}");
        }

        var score = Math.Max(0, passed.Count * 10 - failed.Count * 25);
        var ok = failed.Count == 0;
        var summary = BuildCodingQualityGateSummary(ok, score, passed, failed);
        return new CodingQualityGateResult(ok, score, summary, passed, failed);
    }

    private static CodeExecutionResult ApplyCodingQualityGateToExecution(
        string objective,
        string language,
        string workspaceRoot,
        IReadOnlyCollection<string> changedFiles,
        CodeExecutionResult execution
    )
    {
        if (!string.Equals(execution.Status, "ok", StringComparison.OrdinalIgnoreCase))
        {
            return execution;
        }

        var gate = EvaluateCodingQualityGate(objective, language, workspaceRoot, changedFiles, execution);
        execution = execution with { ProgramStdOut = execution.ProgramStdOut ?? execution.StdOut, ProgramStdErr = execution.ProgramStdErr ?? execution.StdErr };
        if (gate.Ok)
        {
            var stdout = AppendQualityNote(execution.StdOut, gate.Summary);
            return execution with { StdOut = stdout };
        }

        var stderr = AppendQualityNote(execution.StdErr, gate.Summary);
        return execution with
        {
            ExitCode = execution.ExitCode == 0 ? 1 : execution.ExitCode,
            StdErr = stderr,
            Status = "quality_failed"
        };
    }

    private static Dictionary<string, string> ReadCodingSources(IEnumerable<string> files)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var file in files ?? Array.Empty<string>())
        {
            try
            {
                var extension = Path.GetExtension(file);
                if (string.IsNullOrWhiteSpace(extension)
                    || !new[] { ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".cs", ".java", ".kt", ".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".sh", ".json", ".xml", ".toml", ".gradle" }
                        .Contains(extension, StringComparer.OrdinalIgnoreCase))
                {
                    continue;
                }

                result[file] = File.ReadAllText(file);
            }
            catch
            {
            }
        }

        return result;
    }

    private static bool LooksLikeDummyOrPlaceholderImplementation(IReadOnlyDictionary<string, string> sources)
    {
        var text = string.Join("\n", sources.Values);
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        // 주의: 파이썬의 관용적 `pass`(빈 예외 클래스/추상 메서드/빈 except)는 placeholder 가
        // 아니다. 과거 `pass\s*(#|$)` 패턴이 정상 코드를 더미로 오탐해 quality_failed→repair
        // 재시도로 토큰을 낭비시켰다. 실제 미구현이면 옆 주석의 TODO/미구현이 이미 잡힌다.
        var dummyMatches = Regex.Matches(
            text,
            @"\b(TODO|FIXME|placeholder|not implemented|미구현|NotImplementedException|throw\s+new\s+NotImplementedException)\b",
            RegexOptions.IgnoreCase | RegexOptions.Multiline
        ).Count;
        var meaningfulLines = text
            .Split('\n')
            .Select(line => line.Trim())
            .Count(line => line.Length > 0 && !line.StartsWith("//", StringComparison.Ordinal) && !line.StartsWith("#", StringComparison.Ordinal));
        return dummyMatches >= 2 || (dummyMatches >= 1 && meaningfulLines < 25);
    }

    private static void EvaluateGameQuality(
        string objectiveText,
        string language,
        IReadOnlyList<string> files,
        string mergedSource,
        List<string> passed,
        List<string> failed,
        bool gameLikeObjective
    )
    {
        if (language == "python")
        {
            if (LooksLikeInteractivePythonGameSource(files))
            {
                passed.Add("Python 입력/렌더링 루프 흔적 확인");
            }
            else if (gameLikeObjective)
            {
                failed.Add("Python 게임에 실제 입력 처리/렌더링 루프가 없습니다.");
            }
        }

        // 이 검사는 게임 요청에만 쓴다. 게임이 아닌 대화형 앱(메모장 등)까지 걸면 억울하게 실패한다.
        // 그리고 tkinter/curses 앱은 `while` 루프가 아니라 mainloop()·after()·getch() 로 돈다.
        // 예전에는 그걸 못 알아보고, 헤드리스 점검 출력을 print 했다는 이유로 정상 앱을
        // "print-only 시뮬레이션"으로 실패시켰다(실측: tkinter 메모 앱 quality_failed).
        if (gameLikeObjective
            && mergedSource.Contains("print(")
            && !Regex.IsMatch(
                mergedSource,
                @"while\s+[^:\n]+:|requestanimationframe|pygame\.event\.get|addEventListener"
                + @"|mainloop\s*\(|\.after\s*\(|getch\s*\(|nodelay\s*\(|curses\.wrapper|bind(?:_all)?\s*\(",
                RegexOptions.IgnoreCase
            ))
        {
            failed.Add("게임 요청이 print-only 시뮬레이션에 가깝습니다.");
        }

        if (ContainsAny(objectiveText.ToLowerInvariant(), "tetris", "테트리스"))
        {
            var checks = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["10x20 board"] = @"cols\s*=\s*10|rows\s*=\s*20|10\s*,\s*20|board",
                ["piece shapes"] = @"shape|tetromino|piece|block",
                ["rotation"] = @"rotat",
                ["collision"] = @"collid|collision|valid_position|check_",
                ["line clear"] = @"line.*clear|clear.*line|remove.*line",
                ["score"] = @"score",
                ["level"] = @"level",
                ["game over"] = @"game_over|game over"
            };
            foreach (var (label, pattern) in checks)
            {
                if (Regex.IsMatch(mergedSource, pattern, RegexOptions.IgnoreCase))
                {
                    passed.Add($"tetris requirement ok: {label}");
                }
                else
                {
                    failed.Add($"tetris requirement missing: {label}");
                }
            }
        }
    }

    private static void EvaluateFrontendQuality(
        string workspaceRoot,
        IReadOnlyList<string> files,
        string mergedSource,
        IReadOnlyDictionary<string, string> sourceByFile,
        List<string> passed,
        List<string> failed
    )
    {
        var hasIndex = files.Any(path => Path.GetFileName(path).Equals("index.html", StringComparison.OrdinalIgnoreCase))
            || File.Exists(Path.Combine(workspaceRoot, "index.html"));
        var hasPackageJson = files.Any(path => Path.GetFileName(path).Equals("package.json", StringComparison.OrdinalIgnoreCase))
            || File.Exists(Path.Combine(workspaceRoot, "package.json"));
        if (hasIndex || hasPackageJson)
        {
            passed.Add("브라우저 앱 엔트리 확인");
        }
        else
        {
            failed.Add("브라우저 앱 엔트리(index.html/package.json)가 없습니다.");
        }

        if (Regex.IsMatch(mergedSource, @"document\.|createRoot|ReactDOM|requestAnimationFrame|addEventListener|<body|<main|<div", RegexOptions.IgnoreCase))
        {
            passed.Add("실제 DOM/렌더링 코드 확인");
        }
        else
        {
            failed.Add("실제 DOM 렌더링 코드가 부족합니다.");
        }

        // 프로젝트에 .sh 파일이 같이 들어 있는 것은 정상이다. 합쳐 놓은 본문을 보면 그 내용까지
        // 걸려서, 웹 UI 와 실행 스크립트를 함께 만든 멀쩡한 결과물이 실패했다(실측).
        var webSource = string.Join(
            "\n",
            sourceByFile
                .Where(entry => IsWebSourceFile(entry.Key))
                .Select(entry => entry.Value)
        );
        if (webSource.Contains("cat > ", StringComparison.Ordinal)
            || webSource.Contains("#!/usr/bin/env bash", StringComparison.Ordinal))
        {
            failed.Add("HTML/CSS/JS 파일에 셸 스크립트 생성 코드가 섞여 있습니다.");
        }
    }

    private static bool IsWebSourceFile(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext is ".html" or ".htm" or ".css" or ".js" or ".mjs" or ".cjs" or ".jsx" or ".ts" or ".tsx";
    }

    private static void EvaluateCliQuality(string language, string mergedSource, List<string> passed, List<string> failed)
    {
        var hasInputHandling = language switch
        {
            "python" => Regex.IsMatch(mergedSource, @"sys\.argv|argparse|input\s*\(|sys\.stdin", RegexOptions.IgnoreCase),
            "javascript" => Regex.IsMatch(mergedSource, @"process\.argv|readline|process\.stdin", RegexOptions.IgnoreCase),
            "bash" => Regex.IsMatch(mergedSource, @"\$1|\$@|getopts|read\s+", RegexOptions.IgnoreCase),
            "java" => Regex.IsMatch(mergedSource, @"String\[\]\s+args|Scanner|System\.in", RegexOptions.IgnoreCase),
            "csharp" => Regex.IsMatch(mergedSource, @"string\[\]\s+args|Console\.ReadLine", RegexOptions.IgnoreCase),
            "c" or "cpp" => Regex.IsMatch(mergedSource, @"argc|argv|scanf|getline|std::cin", RegexOptions.IgnoreCase),
            _ => true
        };
        if (hasInputHandling)
        {
            passed.Add("CLI 입력/인자 처리 흔적 확인");
        }
        else
        {
            failed.Add("CLI 요청인데 인자/stdin 처리 코드가 부족합니다.");
        }
    }

    private static void EvaluateLanguageProjectQuality(
        string language,
        string workspaceRoot,
        IReadOnlyList<string> files,
        string mergedSource,
        string objectiveText,
        List<string> passed,
        List<string> failed
    )
    {
        switch (language)
        {
            case "csharp":
                if (files.Any(path => path.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase)) || File.Exists(Path.Combine(workspaceRoot, "App.csproj")))
                {
                    passed.Add(".NET 프로젝트 파일 확인");
                }
                else if (CodingTaskSignalPolicy.LooksLikeCsharpProjectRequest(objectiveText))
                {
                    failed.Add("C# 프로젝트 요청인데 .csproj가 없습니다.");
                }
                break;
            case "java":
                if (Regex.IsMatch(mergedSource, @"public\s+static\s+void\s+main|application\s*\{", RegexOptions.IgnoreCase))
                {
                    passed.Add("Java 실행 엔트리 확인");
                }
                else
                {
                    failed.Add("Java 실행 엔트리(main/run)가 없습니다.");
                }
                break;
            case "c":
            case "cpp":
                if (Regex.IsMatch(mergedSource, @"\bint\s+main\s*\(", RegexOptions.IgnoreCase))
                {
                    passed.Add("네이티브 실행 엔트리 확인");
                }
                else
                {
                    failed.Add("C/C++ 실행 엔트리 main이 없습니다.");
                }
                break;
        }
    }

    private static bool LooksLikeBrowserAppObjective(string objectiveText)
    {
        return CodingTaskSignalPolicy.LooksLikeBrowserApp(objectiveText);
    }

    private static bool LooksLikeCliObjective(string objectiveText)
    {
        return CodingTaskSignalPolicy.LooksLikeCli(objectiveText);
    }

    private static string BuildCodingQualityGateSummary(bool ok, int score, IReadOnlyList<string> passed, IReadOnlyList<string> failed)
    {
        var builder = new StringBuilder();
        builder.AppendLine(ok ? $"[quality-gate] ok score={score}" : $"[quality-gate] failed score={score}");
        if (passed.Count > 0)
        {
            builder.AppendLine("충족:");
            foreach (var item in passed.Take(10))
            {
                builder.AppendLine($"- {item}");
            }
        }

        if (failed.Count > 0)
        {
            builder.AppendLine("미충족:");
            foreach (var item in failed.Take(12))
            {
                builder.AppendLine($"- {item}");
            }
        }

        return builder.ToString().Trim();
    }

    private static string AppendQualityNote(string original, string note)
    {
        if (string.IsNullOrWhiteSpace(note))
        {
            return original ?? string.Empty;
        }

        return string.IsNullOrWhiteSpace(original)
            ? note
            : $"{original.TrimEnd()}\n\n{note}";
    }
}

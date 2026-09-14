using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class CodingApplicationService
{
    private async Task<ShellRunResult> RunWorkspaceCommandWithAutoInstallAsync(
        string command,
        string workDir,
        CancellationToken cancellationToken,
        string? standardInput = null
    )
    {
        if (!IsDynamicCodeExecutionEnabled())
        {
            return new ShellRunResult(126, string.Empty, BuildDynamicCodeDisabledMessage(), false);
        }

        var missingTools = await FindMissingToolchainExecutablesAsync(command, workDir, cancellationToken);
        if (missingTools.Count > 0)
        {
            // 없는 도구로 만든 명령은 모델이 우회 분기를 넣어 exit 0 으로 끝내기도 한다.
            // 그대로 두면 "실행 완료"로 보고되므로 여기서 실패로 끊는다.
            return new ShellRunResult(127, string.Empty, CodingToolchainPolicy.BuildMissingToolchainMessage(missingTools), false);
        }

        var installLogs = new List<string>();
        var installErrors = new List<string>();

        if (_execution.EnableAutoInstall)
        {
            await EnsureWorkspaceDependenciesAsync(command, workDir, installLogs, installErrors, cancellationToken);
        }
        var shell = await RunWorkspaceCommandAsync(command, workDir, cancellationToken, standardInput);

        if (_execution.EnableAutoInstall && !shell.TimedOut && shell.ExitCode != 0)
        {
            var retried = await TryInstallMissingDependencyFromErrorAsync(command, workDir, shell.StdErr, installLogs, installErrors, cancellationToken);
            if (retried)
            {
                shell = await RunWorkspaceCommandAsync(command, workDir, cancellationToken, standardInput);
            }
        }

        if (installLogs.Count == 0 && installErrors.Count == 0)
        {
            return shell;
        }

        var mergedStdOut = MergeInstallLogs("[auto-install]", installLogs, shell.StdOut);
        var mergedStdErr = MergeInstallLogs("[auto-install]", installErrors, shell.StdErr);
        return new ShellRunResult(shell.ExitCode, mergedStdOut, mergedStdErr, shell.TimedOut);
    }

    /// <summary>명령이 요구하는 실행 파일 중 이 기계에 없는 것을 돌려준다.</summary>
    private async Task<IReadOnlyList<string>> FindMissingToolchainExecutablesAsync(
        string command,
        string workDir,
        CancellationToken cancellationToken
    )
    {
        var required = CodingToolchainPolicy.DetectRequiredExecutables(command);
        if (required.Count == 0 || OperatingSystem.IsWindows())
        {
            return Array.Empty<string>();
        }

        var missing = new List<string>();
        foreach (var executable in required)
        {
            var probe = await RunWorkspaceCommandAsync($"command -v {EscapeShellArg(executable)} >/dev/null 2>&1", workDir, cancellationToken);
            if (probe.ExitCode != 0)
            {
                missing.Add(executable);
            }
        }

        return missing;
    }

    private async Task EnsureWorkspaceDependenciesAsync(
        string command,
        string workDir,
        List<string> logs,
        List<string> errors,
        CancellationToken cancellationToken
    )
    {
        try
        {
            if (LooksLikePythonCommand(command))
            {
                if (IsSyntaxOnlyPythonVerificationCommand(command))
                {
                    return;
                }

                var pythonBaseDir = ResolveDependencyBaseDirectory(command, workDir, ".py");
                var requirementsPath = FindRequirementsFile(pythonBaseDir, workDir);
                var pythonEnvironmentReady = await EnsureWorkspacePythonEnvironmentAsync(workDir, logs, errors, cancellationToken);

                if (!pythonEnvironmentReady)
                {
                    errors.Add("Python 의존성 자동 설치 건너뜀: workspace .venv 준비 실패");
                }

                if (pythonEnvironmentReady && !string.IsNullOrWhiteSpace(requirementsPath) && File.Exists(requirementsPath))
                {
                    // 최신 파이썬(3.13/3.14)에서 source 빌드가 실패하는 pygame 을 드롭인 대체
                    // pygame-ce 로 바꿔 빌드 실패/시간낭비/모델 혼선을 막는다.
                    SanitizeRequirementsForCompatibility(requirementsPath, logs);
                    var pipCommand = BuildPipRequirementsInstallCommand(requirementsPath);
                    var installResult = await RunWorkspaceCommandAsync(pipCommand, workDir, cancellationToken);
                    AppendInstallOutcome("requirements.txt 설치", pipCommand, installResult, logs, errors);
                }

                var pythonSourceFiles = EnumeratePythonDependencySourceFiles(command, pythonBaseDir, workDir).ToArray();
                if (pythonSourceFiles.Length > 0)
                {
                    var packages = CollectPythonThirdPartyPackagesFromSources(pythonSourceFiles, pythonBaseDir, workDir);
                    if (pythonEnvironmentReady && packages.Count > 0)
                    {
                        var pipCommand = BuildPipPackageInstallCommand(packages);
                        var installResult = await RunWorkspaceCommandAsync(pipCommand, workDir, cancellationToken);
                        AppendInstallOutcome(
                            "Python import 패키지 설치(.venv)",
                            pipCommand,
                            installResult,
                            logs,
                            errors
                        );
                    }
                }
            }

            if (LooksLikeNodeCommand(command))
            {
                var nodeBaseDir = ResolveDependencyBaseDirectory(command, workDir, ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx");
                var packageJsonPath = Path.Combine(nodeBaseDir, "package.json");
                if (File.Exists(packageJsonPath))
                {
                    var nodeModulesPath = Path.Combine(nodeBaseDir, "node_modules");
                    if (!Directory.Exists(nodeModulesPath))
                    {
                        var npmInstallCommand = "npm install --no-fund --no-audit";
                        var installResult = await RunWorkspaceCommandAsync(npmInstallCommand, nodeBaseDir, cancellationToken);
                        AppendInstallOutcome("package.json 의존성 설치", npmInstallCommand, installResult, logs, errors);
                    }
                }
                else if (HasNodeWorkspaceSignals(command, workDir))
                {
                    var initCommand = "npm init -y >/dev/null";
                    var initResult = await RunWorkspaceCommandAsync(initCommand, nodeBaseDir, cancellationToken);
                    AppendInstallOutcome("Node 임시 package.json 생성", initCommand, initResult, logs, errors);
                }

                var nodeScriptPath = TryExtractScriptPath(command, workDir, ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx");
                if (!string.IsNullOrWhiteSpace(nodeScriptPath) && File.Exists(nodeScriptPath))
                {
                    var packages = ExtractNodePackagesFromSource(nodeScriptPath);
                    if (packages.Count > 0)
                    {
                        var npmCommand = $"npm install --no-save --no-fund --no-audit {string.Join(" ", packages.Select(EscapeShellArg))}";
                        var installResult = await RunWorkspaceCommandAsync(npmCommand, nodeBaseDir, cancellationToken);
                        AppendInstallOutcome("Node import 패키지 설치", npmCommand, installResult, logs, errors);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            errors.Add($"의존성 자동 설치 파이프라인 내부 오류: {ex.Message}");
        }
    }

    private static IEnumerable<string> EnumeratePythonDependencySourceFiles(string command, string primaryDir, string workDir)
    {
        var scriptPath = TryExtractScriptPath(command, workDir, ".py");
        if (!string.IsNullOrWhiteSpace(scriptPath) && File.Exists(scriptPath))
        {
            yield return scriptPath;
        }

        var roots = new[] { primaryDir, workDir }
            .Where(path => !string.IsNullOrWhiteSpace(path) && Directory.Exists(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        foreach (var root in roots)
        {
            IEnumerable<string> files;
            try
            {
                files = Directory.EnumerateFiles(root, "*.py", SearchOption.AllDirectories)
                    .Where(path => !path.Contains($"{Path.DirectorySeparatorChar}.venv{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)
                                   && !path.Contains($"{Path.DirectorySeparatorChar}__pycache__{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase))
                    .Take(80)
                    .ToArray();
            }
            catch
            {
                continue;
            }

            foreach (var file in files)
            {
                yield return file;
            }
        }
    }

    private static bool IsSyntaxOnlyPythonVerificationCommand(string command)
    {
        var normalized = Regex.Replace((command ?? string.Empty).Trim(), @"\s+", " ");
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        return normalized.Contains("python -m py_compile", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("python3 -m py_compile", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("python -m compileall", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("python3 -m compileall", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<bool> TryInstallMissingDependencyFromErrorAsync(
        string command,
        string workDir,
        string stdErr,
        List<string> logs,
        List<string> errors,
        CancellationToken cancellationToken
    )
    {
        try
        {
            if (LooksLikePythonCommand(command))
            {
                var missingModule = ExtractPythonMissingModule(stdErr);
                if (IsPythonSystemModule(missingModule))
                {
                    errors.Add($"Python 시스템 모듈 자동 설치 차단: host package manager 설치 금지 ({missingModule})");
                }

                // ModuleNotFoundError 의 이름이 프로젝트 안의 폴더·파일이면 외부 패키지가 아니다.
                // 그걸 pip 로 설치하려 들면 `pip install src` 처럼 엉뚱한 빌드를 돌리다 실패해 작업이
                // 통째로 깨진다(실측: 폴더로 나눈 플랫포머에서 'src' 설치 시도로 exit=1).
                // 이때 필요한 건 설치가 아니라 실행 경로(PYTHONPATH·엔트리) 교정이다.
                if (!string.IsNullOrWhiteSpace(missingModule)
                    && IsLocalPythonModule(missingModule, workDir, new[] { workDir }))
                {
                    errors.Add($"Python 자동 설치 건너뜀: '{missingModule}' 은 프로젝트 안의 모듈입니다(설치 대상 아님)");
                    return false;
                }

                var pythonPackage = ResolvePythonPackageName(missingModule);
                if (!string.IsNullOrWhiteSpace(pythonPackage))
                {
                    if (!await EnsureWorkspacePythonEnvironmentAsync(workDir, logs, errors, cancellationToken))
                    {
                        return false;
                    }

                    var pipCommand = BuildPipPackageInstallCommand(new[] { pythonPackage });
                    var installResult = await RunWorkspaceCommandAsync(pipCommand, workDir, cancellationToken);
                    AppendInstallOutcome($"Python 누락 모듈 설치({pythonPackage})", pipCommand, installResult, logs, errors);
                    if (installResult.ExitCode == 0)
                    {
                        return true;
                    }
                }
            }

            if (LooksLikeNodeCommand(command))
            {
                var missingSpecifier = ExtractNodeMissingModule(stdErr);
                var nodePackage = ResolveNodePackageName(missingSpecifier);
                if (!string.IsNullOrWhiteSpace(nodePackage))
                {
                    var nodeBaseDir = ResolveDependencyBaseDirectory(command, workDir, ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx");
                    var npmCommand = $"npm install --no-save --no-fund --no-audit {EscapeShellArg(nodePackage)}";
                    var installResult = await RunWorkspaceCommandAsync(npmCommand, nodeBaseDir, cancellationToken);
                    AppendInstallOutcome($"Node 누락 모듈 설치({nodePackage})", npmCommand, installResult, logs, errors);
                    if (installResult.ExitCode == 0)
                    {
                        return true;
                    }
                }
            }

            var missingProgram = ExtractMissingProgram(stdErr);
            if (!string.IsNullOrWhiteSpace(missingProgram))
            {
                var installedProgram = await TryInstallMissingProgramAsync(command, workDir, missingProgram, logs, errors, cancellationToken);
                if (installedProgram)
                {
                    return true;
                }

                errors.Add($"프로그램 자동 설치 차단: workspace-local Node/Python CLI로 해소할 수 없음 ({missingProgram})");
            }
        }
        catch (Exception ex)
        {
            errors.Add($"누락 의존성 자동 설치 오류: {ex.Message}");
        }

        return false;
    }

    private static string SafeReadAllText(string path)
    {
        try
        {
            return File.ReadAllText(path);
        }
        catch
        {
            return string.Empty;
        }
    }

    private async Task<bool> TryInstallMissingProgramAsync(
        string command,
        string workDir,
        string program,
        List<string> logs,
        List<string> errors,
        CancellationToken cancellationToken
    )
    {
        var safeProgram = SanitizeProgramName(program);
        if (string.IsNullOrWhiteSpace(safeProgram))
        {
            return false;
        }

        if (await TryInstallRuntimeToolchainAsync(safeProgram, workDir, logs, errors, cancellationToken))
        {
            return true;
        }

        if (await TryInstallNodeCliPackageAsync(command, workDir, safeProgram, logs, errors, cancellationToken))
        {
            return true;
        }

        if (await TryInstallPythonCliPackageAsync(command, workDir, safeProgram, logs, errors, cancellationToken))
        {
            return true;
        }

        return false;
    }

    private static Task<bool> TryInstallRuntimeToolchainAsync(
        string program,
        string workDir,
        List<string> logs,
        List<string> errors,
        CancellationToken cancellationToken
    )
    {
        var safeProgram = SanitizeProgramName(program);
        if (string.IsNullOrWhiteSpace(safeProgram))
        {
            return Task.FromResult(false);
        }

        if (IsNodeRuntimeProgram(safeProgram))
        {
            errors.Add($"Node 런타임 자동 설치 차단: host package manager 설치 금지 ({safeProgram})");
            return Task.FromResult(false);
        }

        if (IsPythonRuntimeProgram(safeProgram))
        {
            errors.Add($"Python 런타임 자동 설치 차단: host package manager 설치 금지 ({safeProgram})");
            return Task.FromResult(false);
        }

        return Task.FromResult(false);
    }

    private async Task<bool> TryInstallNodeCliPackageAsync(
        string command,
        string workDir,
        string program,
        List<string> logs,
        List<string> errors,
        CancellationToken cancellationToken
    )
    {
        var nodePackage = ResolveNodeCliPackageName(program);
        if (string.IsNullOrWhiteSpace(nodePackage)
            || (!LooksLikeNodeCommand(command) && !HasNodeWorkspaceSignals(command, workDir)))
        {
            return false;
        }

        var nodeBaseDir = ResolveDependencyBaseDirectory(command, workDir, ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx");
        if (!await EnsureNodeToolchainAsync(nodeBaseDir, logs, errors, cancellationToken))
        {
            return false;
        }

        var packageJsonPath = Path.Combine(nodeBaseDir, "package.json");
        if (File.Exists(packageJsonPath))
        {
            var npmInstallCommand = "npm install --no-fund --no-audit";
            var packageInstallResult = await RunWorkspaceCommandAsync(npmInstallCommand, nodeBaseDir, cancellationToken);
            AppendInstallOutcome("package.json 의존성 설치", npmInstallCommand, packageInstallResult, logs, errors);
            if (packageInstallResult.ExitCode == 0 && File.Exists(Path.Combine(nodeBaseDir, "node_modules", ".bin", program)))
            {
                return true;
            }
        }

        var npmCommand = $"npm install --no-save --no-fund --no-audit {EscapeShellArg(nodePackage)}";
        var installResult = await RunWorkspaceCommandAsync(npmCommand, nodeBaseDir, cancellationToken);
        AppendInstallOutcome($"Node CLI 패키지 설치({nodePackage})", npmCommand, installResult, logs, errors);
        return installResult.ExitCode == 0;
    }

    private async Task<bool> TryInstallPythonCliPackageAsync(
        string command,
        string workDir,
        string program,
        List<string> logs,
        List<string> errors,
        CancellationToken cancellationToken
    )
    {
        var pythonPackage = ResolvePythonCliPackageName(program);
        if (string.IsNullOrWhiteSpace(pythonPackage)
            || (!LooksLikePythonCommand(command) && !HasPythonWorkspaceSignals(command, workDir)))
        {
            return false;
        }

        if (!await EnsurePythonToolchainAsync(workDir, logs, errors, cancellationToken))
        {
            return false;
        }

        if (!await EnsureWorkspacePythonEnvironmentAsync(workDir, logs, errors, cancellationToken))
        {
            return false;
        }

        var pipCommand = BuildPipPackageInstallCommand(new[] { pythonPackage });
        var installResult = await RunWorkspaceCommandAsync(pipCommand, workDir, cancellationToken);
        AppendInstallOutcome($"Python CLI 패키지 설치({pythonPackage})", pipCommand, installResult, logs, errors);
        return installResult.ExitCode == 0;
    }

    private async Task<bool> EnsureNodeToolchainAsync(
        string workDir,
        List<string> logs,
        List<string> errors,
        CancellationToken cancellationToken
    )
    {
        var checkResult = await RunWorkspaceCommandAsync("command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1", workDir, cancellationToken);
        if (checkResult.ExitCode == 0)
        {
            return true;
        }

        errors.Add("Node toolchain 자동 설치 차단: node/npm 없음, host package manager 설치 금지");
        return false;
    }

    private async Task<bool> EnsurePythonToolchainAsync(
        string workDir,
        List<string> logs,
        List<string> errors,
        CancellationToken cancellationToken
    )
    {
        // PYTHONSAFEPATH 를 켜서 작업 폴더의 pip.py 가 표준 pip 모듈을 가리지 못하게 한다.
        // 모델이 만든 pip.py 가 대신 실행돼 검사 자체가 엉뚱하게 실패한 적이 있다(실측 exit=120).
        // -P 플래그 대신 환경변수를 쓰는 이유: 3.10 이하는 이 변수를 조용히 무시하지만,
        // 모르는 플래그는 오류로 죽어서 멀쩡한 환경을 고장으로 오판하게 된다.
        var checkCommand = OperatingSystem.IsWindows()
            ? "set \"PYTHONSAFEPATH=1\" && python --version >NUL 2>NUL && python -m pip --version >NUL 2>NUL"
            : "PYTHONSAFEPATH=1 command -v python3 >/dev/null 2>&1 && PYTHONSAFEPATH=1 python3 -m pip --version >/dev/null 2>&1";
        var checkResult = await RunWorkspaceCommandAsync(checkCommand, workDir, cancellationToken);
        if (checkResult.ExitCode == 0)
        {
            return true;
        }

        // 실패 원인을 단정하지 않는다. 디스크가 꽉 차서 venv 를 못 만든 경우에도 이 자리로 오는데,
        // "python/pip 없음"이라고 적으면 사용자가 멀쩡한 python 을 설치하러 간다(실측:
        // tmpfs 가 가득 차 Disk quota exceeded 였는데 같은 문구가 나갔다).
        var checkDetail = TrimForOutput(checkResult.StdErr, 200);
        errors.Add(
            checkDetail.Length == 0
                ? "Python 실행 환경 확인 실패: python3/pip 확인 명령이 실패했습니다(자동 설치는 하지 않습니다)."
                : $"Python 실행 환경 확인 실패: {checkDetail}"
        );
        return false;
    }

    private async Task<bool> EnsureWorkspacePythonEnvironmentAsync(
        string workDir,
        List<string> logs,
        List<string> errors,
        CancellationToken cancellationToken
    )
    {
        if (!await EnsurePythonToolchainAsync(workDir, logs, errors, cancellationToken))
        {
            return false;
        }

        var venvPython = OperatingSystem.IsWindows()
            ? Path.Combine(workDir, ".venv", "Scripts", "python.exe")
            : Path.Combine(workDir, ".venv", "bin", "python");
        if (File.Exists(venvPython))
        {
            return true;
        }

        var createVenv = OperatingSystem.IsWindows() ? "python -m venv .venv" : "python3 -m venv .venv";
        var venvResult = await RunWorkspaceCommandAsync(createVenv, workDir, cancellationToken);
        AppendInstallOutcome("Python 가상환경 생성(.venv)", createVenv, venvResult, logs, errors);
        if (venvResult.ExitCode != 0 || !File.Exists(venvPython))
        {
            return false;
        }

        var upgradePip = OperatingSystem.IsWindows()
            ? ".venv\\Scripts\\python.exe -m pip install --disable-pip-version-check --upgrade pip setuptools wheel"
            : ".venv/bin/python -m pip install --disable-pip-version-check --upgrade pip setuptools wheel";
        var pipResult = await RunWorkspaceCommandAsync(upgradePip, workDir, cancellationToken);
        AppendInstallOutcome("Python 가상환경 pip 준비(.venv)", upgradePip, pipResult, logs, errors);
        return pipResult.ExitCode == 0;
    }

    // requirements.txt 의 `pygame` 요구사항을 `pygame-ce`(드롭인 대체, 최신 파이썬 휠 제공)로
    // 바꾼다. 이미 pygame-ce 면 건드리지 않는다. 변경이 있을 때만 다시 쓴다.
    private static readonly Regex RequirementsPygameRegex = new(
        @"(?im)^(\s*)pygame(?!-ce)\b",
        RegexOptions.Compiled
    );

    private static void SanitizeRequirementsForCompatibility(string requirementsPath, List<string> logs)
    {
        try
        {
            var original = File.ReadAllText(requirementsPath);
            if (!RequirementsPygameRegex.IsMatch(original))
            {
                return;
            }

            var rewritten = RequirementsPygameRegex.Replace(original, "$1pygame-ce");
            if (!string.Equals(rewritten, original, StringComparison.Ordinal))
            {
                File.WriteAllText(requirementsPath, rewritten);
                logs.Add("requirements.txt: pygame → pygame-ce (최신 파이썬 호환)");
            }
        }
        catch
        {
        }
    }

    private static string BuildPipRequirementsInstallCommand(string requirementsPath)
    {
        if (OperatingSystem.IsWindows())
        {
            return $"if not exist .venv\\Scripts\\python.exe (python -m venv .venv && .venv\\Scripts\\python.exe -m pip install --disable-pip-version-check --upgrade pip setuptools wheel) & if exist .venv\\Scripts\\python.exe (.venv\\Scripts\\python.exe -m pip install --disable-pip-version-check -r {EscapeShellArg(requirementsPath)}) else (echo workspace .venv missing; refusing host pip install 1>&2 && exit /b 126)";
        }

        return $"if [ ! -x .venv/bin/python ]; then python3 -m venv .venv && .venv/bin/python -m pip install --disable-pip-version-check --upgrade pip setuptools wheel; fi; if [ -x .venv/bin/python ]; then .venv/bin/python -m pip install --disable-pip-version-check -r {EscapeShellArg(requirementsPath)}; else printf '%s\\n' 'workspace .venv missing; refusing host pip install' >&2; exit 126; fi";
    }

    private static string BuildPipPackageInstallCommand(IEnumerable<string> packages)
    {
        var packageArgs = string.Join(" ", packages.Select(EscapeShellArg));
        if (OperatingSystem.IsWindows())
        {
            return $"if not exist .venv\\Scripts\\python.exe (python -m venv .venv && .venv\\Scripts\\python.exe -m pip install --disable-pip-version-check --upgrade pip setuptools wheel) & if exist .venv\\Scripts\\python.exe (.venv\\Scripts\\python.exe -m pip install --disable-pip-version-check {packageArgs}) else (echo workspace .venv missing; refusing host pip install 1>&2 && exit /b 126)";
        }

        return $"if [ ! -x .venv/bin/python ]; then python3 -m venv .venv && .venv/bin/python -m pip install --disable-pip-version-check --upgrade pip setuptools wheel; fi; if [ -x .venv/bin/python ]; then .venv/bin/python -m pip install --disable-pip-version-check {packageArgs}; else printf '%s\\n' 'workspace .venv missing; refusing host pip install' >&2; exit 126; fi";
    }

    private static bool IsPythonSystemModule(string? moduleName)
    {
        return string.Equals(moduleName, "tkinter", StringComparison.OrdinalIgnoreCase)
               || string.Equals(moduleName, "_tkinter", StringComparison.OrdinalIgnoreCase);
    }

    private static string? FindRequirementsFile(string primaryDir, string fallbackDir)
    {
        if (!string.IsNullOrWhiteSpace(primaryDir))
        {
            var primary = Path.Combine(primaryDir, "requirements.txt");
            if (File.Exists(primary))
            {
                return primary;
            }
        }

        var fallback = Path.Combine(fallbackDir, "requirements.txt");
        return File.Exists(fallback) ? fallback : null;
    }

    private static string ResolveDependencyBaseDirectory(string command, string workDir, params string[] extensions)
    {
        var scriptPath = TryExtractScriptPath(command, workDir, extensions);
        if (string.IsNullOrWhiteSpace(scriptPath))
        {
            return workDir;
        }

        var candidate = scriptPath;
        if (!Path.IsPathRooted(candidate))
        {
            candidate = Path.GetFullPath(Path.Combine(workDir, candidate));
        }

        if (Directory.Exists(candidate))
        {
            return candidate;
        }

        var parent = Path.GetDirectoryName(candidate);
        return string.IsNullOrWhiteSpace(parent) ? workDir : parent;
    }

    private static string? TryExtractScriptPath(string command, string workDir, params string[] extensions)
    {
        if (string.IsNullOrWhiteSpace(command) || extensions.Length == 0)
        {
            return null;
        }

        foreach (Match match in ShellTokenRegex.Matches(command))
        {
            var token = match.Groups["sq"].Success
                ? match.Groups["sq"].Value
                : match.Groups["dq"].Success
                    ? match.Groups["dq"].Value
                    : match.Groups["bare"].Value;
            if (string.IsNullOrWhiteSpace(token))
            {
                continue;
            }

            if (!extensions.Any(ext => token.EndsWith(ext, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            if (Path.IsPathRooted(token))
            {
                return token;
            }

            return Path.GetFullPath(Path.Combine(workDir, token));
        }

        return null;
    }

    private static List<string> ExtractPythonPackagesFromSource(string scriptPath, params string[] extraLocalRoots)
    {
        string text;
        try
        {
            text = File.ReadAllText(scriptPath);
        }
        catch
        {
            return new List<string>();
        }

        var scriptDir = Path.GetDirectoryName(scriptPath) ?? string.Empty;
        var modules = PythonImportScanPolicy.ExtractRootModules(text);

        var packages = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var module in modules)
        {
            if (PythonStdlibModules.Contains(module))
            {
                continue;
            }

            // `__future__`, `__main__` 같은 특수 모듈은 설치 대상이 아니다(실측: pip 가
            // "Invalid requirement: '__future__'" 로 실패했다).
            if (module.StartsWith("__", StringComparison.Ordinal))
            {
                continue;
            }

            // 프로젝트 루트도 함께 본다. tests/ 아래 파일이 루트의 main.py 나 guess_game/ 을
            // import 하면, 예전에는 그 이름을 외부 패키지로 보고 pip install 을 시도해 실패했다(실측).
            if (IsLocalPythonModule(module, scriptDir, extraLocalRoots))
            {
                continue;
            }

            var package = ResolvePythonPackageName(module);
            if (!string.IsNullOrWhiteSpace(package))
            {
                packages.Add(package);
            }
        }

        return packages.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
    }

    /// <summary>모듈 이름이 프로젝트 안의 파일·폴더인지. 어느 한 뿌리에서라도 찾히면 외부 패키지가 아니다.</summary>
    private static bool IsLocalPythonModule(string module, string scriptDir, IReadOnlyList<string> extraLocalRoots)
    {
        var roots = new[] { scriptDir }.Concat(extraLocalRoots ?? Array.Empty<string>()).ToArray();
        foreach (var root in roots)
        {
            if (string.IsNullOrWhiteSpace(root))
            {
                continue;
            }

            if (File.Exists(Path.Combine(root, module + ".py")) || Directory.Exists(Path.Combine(root, module)))
            {
                return true;
            }
        }

        // 폴더로 나눈 프로젝트에서는 형제 폴더의 모듈을 import 한다(src/rendering 에서 src/settings.py).
        // 바로 위 뿌리만 보면 그런 모듈을 외부 패키지로 착각해 pip 로 설치하려다 실패한다(실측:
        // 'settings', 'tile' 설치 시도). 프로젝트 안을 한 번 훑어본다.
        foreach (var root in roots)
        {
            if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
            {
                continue;
            }

            try
            {
                foreach (var candidate in Directory.EnumerateFiles(root, module + ".py", SearchOption.AllDirectories))
                {
                    if (!IsIgnoredLocalModulePath(candidate))
                    {
                        return true;
                    }
                }

                foreach (var candidate in Directory.EnumerateDirectories(root, module, SearchOption.AllDirectories))
                {
                    if (!IsIgnoredLocalModulePath(candidate)
                        && File.Exists(Path.Combine(candidate, "__init__.py")))
                    {
                        return true;
                    }
                }
            }
            catch
            {
                // 탐색 실패는 치명적이지 않다. 외부 패키지로 보고 넘어간다.
            }
        }

        return false;
    }

    /// <summary>가상환경·캐시 폴더 안에서 찾은 건 프로젝트 모듈이 아니다.</summary>
    private static bool IsIgnoredLocalModulePath(string path)
    {
        var normalized = (path ?? string.Empty).Replace('\\', '/');
        return normalized.Contains("/.venv/", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("/venv/", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("/site-packages/", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("/__pycache__/", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("/node_modules/", StringComparison.OrdinalIgnoreCase);
    }

    private static List<string> ExtractNodePackagesFromSource(string scriptPath)
    {
        string text;
        try
        {
            text = File.ReadAllText(scriptPath);
        }
        catch
        {
            return new List<string>();
        }

        var packages = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in NodeImportRegex.Matches(text))
        {
            var specifier = match.Groups["mod"].Success
                ? match.Groups["mod"].Value
                : match.Groups["mod2"].Success
                    ? match.Groups["mod2"].Value
                    : match.Groups["mod3"].Value;
            var package = ResolveNodePackageName(specifier);
            if (!string.IsNullOrWhiteSpace(package))
            {
                packages.Add(package);
            }
        }

        return packages.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static string? ResolvePythonPackageName(string? moduleName)
    {
        var rootParts = (moduleName ?? string.Empty)
            .Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (rootParts.Length == 0)
        {
            return null;
        }

        var root = rootParts[0].Trim();
        if (string.IsNullOrWhiteSpace(root))
        {
            return null;
        }

        if (IsPythonSystemModule(root))
        {
            return null;
        }

        if (PythonModulePackageMap.TryGetValue(root, out var mapped))
        {
            return mapped;
        }

        return Regex.IsMatch(root, "^[A-Za-z0-9._-]+$") ? root : null;
    }

    private static string? ResolveNodePackageName(string? specifier)
    {
        var raw = (specifier ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw)
            || raw.StartsWith("./", StringComparison.Ordinal)
            || raw.StartsWith("../", StringComparison.Ordinal)
            || raw.StartsWith("/", StringComparison.Ordinal)
            || raw.StartsWith("node:", StringComparison.OrdinalIgnoreCase)
            || raw.StartsWith("file:", StringComparison.OrdinalIgnoreCase)
            || raw.StartsWith("http:", StringComparison.OrdinalIgnoreCase)
            || raw.StartsWith("https:", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        string package;
        if (raw.StartsWith("@", StringComparison.Ordinal))
        {
            var segments = raw.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length < 2)
            {
                return null;
            }

            package = $"{segments[0]}/{segments[1]}";
        }
        else
        {
            var segments = raw.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length == 0)
            {
                return null;
            }

            package = segments[0];
        }

        if (NodeBuiltinModules.Contains(package))
        {
            return null;
        }

        return Regex.IsMatch(package, "^@?[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)?$") ? package : null;
    }

    private static string? ResolvePythonCliPackageName(string? program)
    {
        var raw = (program ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        if (ProgramInstallDenyList.Contains(raw))
        {
            return null;
        }

        if (PythonCliPackageMap.TryGetValue(raw, out var mapped))
        {
            return mapped;
        }

        return Regex.IsMatch(raw, "^[A-Za-z0-9._-]+$") ? raw : null;
    }

    private static string? ResolveNodeCliPackageName(string? program)
    {
        var raw = (program ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        if (ProgramInstallDenyList.Contains(raw))
        {
            return null;
        }

        if (NodeCliPackageMap.TryGetValue(raw, out var mapped))
        {
            return mapped;
        }

        return Regex.IsMatch(raw, "^@?[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)?$") ? raw : null;
    }

    private static bool HasPythonWorkspaceSignals(string command, string workDir)
    {
        var baseDir = ResolveDependencyBaseDirectory(command, workDir, ".py");
        return File.Exists(Path.Combine(baseDir, "requirements.txt"))
               || Directory.EnumerateFiles(baseDir, "*.py", SearchOption.TopDirectoryOnly).Any();
    }

    private static bool HasNodeWorkspaceSignals(string command, string workDir)
    {
        var baseDir = ResolveDependencyBaseDirectory(command, workDir, ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx");
        if (File.Exists(Path.Combine(baseDir, "package.json")))
        {
            return true;
        }

        foreach (var pattern in new[] { "*.js", "*.mjs", "*.cjs", "*.ts", "*.tsx", "*.jsx" })
        {
            if (Directory.EnumerateFiles(baseDir, pattern, SearchOption.TopDirectoryOnly).Any())
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsNodeRuntimeProgram(string program)
    {
        return string.Equals(program, "node", StringComparison.OrdinalIgnoreCase)
               || string.Equals(program, "npm", StringComparison.OrdinalIgnoreCase)
               || string.Equals(program, "npx", StringComparison.OrdinalIgnoreCase)
               || string.Equals(program, "pnpm", StringComparison.OrdinalIgnoreCase)
               || string.Equals(program, "yarn", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsPythonRuntimeProgram(string program)
    {
        return string.Equals(program, "python", StringComparison.OrdinalIgnoreCase)
               || string.Equals(program, "python3", StringComparison.OrdinalIgnoreCase)
               || string.Equals(program, "pip", StringComparison.OrdinalIgnoreCase)
               || string.Equals(program, "pip3", StringComparison.OrdinalIgnoreCase);
    }

    private static string? ExtractPythonMissingModule(string stderr)
    {
        if (string.IsNullOrWhiteSpace(stderr))
        {
            return null;
        }

        var moduleNotFoundMatch = PythonModuleNotFoundRegex.Match(stderr);
        if (moduleNotFoundMatch.Success)
        {
            return moduleNotFoundMatch.Groups["module"].Value;
        }

        var importErrorMatch = PythonImportErrorRegex.Match(stderr);
        return importErrorMatch.Success ? importErrorMatch.Groups["module"].Value : null;
    }

    private static string? ExtractNodeMissingModule(string stderr)
    {
        if (string.IsNullOrWhiteSpace(stderr))
        {
            return null;
        }

        var match = NodeModuleNotFoundRegex.Match(stderr);
        if (!match.Success)
        {
            return null;
        }

        return match.Groups["module"].Success ? match.Groups["module"].Value : match.Groups["module2"].Value;
    }

    private static string? ExtractMissingProgram(string stderr)
    {
        if (string.IsNullOrWhiteSpace(stderr))
        {
            return null;
        }

        var match = CommandNotFoundRegex.Match(stderr);
        if (!match.Success)
        {
            return null;
        }

        var candidate = match.Groups["cmd"].Success ? match.Groups["cmd"].Value : match.Groups["cmd2"].Value;
        return SanitizeProgramName(candidate);
    }

    private static bool LooksLikePythonCommand(string command)
    {
        var lowered = (command ?? string.Empty).ToLowerInvariant();
        if (lowered.Contains("python", StringComparison.Ordinal))
        {
            return true;
        }

        var executable = ExtractCommandExecutableToken(command ?? string.Empty);
        return !string.IsNullOrWhiteSpace(executable) && PythonCommandPrefixes.Contains(executable);
    }

    private static bool LooksLikeNodeCommand(string command)
    {
        var lowered = (command ?? string.Empty).ToLowerInvariant();
        if (lowered.Contains("node", StringComparison.Ordinal)
            || lowered.Contains("npm", StringComparison.Ordinal)
            || lowered.Contains("pnpm", StringComparison.Ordinal)
            || lowered.Contains("yarn", StringComparison.Ordinal)
            || lowered.Contains("tsx", StringComparison.Ordinal)
            || lowered.Contains("ts-node", StringComparison.Ordinal))
        {
            return true;
        }

        var executable = ExtractCommandExecutableToken(command ?? string.Empty);
        return !string.IsNullOrWhiteSpace(executable) && NodeCommandPrefixes.Contains(executable);
    }

    private static string? ExtractCommandExecutableToken(string command)
    {
        if (string.IsNullOrWhiteSpace(command))
        {
            return null;
        }

        var awaitingEnvValue = false;
        foreach (Match match in ShellTokenRegex.Matches(command))
        {
            var token = match.Groups["sq"].Success
                ? match.Groups["sq"].Value
                : match.Groups["dq"].Success
                    ? match.Groups["dq"].Value
                    : match.Groups["bare"].Value;
            if (string.IsNullOrWhiteSpace(token))
            {
                continue;
            }

            if (awaitingEnvValue)
            {
                awaitingEnvValue = false;
                continue;
            }

            if (string.Equals(token, "env", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (string.Equals(token, "-i", StringComparison.OrdinalIgnoreCase)
                || string.Equals(token, "--ignore-environment", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (string.Equals(token, "-u", StringComparison.OrdinalIgnoreCase)
                || string.Equals(token, "--unset", StringComparison.OrdinalIgnoreCase))
            {
                awaitingEnvValue = true;
                continue;
            }

            if (Regex.IsMatch(token, "^[A-Za-z_][A-Za-z0-9_]*=.*$"))
            {
                continue;
            }

            return Path.GetFileName(token);
        }

        return null;
    }

    private static string? SanitizeProgramName(string? value)
    {
        var token = (value ?? string.Empty).Trim();
        return Regex.IsMatch(token, "^[A-Za-z0-9][A-Za-z0-9+._-]{1,63}$") ? token : null;
    }

    private static void AppendInstallOutcome(
        string title,
        string installCommand,
        ShellRunResult result,
        List<string> logs,
        List<string> errors
    )
    {
        if (result.ExitCode == 0)
        {
            logs.Add($"{title}: ok");
            var stdout = TrimInstallLog(result.StdOut, 1000);
            if (!string.IsNullOrWhiteSpace(stdout))
            {
                logs.Add(stdout);
            }
            return;
        }

        // 실패 사유부터 적는다. 예전에는 venv 준비 boilerplate 가 먼저 와서, 화면 요약이 잘리면
        // 무엇을 설치하다 실패했는지도 실제 오류도 하나도 안 보였다.
        errors.Add($"{title}: error(exit={result.ExitCode})");
        var stderr = TrimInstallLog(result.StdErr, 1400);
        if (!string.IsNullOrWhiteSpace(stderr))
        {
            errors.Add(stderr);
        }

        errors.Add(SummarizeInstallCommand(installCommand));
    }

    /// <summary>설치 명령에서 사람이 읽어야 할 부분(설치 대상)만 남긴다.</summary>
    private static string SummarizeInstallCommand(string installCommand)
    {
        var normalized = Regex.Replace(installCommand ?? string.Empty, @"\s+", " ").Trim();
        if (normalized.Length == 0)
        {
            return "설치 명령 없음";
        }

        var matches = Regex.Matches(normalized, @"pip install(?:\s+--[\w-]+(?:=\S+)?)*\s+(?<args>[^;&|]+)");
        if (matches.Count > 0)
        {
            var args = matches[^1].Groups["args"].Value.Trim();
            if (args.Length > 0)
            {
                return $"설치 대상: {(args.Length <= 200 ? args : args[..200] + "...")}";
            }
        }

        return $"설치 명령: {(normalized.Length <= 200 ? normalized : normalized[..200] + "...")}";
    }

    private static string MergeInstallLogs(string header, IReadOnlyList<string> installLogs, string originalText)
    {
        if (installLogs.Count == 0)
        {
            return originalText ?? string.Empty;
        }

        var builder = new StringBuilder();
        builder.AppendLine(header);
        foreach (var line in installLogs)
        {
            builder.AppendLine(line);
        }

        if (!string.IsNullOrWhiteSpace(originalText))
        {
            builder.AppendLine();
            builder.Append(originalText.Trim());
        }

        return builder.ToString().Trim();
    }

    private static string TrimInstallLog(string text, int maxLength)
    {
        var value = (text ?? string.Empty).Trim();
        if (value.Length <= maxLength)
        {
            return value;
        }

        return value[..maxLength] + "\n...(truncated)";
    }

    private static string EscapeShellArg(string value)
    {
        if (OperatingSystem.IsWindows())
        {
            return "\"" + (value ?? string.Empty).Replace("\"", "\\\"", StringComparison.Ordinal) + "\"";
        }

        return $"'{(value ?? string.Empty).Replace("'", "'\"'\"'", StringComparison.Ordinal)}'";
    }

    private async Task<ShellRunResult> RunWorkspaceCommandAsync(
        string command,
        string workDir,
        CancellationToken cancellationToken,
        string? standardInput = null
    )
    {
        cancellationToken.ThrowIfCancellationRequested();
        var shellPath = ShellPathResolver.Resolve();
        var startInfo = new ProcessStartInfo
        {
            FileName = shellPath,
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = workDir
        };
        ApplyWorkspaceExecutablePath(startInfo, command, workDir);
        // pygame/tkinter 등 SDL/GUI 코드가 헤드리스에서 'No available video device' 로 죽지 않게
        // 더미 드라이버를 준다. 다만 화면이 있는 자리에서까지 더미를 씌우면 실행 버튼을 눌러도
        // 창이 안 뜬다. 표시 장치가 실제로 있으면 건드리지 않는다(검증 단계는 스스로 dummy 를 지정한다).
        var hasDisplay = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DISPLAY"))
                         || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WAYLAND_DISPLAY"))
                         || OperatingSystem.IsWindows()
                         || OperatingSystem.IsMacOS();
        if (!hasDisplay)
        {
            startInfo.Environment["SDL_VIDEODRIVER"] = startInfo.Environment.TryGetValue("SDL_VIDEODRIVER", out var sdlVideo) && !string.IsNullOrWhiteSpace(sdlVideo) ? sdlVideo : "dummy";
        }

        startInfo.Environment["SDL_AUDIODRIVER"] = startInfo.Environment.TryGetValue("SDL_AUDIODRIVER", out var sdlAudio) && !string.IsNullOrWhiteSpace(sdlAudio) ? sdlAudio : "dummy";

        // 폴더로 나눈 프로젝트는 하위 폴더에서 실행하거나 tests/ 에서 패키지를 import 하는 순간
        // ModuleNotFoundError 가 난다. 그러면 복구 로직이 그 이름을 외부 패키지로 보고 pip 로 설치하려
        // 들다 작업이 통째로 깨졌다(실측: `pip install src` 가 wheel 빌드 실패). 작업 폴더를 모듈 경로에
        // 넣어 애초에 그 오류가 나지 않게 한다.
        var existingPythonPath = startInfo.Environment.TryGetValue("PYTHONPATH", out var pythonPath) ? pythonPath : string.Empty;
        startInfo.Environment["PYTHONPATH"] = string.IsNullOrWhiteSpace(existingPythonPath)
            ? workDir
            : workDir + Path.PathSeparator + existingPythonPath;

        var normalizedCommand = RewritePythonInterpreterToWorkspaceVenv(NormalizePythonCommandForShell(command), workDir);
        if (OperatingSystem.IsWindows())
        {
            startInfo.ArgumentList.Add("/c");
            startInfo.ArgumentList.Add(normalizedCommand);
        }
        else
        {
            startInfo.ArgumentList.Add("-lc");
            startInfo.ArgumentList.Add(normalizedCommand);
        }

        using var process = new Process { StartInfo = startInfo };
        try
        {
            process.Start();
        }
        catch (Exception ex)
        {
            return new ShellRunResult(127, string.Empty, ex.Message, false);
        }

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(Math.Max(20, _execution.CodeExecutionTimeoutSec)));
        var stdoutTask = process.StandardOutput.ReadToEndAsync(timeoutCts.Token);
        var stderrTask = process.StandardError.ReadToEndAsync(timeoutCts.Token);

        try
        {
            try
            {
                var normalizedInput = NormalizeWorkspaceCommandStandardInput(standardInput);
                if (!string.IsNullOrEmpty(normalizedInput))
                {
                    await process.StandardInput.WriteAsync(normalizedInput.AsMemory(), timeoutCts.Token);
                    await process.StandardInput.FlushAsync(timeoutCts.Token);
                }
            }
            catch (IOException) { /* 입력을 읽기 전에 종료한 프로그램도 출력을 확인한다. */ }
            finally { process.StandardInput.Close(); }
            await process.WaitForExitAsync(timeoutCts.Token);
            return new ShellRunResult(process.ExitCode, await stdoutTask, await stderrTask, false);
        }
        catch (OperationCanceledException)
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                }
                await process.WaitForExitAsync(CancellationToken.None);
            }
            catch
            {
            }

            string stdout;
            string stderr;
            try
            {
                stdout = await stdoutTask;
            }
            catch
            {
                stdout = string.Empty;
            }

            try
            {
                stderr = await stderrTask;
            }
            catch
            {
                stderr = string.Empty;
            }

            cancellationToken.ThrowIfCancellationRequested();
            if (string.IsNullOrWhiteSpace(stderr))
            {
                stderr = "execution timed out";
            }

            return new ShellRunResult(124, stdout, stderr, true);
        }
    }

    private static string NormalizeWorkspaceCommandStandardInput(string? standardInput)
    {
        var normalized = (standardInput ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace("\r", "\n", StringComparison.Ordinal);
        if (normalized.Length == 0)
        {
            return string.Empty;
        }

        return normalized.EndsWith('\n') ? normalized : normalized + "\n";
    }


    private static void ApplyWorkspaceExecutablePath(ProcessStartInfo startInfo, string command, string workDir)
    {
        var pathPrefixes = new List<string>();

        var workspacePythonBin = Path.Combine(workDir, ".venv", "bin");
        if (Directory.Exists(workspacePythonBin))
        {
            pathPrefixes.Add(workspacePythonBin);
        }

        var workspaceWindowsPythonBin = Path.Combine(workDir, ".venv", "Scripts");
        if (Directory.Exists(workspaceWindowsPythonBin))
        {
            pathPrefixes.Add(workspaceWindowsPythonBin);
        }

        var workspaceNodeBin = Path.Combine(workDir, "node_modules", ".bin");
        if (Directory.Exists(workspaceNodeBin))
        {
            pathPrefixes.Add(workspaceNodeBin);
        }

        var nodeBaseDir = ResolveDependencyBaseDirectory(command, workDir, ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx");
        var nodeBaseBin = Path.Combine(nodeBaseDir, "node_modules", ".bin");
        if (Directory.Exists(nodeBaseBin))
        {
            pathPrefixes.Add(nodeBaseBin);
        }

        var runtimeBin = Path.Combine(workDir, ".runtime", "bin");
        if (Directory.Exists(runtimeBin))
        {
            pathPrefixes.Add(runtimeBin);
        }

        foreach (var pythonBin in EnumeratePythonUserBinDirectories())
        {
            pathPrefixes.Add(pythonBin);
        }

        foreach (var toolchainBin in EnumerateUserToolchainBinDirectories())
        {
            pathPrefixes.Add(toolchainBin);
        }

        if (pathPrefixes.Count == 0)
        {
            return;
        }

        var existing = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        var merged = pathPrefixes
            .Distinct(StringComparer.Ordinal)
            .Concat(string.IsNullOrWhiteSpace(existing) ? Array.Empty<string>() : new[] { existing });
        startInfo.Environment["PATH"] = string.Join(Path.PathSeparator, merged);
    }

    /// <summary>
    /// 홈에 깔린 언어 툴체인 경로. 데스크톱 앱은 로그인 셸 PATH 를 물려받지 못할 때가 많아
    /// rustup(~/.cargo/bin)·Go(~/.local/go/bin)·SDKMAN 을 직접 찾아 준다. 있는 것만 넣는다.
    /// </summary>
    private static IEnumerable<string> EnumerateUserToolchainBinDirectories()
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrWhiteSpace(home))
        {
            yield break;
        }

        var candidates = new[]
        {
            Path.Combine(home, ".cargo", "bin"),
            Path.Combine(home, ".local", "go", "bin"),
            Path.Combine(home, "go", "bin"),
            Path.Combine(home, ".local", "bin"),
            Path.Combine(home, ".sdkman", "candidates", "java", "current", "bin"),
            Path.Combine(home, ".sdkman", "candidates", "kotlin", "current", "bin"),
            Path.Combine(home, ".bun", "bin"),
            "/usr/local/go/bin"
        };

        foreach (var candidate in candidates)
        {
            if (Directory.Exists(candidate))
            {
                yield return candidate;
            }
        }
    }

    private static IEnumerable<string> EnumeratePythonUserBinDirectories()
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrWhiteSpace(home))
        {
            yield break;
        }

        if (OperatingSystem.IsMacOS())
        {
            var libraryPython = Path.Combine(home, "Library", "Python");
            if (!Directory.Exists(libraryPython))
            {
                yield break;
            }

            foreach (var versionDir in Directory.EnumerateDirectories(libraryPython))
            {
                var binDir = Path.Combine(versionDir, "bin");
                if (Directory.Exists(binDir))
                {
                    yield return binDir;
                }
            }

            yield break;
        }

        if (OperatingSystem.IsLinux())
        {
            var localBin = Path.Combine(home, ".local", "bin");
            if (Directory.Exists(localBin))
            {
                yield return localBin;
            }
        }
    }
}

using System.Diagnostics;
using System.Text.Json;

namespace Omnux.Middleware.Tests;

public sealed class SandboxExecutorPolicyTests
{
    [Fact]
    public async Task ExecutorSetsSandboxMarkerAndUsesTemporaryWorkingDirectory()
    {
        var repoRoot = FindRepoRoot();
        var executorPath = Path.GetFullPath(Path.Combine(repoRoot, "apps", "omnux-sandbox", "executor.py"));

        var scriptPath = Path.Combine(Path.GetTempPath(), $"omnux-sandbox-test-{Guid.NewGuid():N}.py");
        await File.WriteAllTextAsync(scriptPath, """
import json
import os
import pathlib

print(json.dumps({
    "sandbox": os.environ.get("OMNUX_SANDBOX"),
    "cwd": pathlib.Path.cwd().name,
    "home": os.environ.get("HOME") or os.environ.get("USERPROFILE") or "",
    "python_no_usersite": os.environ.get("PYTHONNOUSERSITE"),
    "tmpdir": os.environ.get("TMPDIR") or os.environ.get("TEMP") or os.environ.get("TMP") or "",
}))
""");

        try
        {
            var result = await RunProcessAsync(ResolvePythonBinary(), new[] { executorPath, "--script", scriptPath }, repoRoot);
            Assert.Equal(0, result.ExitCode);

            using var document = JsonDocument.Parse(result.StdOut.Trim());
            var root = document.RootElement;
            Assert.Equal("ok", root.GetProperty("status").GetString());

            using var child = JsonDocument.Parse(root.GetProperty("stdout").GetString() ?? string.Empty);
            var childRoot = child.RootElement;
            Assert.Equal("1", childRoot.GetProperty("sandbox").GetString());
            Assert.Equal("1", childRoot.GetProperty("python_no_usersite").GetString());
            Assert.StartsWith("omnux_sandbox_", childRoot.GetProperty("cwd").GetString() ?? string.Empty);
            Assert.Contains(Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar), childRoot.GetProperty("home").GetString() ?? string.Empty);
        }
        finally
        {
            try
            {
                File.Delete(scriptPath);
            }
            catch
            {
            }
        }
    }

    private static string FindRepoRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        for (var i = 0; i < 10 && current != null; i += 1)
        {
            if (File.Exists(Path.Combine(current.FullName, "develop.md")))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        throw new InvalidOperationException("저장소 루트를 찾을 수 없습니다.");
    }

    private static string ResolvePythonBinary()
    {
        foreach (var candidate in new[] { "python3", "python" })
        {
            try
            {
                var result = RunProcessAsync(candidate, new[] { "--version" }, FindRepoRoot()).GetAwaiter().GetResult();
                if (result.ExitCode == 0)
                {
                    return candidate;
                }
            }
            catch
            {
            }
        }

        throw new InvalidOperationException("python3/python 실행 파일을 찾을 수 없습니다.");
    }

    private static async Task<(int ExitCode, string StdOut, string StdErr)> RunProcessAsync(string fileName, IEnumerable<string> arguments, string workingDirectory)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = workingDirectory,
        };

        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        using var process = new Process { StartInfo = startInfo };
        process.Start();
        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        return (process.ExitCode, await stdoutTask, await stderrTask);
    }
}

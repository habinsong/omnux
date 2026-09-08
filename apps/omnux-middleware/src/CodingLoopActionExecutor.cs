namespace Omnux.Middleware;

internal readonly record struct CodingLoopShellResult(int ExitCode, string StdOut, string StdErr, bool TimedOut);

internal static class CodingLoopActionExecutor
{
    public static async Task<CodingLoopActionResult> ExecuteAsync(
        CodingLoopAction action,
        string workspaceRoot,
        IReadOnlyList<string> requestedPaths,
        string provider,
        Func<string, string?, string?, IReadOnlyList<string>, string, string?> resolveActionPathOrFallback,
        Func<string, string, string> resolveWorkspacePath,
        Func<string, string, string, string> normalizeProviderGeneratedFileContent,
        Func<string, string, CancellationToken, Task<CodingLoopShellResult>> runWorkspaceCommandAsync,
        CancellationToken cancellationToken
    )
    {
        cancellationToken.ThrowIfCancellationRequested();
        var type = CodingExecutionSafetyPolicy.NormalizeActionType(action.Type, action.Path, action.Content, action.Command);
        var resolvedPath = resolveActionPathOrFallback(type, action.Path, action.Content, requestedPaths, workspaceRoot);
        if (type != "run" && string.IsNullOrWhiteSpace(resolvedPath))
        {
            return new CodingLoopActionResult($"{type}:missing_path", null, string.Empty, string.Empty, string.Empty, false);
        }
        var resolvedNonRunPath = resolvedPath ?? string.Empty;

        if (type == "mkdir")
        {
            if (CodingExecutionSafetyPolicy.LooksLikeFilePathForDirectoryAction(resolvedNonRunPath, requestedPaths))
            {
                return new CodingLoopActionResult($"mkdir_skipped_file_like:{resolvedNonRunPath}", null, string.Empty, resolvedNonRunPath, resolvedNonRunPath, false);
            }

            var dir = resolveWorkspacePath(workspaceRoot, resolvedNonRunPath);
            Directory.CreateDirectory(dir);
            return new CodingLoopActionResult($"mkdir:{dir}", null, string.Empty, dir, dir, false);
        }

        if (type == "write_file")
        {
            var filePath = resolveWorkspacePath(workspaceRoot, resolvedNonRunPath);
            var parent = Path.GetDirectoryName(filePath);
            if (!string.IsNullOrWhiteSpace(parent))
            {
                Directory.CreateDirectory(parent);
            }

            var normalizedContent = normalizeProviderGeneratedFileContent(provider, resolvedNonRunPath, action.Content ?? string.Empty);
            await File.WriteAllTextAsync(filePath, normalizedContent, cancellationToken);
            var preview = normalizedContent;
            if (preview.Length > 12000)
            {
                preview = preview[..12000] + "\n...(truncated)";
            }

            return new CodingLoopActionResult($"write:{filePath}", null, preview, filePath, filePath, true);
        }

        if (type == "append_file")
        {
            var filePath = resolveWorkspacePath(workspaceRoot, resolvedNonRunPath);
            var parent = Path.GetDirectoryName(filePath);
            if (!string.IsNullOrWhiteSpace(parent))
            {
                Directory.CreateDirectory(parent);
            }

            var normalizedContent = normalizeProviderGeneratedFileContent(provider, resolvedNonRunPath, action.Content ?? string.Empty);
            await File.AppendAllTextAsync(filePath, normalizedContent, cancellationToken);
            string preview;
            try
            {
                var current = await File.ReadAllTextAsync(filePath, cancellationToken);
                preview = current.Length <= 12000 ? current : current[^12000..];
            }
            catch
            {
                preview = normalizedContent;
            }

            return new CodingLoopActionResult($"append:{filePath}", null, preview, filePath, filePath, true);
        }

        if (type == "edit_file")
        {
            var filePath = resolveWorkspacePath(workspaceRoot, resolvedNonRunPath);
            if (!File.Exists(filePath))
            {
                return new CodingLoopActionResult($"edit_miss:{filePath}", null, string.Empty, filePath, filePath, false);
            }

            var find = action.Find ?? string.Empty;
            var replacement = !string.IsNullOrEmpty(action.Replace) ? action.Replace : (action.Content ?? string.Empty);
            if (string.IsNullOrEmpty(find))
            {
                return new CodingLoopActionResult($"edit_requires_find:{filePath}", null, string.Empty, filePath, filePath, false);
            }

            var original = await File.ReadAllTextAsync(filePath, cancellationToken);
            var matchIndex = original.IndexOf(find, StringComparison.Ordinal);
            if (matchIndex < 0)
            {
                // 모델이 실제 파일 내용을 보고 정확히 다시 시도하도록 현재 내용을 미리보기로 돌려준다.
                var currentPreview = original.Length <= 8000 ? original : original[..8000] + "\n...(truncated)";
                return new CodingLoopActionResult($"edit_no_match:{filePath}", null, currentPreview, filePath, filePath, false);
            }

            var updated = string.Concat(
                original.AsSpan(0, matchIndex),
                replacement,
                original.AsSpan(matchIndex + find.Length)
            );
            await File.WriteAllTextAsync(filePath, updated, cancellationToken);
            var editedPreview = updated.Length > 12000 ? updated[..12000] + "\n...(truncated)" : updated;
            return new CodingLoopActionResult($"edit:{filePath}", null, editedPreview, filePath, filePath, true);
        }

        if (type == "read_file")
        {
            var filePath = resolveWorkspacePath(workspaceRoot, resolvedNonRunPath);
            if (!File.Exists(filePath))
            {
                return new CodingLoopActionResult($"read_miss:{filePath}", null, string.Empty, filePath, filePath, false);
            }

            var content = await File.ReadAllTextAsync(filePath, cancellationToken);
            var preview = content.Length <= 8000 ? content : content[..8000] + "\n...(truncated)";
            return new CodingLoopActionResult($"read:{filePath}", null, preview, filePath, filePath, false);
        }

        if (type == "delete_file")
        {
            var filePath = resolveWorkspacePath(workspaceRoot, resolvedNonRunPath);
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
                return new CodingLoopActionResult($"delete:{filePath}", null, string.Empty, filePath, filePath, true);
            }

            return new CodingLoopActionResult($"delete_miss:{filePath}", null, string.Empty, filePath, filePath, false);
        }

        if (type == "run")
        {
            var command = CodingFallbackPolicy.NormalizeGeneratedRunCommand(action.Command);
            if (string.IsNullOrWhiteSpace(command))
            {
                return new CodingLoopActionResult("run:empty_command", null, string.Empty, string.Empty, string.Empty, false);
            }
            if (CodingExecutionSafetyPolicy.IsDangerousGeneratedRunCommand(command))
            {
                return new CodingLoopActionResult($"run_blocked_unsafe:{TrimForOutput(command, 120)}", null, string.Empty, string.Empty, string.Empty, false);
            }

            var shell = await runWorkspaceCommandAsync(command, workspaceRoot, cancellationToken);
            var execution = new CodeExecutionResult(
                "bash",
                workspaceRoot,
                "-",
                command,
                shell.ExitCode,
                shell.StdOut,
                shell.StdErr,
                shell.TimedOut ? "timeout" : (shell.ExitCode == 0 ? "ok" : "error")
            );
            return new CodingLoopActionResult($"run:{command} => {execution.Status}", execution, string.Empty, string.Empty, string.Empty, false);
        }

        return new CodingLoopActionResult($"unsupported_action:{type}", null, string.Empty, string.Empty, string.Empty, false);
    }
    private static string TrimForOutput(string text, int maxLength)
    {
        var value = text ?? string.Empty;
        return value.Length <= maxLength ? value : value[..maxLength] + "...";
    }
}

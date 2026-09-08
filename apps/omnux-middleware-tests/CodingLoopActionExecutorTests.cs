using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingLoopActionExecutorTests
{
    [Theory]
    [InlineData("mkdir")]
    [InlineData("write_file")]
    [InlineData("run")]
    public async Task CancelledActionDoesNotCreateFilesOrStartRunner(string type)
    {
        var root = CreateTempRoot();
        var runnerCalled = false;
        try
        {
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => ExecuteAsync(
                new CodingLoopAction(type, "created", "content", "echo ok"), root,
                runner: (_, _, _) => { runnerCalled = true; return Task.FromResult(new CodingLoopShellResult(0, "", "", false)); },
                cancellationToken: new CancellationToken(true)));
            Assert.False(runnerCalled);
            Assert.Empty(Directory.EnumerateFileSystemEntries(root));
        }
        finally { DeleteTempRoot(root); }
    }

    [Fact]
    public async Task ExecuteAsyncWritesFileAndCreatesParentDirectory()
    {
        var root = CreateTempRoot();
        try
        {
            var result = await ExecuteAsync(
                new CodingLoopAction("write_file", "src/app.txt", "hello", string.Empty),
                root
            );

            var path = Path.Combine(root, "src", "app.txt");
            Assert.True(result.Changed);
            Assert.Equal("hello", await File.ReadAllTextAsync(path));
            Assert.Equal(path, result.ChangedPath);
            Assert.Equal("hello", result.CodePreview);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ExecuteAsyncSkipsMkdirWhenPathLooksLikeRequestedFile()
    {
        var root = CreateTempRoot();
        try
        {
            var result = await ExecuteAsync(
                new CodingLoopAction("mkdir", "app.py", string.Empty, string.Empty),
                root,
                requestedPaths: new[] { "app.py" }
            );

            Assert.False(result.Changed);
            Assert.StartsWith("mkdir_skipped_file_like:app.py", result.Message, StringComparison.Ordinal);
            Assert.False(Directory.Exists(Path.Combine(root, "app.py")));
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ExecuteAsyncReadsExistingFilePreview()
    {
        var root = CreateTempRoot();
        try
        {
            var path = Path.Combine(root, "readme.txt");
            await File.WriteAllTextAsync(path, "content");

            var result = await ExecuteAsync(
                new CodingLoopAction("read_file", "readme.txt", string.Empty, string.Empty),
                root
            );

            Assert.False(result.Changed);
            Assert.Equal("content", result.CodePreview);
            Assert.StartsWith("read:", result.Message, StringComparison.Ordinal);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ExecuteAsyncBlocksDangerousRunCommandBeforeRunner()
    {
        var root = CreateTempRoot();
        var called = false;
        try
        {
            var result = await ExecuteAsync(
                new CodingLoopAction("run", string.Empty, string.Empty, "rm -rf workspace"),
                root,
                runner: (_, _, _) =>
                {
                    called = true;
                    return Task.FromResult(new CodingLoopShellResult(0, string.Empty, string.Empty, false));
                }
            );

            Assert.False(called);
            Assert.Null(result.Execution);
            Assert.StartsWith("run_blocked_unsafe:", result.Message, StringComparison.Ordinal);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ExecuteAsyncRunsSafeCommandThroughRunner()
    {
        var root = CreateTempRoot();
        try
        {
            var result = await ExecuteAsync(
                new CodingLoopAction("run", string.Empty, string.Empty, "python3 app.py"),
                root,
                runner: (command, _, _) => Task.FromResult(new CodingLoopShellResult(
                    0,
                    $"ran:{command}",
                    string.Empty,
                    false
                ))
            );

            Assert.NotNull(result.Execution);
            Assert.Equal("ok", result.Execution.Status);
            Assert.Equal("ran:python3 app.py", result.Execution.StdOut);
            Assert.Equal("run:python3 app.py => ok", result.Message);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ExecuteAsyncEditFileReplacesFirstMatch()
    {
        var root = CreateTempRoot();
        try
        {
            var path = Path.Combine(root, "calc.py");
            await File.WriteAllTextAsync(path, "def add(a, b):\n    return a - b\n");

            var result = await ExecuteAsync(
                new CodingLoopAction("edit_file", "calc.py", string.Empty, string.Empty, "return a - b", "return a + b"),
                root
            );

            Assert.True(result.Changed);
            Assert.StartsWith("edit:", result.Message, StringComparison.Ordinal);
            Assert.Equal("def add(a, b):\n    return a + b\n", await File.ReadAllTextAsync(path));
            Assert.Contains("return a + b", result.CodePreview);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ExecuteAsyncEditFileReturnsCurrentContentWhenNoMatch()
    {
        var root = CreateTempRoot();
        try
        {
            var path = Path.Combine(root, "calc.py");
            await File.WriteAllTextAsync(path, "value = 1\n");

            var result = await ExecuteAsync(
                new CodingLoopAction("edit_file", "calc.py", string.Empty, string.Empty, "value = 99", "value = 2"),
                root
            );

            Assert.False(result.Changed);
            Assert.StartsWith("edit_no_match:", result.Message, StringComparison.Ordinal);
            // 모델이 실제 내용을 보고 다시 시도할 수 있도록 현재 내용을 미리보기로 돌려준다.
            Assert.Equal("value = 1\n", result.CodePreview);
            Assert.Equal("value = 1\n", await File.ReadAllTextAsync(path));
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ExecuteAsyncEditFileMissingFileReturnsEditMiss()
    {
        var root = CreateTempRoot();
        try
        {
            var result = await ExecuteAsync(
                new CodingLoopAction("edit_file", "missing.py", string.Empty, string.Empty, "a", "b"),
                root
            );

            Assert.False(result.Changed);
            Assert.StartsWith("edit_miss:", result.Message, StringComparison.Ordinal);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ExecuteAsyncEditFileUsesContentWhenReplaceOmitted()
    {
        var root = CreateTempRoot();
        try
        {
            var path = Path.Combine(root, "note.txt");
            await File.WriteAllTextAsync(path, "alpha beta gamma");

            // replace 가 비어 있으면 content 를 교체 텍스트로 사용한다.
            var result = await ExecuteAsync(
                new CodingLoopAction("edit_file", "note.txt", "BETA", string.Empty, "beta", string.Empty),
                root
            );

            Assert.True(result.Changed);
            Assert.Equal("alpha BETA gamma", await File.ReadAllTextAsync(path));
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    private static Task<CodingLoopActionResult> ExecuteAsync(
        CodingLoopAction action,
        string root,
        IReadOnlyList<string>? requestedPaths = null,
        Func<string, string, CancellationToken, Task<CodingLoopShellResult>>? runner = null,
        CancellationToken cancellationToken = default
    )
    {
        return CodingLoopActionExecutor.ExecuteAsync(
            action,
            root,
            requestedPaths ?? Array.Empty<string>(),
            "test",
            ResolveActionPath,
            ResolveWorkspacePath,
            (_, _, content) => content,
            runner ?? ((_, _, _) => Task.FromResult(new CodingLoopShellResult(0, string.Empty, string.Empty, false))),
            cancellationToken
        );
    }

    private static string? ResolveActionPath(
        string type,
        string? path,
        string? content,
        IReadOnlyList<string> requestedPaths,
        string workspaceRoot
    )
    {
        _ = type;
        _ = content;
        _ = requestedPaths;
        _ = workspaceRoot;
        return string.IsNullOrWhiteSpace(path) ? null : path.Replace('\\', '/').TrimStart('/');
    }

    private static string ResolveWorkspacePath(string root, string relativePath)
    {
        return Path.GetFullPath(Path.Combine(root, relativePath));
    }

    private static string CreateTempRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "omnux-loop-action-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }

    private static void DeleteTempRoot(string root)
    {
        if (Directory.Exists(root))
        {
            Directory.Delete(root, recursive: true);
        }
    }
}

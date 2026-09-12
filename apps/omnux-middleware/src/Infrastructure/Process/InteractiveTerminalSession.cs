using System.Diagnostics;
using System.Text;

namespace Omnux.Middleware;

public sealed record TerminalSessionStartRequest(
    string Command,
    string WorkingDirectory,
    int Columns,
    int Rows,
    IReadOnlyDictionary<string, string>? ExtraEnvironment = null
);

public sealed record TerminalSessionChunk(string SessionId, string Data);

public sealed record TerminalSessionExit(string SessionId, int ExitCode, string Reason);

/// <summary>
/// 만든 프로그램을 진짜 터미널에서 돌린다.
///
/// 파이프로만 띄우면 `sys.stdin.isatty()` 가 false 라 curses·questionary·게임 루프가 모두
/// 죽거나 입력을 못 받는다. 그래서 util-linux/BSD 의 `script` 로 의사 터미널(PTY)을 붙인다.
/// (Linux util-linux 2.41 / macOS BSD script 양쪽에서 isatty=true, stty 로 크기 지정까지 실측 확인)
/// 이렇게 하면 ANSI 화면 제어가 그대로 흘러나와 프론트의 터미널 뷰가 그대로 그릴 수 있다.
/// </summary>
public sealed class InteractiveTerminalSession : IAsyncDisposable
{
    private readonly Process _process;
    private readonly CancellationTokenSource _cancellation;
    private readonly StringBuilder _scrollback = new();
    private readonly object _scrollbackLock = new();
    private int _exitCode = -1;

    public const int ScrollbackMaxChars = 200_000;

    public string SessionId { get; }
    public string Command { get; }
    public string WorkingDirectory { get; }
    public Task Completion { get; }
    public bool IsRunning => !Completion.IsCompleted;

    private InteractiveTerminalSession(
        string sessionId,
        Process process,
        string command,
        string workingDirectory,
        CancellationTokenSource cancellation,
        Func<Task> pump
    )
    {
        SessionId = sessionId;
        _process = process;
        Command = command;
        WorkingDirectory = workingDirectory;
        _cancellation = cancellation;
        Completion = Task.Run(pump, CancellationToken.None);
    }

    public static bool IsSupported => !OperatingSystem.IsWindows();

    /// <summary>PTY 를 붙여 프로그램을 띄운다. Windows 는 지원하지 않는다(호출측이 일회성 실행으로 내려간다).</summary>
    public static InteractiveTerminalSession Start(
        string sessionId,
        TerminalSessionStartRequest request,
        Action<TerminalSessionChunk> onOutput,
        Action<TerminalSessionExit> onExit
    )
    {
        if (!IsSupported)
        {
            throw new PlatformNotSupportedException("대화형 터미널 실행은 Windows 에서 지원하지 않습니다.");
        }

        var columns = Math.Clamp(request.Columns <= 0 ? 100 : request.Columns, 20, 400);
        var rows = Math.Clamp(request.Rows <= 0 ? 30 : request.Rows, 5, 200);
        var inner = $"stty rows {rows} cols {columns} 2>/dev/null; {request.Command}";

        var startInfo = new ProcessStartInfo
        {
            FileName = "/bin/sh",
            WorkingDirectory = request.WorkingDirectory,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
        startInfo.ArgumentList.Add("-c");
        startInfo.ArgumentList.Add(BuildPtyWrapperCommand(inner));

        startInfo.Environment["TERM"] = "xterm-256color";
        startInfo.Environment["COLUMNS"] = columns.ToString();
        startInfo.Environment["LINES"] = rows.ToString();
        // 파이썬이 한 줄씩 내보내야 화면이 실시간으로 갱신된다.
        startInfo.Environment["PYTHONUNBUFFERED"] = "1";
        if (request.ExtraEnvironment != null)
        {
            foreach (var (key, value) in request.ExtraEnvironment)
            {
                startInfo.Environment[key] = value;
            }
        }

        var process = new Process { StartInfo = startInfo };
        process.Start();

        var cancellation = new CancellationTokenSource();
        InteractiveTerminalSession? session = null;
        session = new InteractiveTerminalSession(
            sessionId,
            process,
            request.Command,
            request.WorkingDirectory,
            cancellation,
            async () =>
            {
                try
                {
                    var stdout = PumpAsync(process.StandardOutput, sessionId, onOutput, session!, cancellation.Token);
                    var stderr = PumpAsync(process.StandardError, sessionId, onOutput, session!, cancellation.Token);
                    await Task.WhenAll(stdout, stderr).ConfigureAwait(false);
                    await process.WaitForExitAsync(CancellationToken.None).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                }
                catch (Exception ex)
                {
                    onOutput(new TerminalSessionChunk(sessionId, $"\r\n[omnux] 실행 중 오류: {ex.Message}\r\n"));
                }
                finally
                {
                    var code = TryGetExitCode(process);
                    session!._exitCode = code;
                    onExit(new TerminalSessionExit(
                        sessionId,
                        code,
                        cancellation.IsCancellationRequested ? "stopped" : "exited"
                    ));
                }
            }
        );
        return session;
    }

    /// <summary>
    /// PTY 래퍼 명령. Linux(util-linux)와 macOS(BSD)의 script 인자 순서가 다르다.
    /// script 가 없으면 PTY 없이라도 돌아가게 마지막에 sh 로 떨어뜨린다.
    /// </summary>
    internal static string BuildPtyWrapperCommand(string innerCommand)
    {
        var quoted = ShellQuote(innerCommand);
        if (OperatingSystem.IsMacOS())
        {
            return $"if command -v script >/dev/null 2>&1; then exec script -q /dev/null /bin/sh -c {quoted}; else exec /bin/sh -c {quoted}; fi";
        }

        return $"if command -v script >/dev/null 2>&1; then exec script -qfec {quoted} /dev/null; else exec /bin/sh -c {quoted}; fi";
    }

    internal static string ShellQuote(string value)
    {
        return "'" + (value ?? string.Empty).Replace("'", "'\\''", StringComparison.Ordinal) + "'";
    }

    private static async Task PumpAsync(
        StreamReader reader,
        string sessionId,
        Action<TerminalSessionChunk> onOutput,
        InteractiveTerminalSession session,
        CancellationToken cancellationToken
    )
    {
        var buffer = new char[4096];
        while (!cancellationToken.IsCancellationRequested)
        {
            int read;
            try
            {
                read = await reader.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (IOException)
            {
                return;
            }

            if (read <= 0)
            {
                return;
            }

            var text = new string(buffer, 0, read);
            session.AppendScrollback(text);
            onOutput(new TerminalSessionChunk(sessionId, text));
        }
    }

    private void AppendScrollback(string text)
    {
        lock (_scrollbackLock)
        {
            _scrollback.Append(text);
            if (_scrollback.Length > ScrollbackMaxChars)
            {
                _scrollback.Remove(0, _scrollback.Length - ScrollbackMaxChars);
            }
        }
    }

    public string ReadScrollback()
    {
        lock (_scrollbackLock)
        {
            return _scrollback.ToString();
        }
    }

    public int ExitCode => _exitCode;

    public async Task WriteAsync(string data, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(data) || _process.HasExited)
        {
            return;
        }

        await _process.StandardInput.WriteAsync(data.AsMemory(), cancellationToken).ConfigureAwait(false);
        await _process.StandardInput.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    public void Stop()
    {
        _cancellation.Cancel();
        TryKill();
    }

    private void TryKill()
    {
        try
        {
            if (!_process.HasExited)
            {
                _process.Kill(entireProcessTree: true);
            }
        }
        catch
        {
        }
    }

    private static int TryGetExitCode(Process process)
    {
        try
        {
            return process.HasExited ? process.ExitCode : -1;
        }
        catch
        {
            return -1;
        }
    }

    public async ValueTask DisposeAsync()
    {
        Stop();
        try
        {
            await Completion.ConfigureAwait(false);
        }
        catch
        {
        }
        finally
        {
            _cancellation.Dispose();
            _process.Dispose();
        }
    }
}

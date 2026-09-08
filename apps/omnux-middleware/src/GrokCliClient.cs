using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

public sealed record GrokConnectionStatus(
    [property: JsonPropertyName("installed")] bool Installed,
    [property: JsonPropertyName("authenticated")] bool Authenticated,
    [property: JsonPropertyName("mode")] string Mode,
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("loginUrl")] string LoginUrl = "",
    [property: JsonPropertyName("userCode")] string UserCode = ""
);
internal sealed record GrokCliProcessResult(int ExitCode, string StdOut, string StdErr);

/// <summary>Grok Build의 OAuth 저장·갱신을 공식 CLI에 위임한다. 토큰 파일을 읽거나 복사하지 않는다.</summary>
public sealed class GrokCliClient : IDisposable
{
    private readonly string _binary;
    private readonly Func<ProcessStartInfo, Action<string>?, CancellationToken, Task<GrokCliProcessResult>> _run;
    private readonly object _gate = new();
    private CancellationTokenSource? _loginCancellation;
    private Task? _loginTask;
    private GrokConnectionStatus _loginStatus = new(false, false, "unknown", "연결 상태를 확인해 주세요.");

    public GrokCliClient(string binary = "grok") : this(binary, RunProcessAsync) { }

    internal GrokCliClient(string binary, Func<ProcessStartInfo, Action<string>?, CancellationToken, Task<GrokCliProcessResult>> run)
    {
        _binary = binary;
        _run = run;
    }

    public async Task<GrokConnectionStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            if (_loginTask is { IsCompleted: false }) return _loginStatus;
        }
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        try
        {
            var version = await _run(StartInfo(new[] { "version" }), null, timeout.Token);
            if (version.ExitCode != 0) return new(false, false, "not_installed", "Grok Build CLI를 설치해 주세요.");
            var models = await _run(StartInfo(new[] { "--no-auto-update", "models" }), null, timeout.Token);
            return ParseStatus(models);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new(true, false, "timeout", "Grok 연결 상태 확인 시간이 초과됐습니다.");
        }
    }

    public async Task<IReadOnlyList<string>> GetModelsAsync(CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        var result = await _run(StartInfo(new[] { "--no-auto-update", "models" }), null, timeout.Token);
        return result.ExitCode == 0 ? ParseModelIds(result.StdOut) : Array.Empty<string>();
    }

    public GrokConnectionStatus LoginStatus { get { lock (_gate) return _loginStatus; } }

    public string StartLogin(CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            if (_loginTask is { IsCompleted: false }) return "Grok 로그인이 진행 중입니다.";
            _loginCancellation?.Dispose();
            _loginCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            _loginCancellation.CancelAfter(TimeSpan.FromMinutes(10));
            _loginStatus = new(true, false, "oauth_pending", "로그인 코드를 준비하고 있습니다.");
            _loginTask = CompleteLoginAsync(_loginCancellation.Token);
            return "Grok OAuth 로그인을 시작했습니다.";
        }
    }

    private async Task CompleteLoginAsync(CancellationToken token)
    {
        try
        {
            var result = await _run(StartInfo(new[] { "--no-auto-update", "login", "--device-auth" }), ObserveLoginLine, token);
            lock (_gate)
            {
                _loginStatus = result.ExitCode == 0
                    ? new(true, true, "oauth", "Grok 로그인을 완료했습니다.")
                    : new(result.ExitCode != 127, false, "error", "Grok 로그인에 실패했습니다. CLI 설치와 네트워크를 확인해 주세요.");
            }
        }
        catch (OperationCanceledException)
        {
            lock (_gate) _loginStatus = new(true, false, "canceled", "Grok 로그인이 취소되거나 시간이 초과됐습니다.");
        }
        catch (Exception)
        {
            lock (_gate) _loginStatus = new(true, false, "error", "Grok 로그인을 시작하지 못했습니다.");
        }
    }

    private void ObserveLoginLine(string line)
    {
        // CLI의 원문 로그나 토큰을 UI로 전달하지 않는다. 인증 URL과 사용자 코드만 추출한다.
        var clean = StripAnsi(line);
        var url = Regex.Match(clean, @"https://(?:accounts\.x\.ai|auth\.x\.ai)/[^\s<>""']+").Value;
        var labeledCode = Regex.Match(clean, @"(?:^|\s)(?i:user[ _]code|verification code|code)\s*:\s*([A-Za-z0-9-]{4,32})\b");
        var code = labeledCode.Success ? labeledCode.Groups[1].Value : Regex.Match(clean, @"\b[A-Z0-9]{4}-[A-Z0-9]{4}\b").Value;
        lock (_gate)
        {
            _loginStatus = _loginStatus with
            {
                LoginUrl = string.IsNullOrEmpty(url) ? _loginStatus.LoginUrl : url,
                UserCode = string.IsNullOrEmpty(code) ? _loginStatus.UserCode : code,
                Message = "표시된 주소에서 로그인 코드를 입력해 주세요."
            };
        }
    }

    public void CancelLogin()
    {
        lock (_gate) _loginCancellation?.Cancel();
    }

    public async Task<bool> LogoutAsync(CancellationToken token)
    {
        CancelLogin();
        var result = await _run(StartInfo(new[] { "--no-auto-update", "logout" }), null, token);
        lock (_gate) _loginStatus = new(true, false, "signed_out", "Grok에서 로그아웃했습니다.");
        return result.ExitCode == 0;
    }

    public async Task<string> GenerateTextAsync(string prompt, string model, CancellationToken token)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(prompt);
        ArgumentException.ThrowIfNullOrWhiteSpace(model);
        var directory = Directory.CreateTempSubdirectory("omnux-grok-").FullName;
        try
        {
            var promptPath = Path.Combine(directory, "prompt.txt");
            await File.WriteAllTextAsync(promptPath, prompt, token);
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(promptPath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            var info = StartInfo(new[] {
                "--no-auto-update", "--prompt-file", promptPath, "--model", model,
                "--output-format", "plain", "--verbatim", "--max-turns", "1",
                "--deny", "*", "--no-plan", "--no-subagents", "--no-memory", "--disable-web-search"
            });
            info.WorkingDirectory = directory;
            var result = await _run(info, null, token);
            if (result.ExitCode != 0) throw new InvalidOperationException($"Grok CLI 실행 실패 (exit={result.ExitCode}). 로그인 상태와 선택한 모델을 확인해 주세요.");
            var text = StripAnsi(result.StdOut).Trim();
            if (text.Length == 0) throw new InvalidOperationException("Grok 응답이 비어 있습니다.");
            return text;
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    private ProcessStartInfo StartInfo(IEnumerable<string> arguments)
    {
        var info = new ProcessStartInfo(_binary) {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = true
        };
        foreach (var argument in arguments) info.ArgumentList.Add(argument);
        return info;
    }

    internal static GrokConnectionStatus ParseStatus(GrokCliProcessResult result)
    {
        var output = StripAnsi(result.StdOut);
        if (result.ExitCode != 0 || output.Contains("You are not authenticated.", StringComparison.Ordinal))
            return new(true, false, "signed_out", "Grok OAuth 로그인이 필요합니다.");
        if (output.Contains("You are logged in with ", StringComparison.Ordinal))
            return new(true, true, "oauth", "Grok OAuth가 연결되어 있습니다.");
        if (output.Contains("You are using XAI_API_KEY.", StringComparison.Ordinal)
            || output.Contains("is using its own API key.", StringComparison.Ordinal)
            || output.Contains("You are authenticated via deployment key.", StringComparison.Ordinal))
            return new(true, true, "api_key", "Grok CLI 인증이 연결되어 있습니다.");
        return new(true, false, "unknown", "Grok 인증 상태를 확인하지 못했습니다.");
    }

    internal static IReadOnlyList<string> ParseModelIds(string output)
        => Regex.Matches(StripAnsi(output), @"(?m)^\s+[*-]\s+([a-zA-Z0-9][a-zA-Z0-9._/-]*)")
            .Select(match => match.Groups[1].Value).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

    private static string StripAnsi(string value) => Regex.Replace(value, "\u001b\\[[0-9;]*[A-Za-z]", "");

    private static async Task<GrokCliProcessResult> RunProcessAsync(ProcessStartInfo info, Action<string>? onLine, CancellationToken token)
    {
        using var process = new Process { StartInfo = info };
        try { process.Start(); }
        catch (System.ComponentModel.Win32Exception) { return new(127, "", "CLI not found"); }
        process.StandardInput.Close();
        async Task<string> ReadAsync(StreamReader reader)
        {
            var buffer = new StringBuilder();
            while (await reader.ReadLineAsync(token) is { } line)
            {
                onLine?.Invoke(line);
                if (buffer.Length < 2_000_000) buffer.AppendLine(line);
            }
            return buffer.ToString();
        }
        var stdout = ReadAsync(process.StandardOutput);
        var stderr = ReadAsync(process.StandardError);
        try
        {
            await process.WaitForExitAsync(token);
            return new(process.ExitCode, await stdout, await stderr);
        }
        finally
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync(CancellationToken.None);
            try { await Task.WhenAll(stdout, stderr); } catch (OperationCanceledException) { }
        }
    }

    public void Dispose()
    {
        CancelLogin();
        _loginCancellation?.Dispose();
    }
}

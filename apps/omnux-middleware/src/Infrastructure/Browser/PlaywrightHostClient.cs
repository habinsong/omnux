using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class PlaywrightHostClient : IDisposable
{
    private readonly string _workingDirectory;
    private readonly string _nodeBinary;
    private readonly bool _headless;
    private readonly object _profilesLock = new();
    private readonly Dictionary<string, Host> _profiles = new(StringComparer.OrdinalIgnoreCase);
    private bool _disposed;

    public PlaywrightHostClient(AppConfig config, string nodeBinary = "node")
    {
        _nodeBinary = nodeBinary;
        _headless = (Env.Get("OMNUX_BROWSER_HEADLESS") ?? "true").Trim().ToLowerInvariant() is not ("false" or "0" or "off" or "no");
        _workingDirectory = FindNodeWorkspace(config.DashboardIndexPath, config.WorkspaceRootDir);
    }

    public JsonElement Execute(PlaywrightHostRequest request)
    {
        Host host;
        lock (_profilesLock)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (!_profiles.TryGetValue(request.Profile, out host!)) _profiles[request.Profile] = host = new Host();
        }
        lock (host.Gate)
        {
            if (request.Action is "status" or "tabs" or "stop" or "hide" && !host.IsAlive)
            {
                host.Stop();
                return Inactive(request);
            }
            try
            {
                if (!host.IsAlive) Start(host);
                host.Process!.StandardInput.WriteLine(JsonSerializer.Serialize(request, PlaywrightHostJsonContext.Default.PlaywrightHostRequest));
                host.Process.StandardInput.Flush();
                var read = host.Process.StandardOutput.ReadLineAsync();
                if (!read.Wait(TimeSpan.FromSeconds(20))) throw new TimeoutException("브라우저 응답 시간이 초과되었습니다.");
                var line = read.GetAwaiter().GetResult();
                if (string.IsNullOrWhiteSpace(line)) throw new IOException(host.LastError ?? "브라우저 실행기가 응답 없이 종료되었습니다.");
                using var response = JsonDocument.Parse(line);
                if (response.RootElement.GetProperty("requestId").GetString() != request.RequestId) throw new InvalidDataException("브라우저 응답의 요청 식별자가 다릅니다.");
                var result = response.RootElement.Clone();
                if (request.Action == "stop") host.Stop();
                return result;
            }
            catch (Exception error)
            {
                host.Stop();
                return Inactive(request, error.GetBaseException().Message);
            }
        }
    }

    private void Start(Host host)
    {
        host.Stop();
        var start = new ProcessStartInfo
        {
            FileName = _nodeBinary, WorkingDirectory = _workingDirectory, UseShellExecute = false,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
            StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8, CreateNoWindow = true
        };
        start.ArgumentList.Add("-e");
        start.ArgumentList.Add(ReadScript("A2UiRenderer.cjs") + "\n" + ReadScript("PlaywrightHost.cjs"));
        start.Environment["OMNUX_BROWSER_HEADLESS"] = _headless ? "true" : "false";
        var process = new Process { StartInfo = start };
        host.Process = process;
        process.ErrorDataReceived += (_, args) => { if (args.Data is { Length: > 0 } line) host.LastError = line.Length > 1000 ? line[..1000] : line; };
        if (!process.Start()) throw new IOException("브라우저 실행기를 시작하지 못했습니다.");
        process.BeginErrorReadLine();
    }

    private static string ReadScript(string name)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Omnux.Browser." + name)
            ?? throw new InvalidOperationException($"브라우저 실행 파일이 빌드에 없습니다: {name}");
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }

    private static string FindNodeWorkspace(string dashboard, string workspace)
    {
        foreach (var path in new[] { Path.GetDirectoryName(Path.GetFullPath(dashboard)), Path.GetFullPath(workspace), AppContext.BaseDirectory, Environment.CurrentDirectory })
        {
            var directory = string.IsNullOrWhiteSpace(path) ? null : new DirectoryInfo(path);
            while (directory != null)
            {
                if (File.Exists(Path.Combine(directory.FullName, "node_modules", "playwright", "package.json"))) return directory.FullName;
                directory = directory.Parent;
            }
        }
        return Environment.CurrentDirectory;
    }

    private static JsonElement Inactive(PlaywrightHostRequest request, string? error = null)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject(); writer.WriteString("requestId", request.RequestId);
            writer.WriteString("action", request.Action); writer.WriteString("profile", request.Profile);
            writer.WriteString("adapter", "playwright"); writer.WriteBoolean("running", false);
            writer.WriteBoolean("ok", error == null); writer.WriteBoolean("visible", false);
            writer.WriteNumber("updatedAtMs", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            writer.WriteStartArray("tabs"); writer.WriteEndArray();
            if (error != null) writer.WriteString("error", error);
            writer.WriteEndObject();
        }
        using var document = JsonDocument.Parse(stream.ToArray());
        return document.RootElement.Clone();
    }

    public void Dispose()
    {
        lock (_profilesLock)
        {
            _disposed = true;
            foreach (var host in _profiles.Values) lock (host.Gate) host.Stop();
            _profiles.Clear();
        }
    }

    private sealed class Host
    {
        public readonly object Gate = new();
        public Process? Process;
        public string? LastError;
        public bool IsAlive { get { try { return Process != null && !Process.HasExited; } catch (InvalidOperationException) { return false; } } }
        public void Stop()
        {
            if (Process == null) return;
            try { if (!Process.HasExited) { Process.StandardInput.Close(); if (!Process.WaitForExit(1500)) Process.Kill(entireProcessTree: true); } }
            catch (Exception error) when (error is InvalidOperationException or IOException or System.ComponentModel.Win32Exception) { }
            finally { Process.Dispose(); Process = null; LastError = null; }
        }
    }
}

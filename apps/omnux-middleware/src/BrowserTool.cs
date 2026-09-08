using System.Text.Json;

namespace Omnux.Middleware;

public sealed record BrowserToolTab(string TargetId, string Url, string Title, bool Active, long UpdatedAtMs);
public sealed record BrowserToolSnapshot(string SnapshotId, string Format, int Width, int Height, long UpdatedAtMs, string DataUrl);
public sealed record BrowserToolResult(
    bool Ok, string Action, string Profile, bool Disabled, string Adapter, bool Running,
    string? ActiveTargetId, string? ActiveUrl, IReadOnlyList<BrowserToolTab> Tabs, string? Error,
    BrowserToolSnapshot? Snapshot = null
);

public sealed class BrowserTool : IDisposable
{
    private readonly PlaywrightHostClient _host;
    private readonly string _mode;

    public BrowserTool(AppConfig config) : this(config, "node") { }
    internal BrowserTool(AppConfig config, string nodeBinary)
    {
        _host = new PlaywrightHostClient(config, nodeBinary);
        _mode = (Env.Get("OMNUX_BROWSER_TOOL_MODE") ?? "auto").Trim().ToLowerInvariant();
    }

    public BrowserToolResult Execute(string? action, string? targetUrl = null, string? profile = null, string? targetId = null, int? limit = null)
    {
        var operation = (action ?? string.Empty).Trim().ToLowerInvariant();
        var name = string.IsNullOrWhiteSpace(profile) ? "default" : profile.Trim();
        if (_mode is "off" or "stub") return Failure(operation, name, "실제 브라우저를 사용하려면 OMNUX_BROWSER_TOOL_MODE를 auto 또는 playwright로 설정해 주세요.", true);
        if (operation is not ("status" or "start" or "stop" or "tabs" or "navigate" or "open" or "focus" or "close" or "snapshot")) return Failure(operation, name, "지원하지 않는 브라우저 동작입니다.");
        var response = _host.Execute(new PlaywrightHostRequest(Guid.NewGuid().ToString("N"), operation, name, "browser", targetUrl, targetId, Math.Clamp(limit ?? 100, 1, 100)));
        var tabs = PlaywrightHostResult.Array(response, "tabs").Select(tab => new BrowserToolTab(
            PlaywrightHostResult.Text(tab, "targetId") ?? string.Empty,
            PlaywrightHostResult.Text(tab, "url") ?? string.Empty,
            PlaywrightHostResult.Text(tab, "title") ?? string.Empty,
            PlaywrightHostResult.Flag(tab, "active"), PlaywrightHostResult.Number(tab, "updatedAtMs"))).ToArray();
        return new BrowserToolResult(PlaywrightHostResult.Flag(response, "ok"), operation, name, false, "playwright",
            PlaywrightHostResult.Flag(response, "running"), PlaywrightHostResult.Text(response, "activeTargetId"),
            PlaywrightHostResult.Text(response, "activeUrl"), tabs, PlaywrightHostResult.Text(response, "error"), PlaywrightHostResult.Snapshot(response));
    }

    private static BrowserToolResult Failure(string action, string profile, string error, bool disabled = false)
        => new(false, action, profile, disabled, disabled ? "disabled" : "playwright", false, null, null, Array.Empty<BrowserToolTab>(), error);

    public void Dispose() => _host.Dispose();
}

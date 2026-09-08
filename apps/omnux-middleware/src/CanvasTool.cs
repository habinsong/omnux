using System.Text.Json;

namespace Omnux.Middleware;

public sealed record CanvasToolSnapshot(string SnapshotId, string Format, int Width, int Height, long UpdatedAtMs, string? DataUrl = null);
public sealed record CanvasToolResult(
    bool Ok, string Action, string Profile, bool Disabled, string Adapter, bool Visible,
    string? Target, string? Url, string? EvalResult, CanvasToolSnapshot? Snapshot,
    int A2UiRevision, long UpdatedAtMs, string? Error, IReadOnlyList<JsonElement>? ActionEvents = null
);

public sealed class CanvasTool : IDisposable
{
    private readonly PlaywrightHostClient _host;
    private readonly string _mode;

    public CanvasTool(AppConfig config) : this(config, "node") { }
    internal CanvasTool(AppConfig config, string nodeBinary)
    {
        _host = new PlaywrightHostClient(config, nodeBinary);
        _mode = (Env.Get("OMNUX_CANVAS_TOOL_MODE") ?? "auto").Trim().ToLowerInvariant();
    }

    public CanvasToolResult Execute(string? action, string? profile = null, string? target = null, string? targetUrl = null,
        string? javaScript = null, string? jsonl = null, string? outputFormat = null, int? maxWidth = null)
    {
        var operation = (action ?? string.Empty).Trim().ToLowerInvariant();
        var name = string.IsNullOrWhiteSpace(profile) ? "default" : profile.Trim();
        if (_mode is "off" or "stub") return Failure(operation, name, "실제 캔버스를 사용하려면 OMNUX_CANVAS_TOOL_MODE를 auto 또는 playwright로 설정해 주세요.", true);
        if (operation is not ("status" or "present" or "hide" or "navigate" or "eval" or "snapshot" or "a2ui_push" or "a2ui_reset")) return Failure(operation, name, "지원하지 않는 캔버스 동작입니다.");
        var address = string.IsNullOrWhiteSpace(targetUrl) ? target : targetUrl;
        var response = _host.Execute(new PlaywrightHostRequest(Guid.NewGuid().ToString("N"), operation, name, "canvas",
            address, JavaScript: javaScript, Jsonl: jsonl, OutputFormat: outputFormat, MaxWidth: maxWidth));
        var image = PlaywrightHostResult.Snapshot(response);
        var snapshot = image == null ? null : new CanvasToolSnapshot(image.SnapshotId, image.Format, image.Width, image.Height, image.UpdatedAtMs, image.DataUrl);
        return new CanvasToolResult(PlaywrightHostResult.Flag(response, "ok"), operation, name, false, "playwright",
            PlaywrightHostResult.Flag(response, "visible"), PlaywrightHostResult.Text(response, "activeTargetId"),
            PlaywrightHostResult.Text(response, "activeUrl"), PlaywrightHostResult.Text(response, "evalResult"), snapshot,
            (int)PlaywrightHostResult.Number(response, "a2UiRevision"), PlaywrightHostResult.Number(response, "updatedAtMs"),
            PlaywrightHostResult.Text(response, "error"), PlaywrightHostResult.Array(response, "actionEvents"));
    }

    private static CanvasToolResult Failure(string action, string profile, string error, bool disabled = false)
        => new(false, action, profile, disabled, disabled ? "disabled" : "playwright", false, null, null, null, null, 0, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), error);

    public void Dispose() => _host.Dispose();
}

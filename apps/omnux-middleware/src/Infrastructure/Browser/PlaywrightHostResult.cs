using System.Text.Json;

namespace Omnux.Middleware;

internal static class PlaywrightHostResult
{
    public static string? Text(JsonElement value, string key) => value.TryGetProperty(key, out var item) && item.ValueKind == JsonValueKind.String ? item.GetString() : null;
    public static bool Flag(JsonElement value, string key) => value.TryGetProperty(key, out var item) && item.ValueKind == JsonValueKind.True;
    public static long Number(JsonElement value, string key) => value.TryGetProperty(key, out var item) && item.TryGetInt64(out var number) ? number : 0;
    public static JsonElement[] Array(JsonElement value, string key) => value.TryGetProperty(key, out var item) && item.ValueKind == JsonValueKind.Array ? item.EnumerateArray().Select(element => element.Clone()).ToArray() : [];
    public static BrowserToolSnapshot? Snapshot(JsonElement value)
    {
        if (!value.TryGetProperty("snapshot", out var image) || image.ValueKind != JsonValueKind.Object) return null;
        var dataUrl = Text(image, "dataUrl");
        return string.IsNullOrEmpty(dataUrl) ? null : new BrowserToolSnapshot(Text(image, "snapshotId") ?? "", Text(image, "format") ?? "png",
            (int)Number(image, "width"), (int)Number(image, "height"), Number(image, "updatedAtMs"), dataUrl);
    }
}

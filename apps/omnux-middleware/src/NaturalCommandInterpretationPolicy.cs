using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal static class NaturalCommandInterpretationPolicy
{
    private static readonly Regex CodeFenceRegex = new("```([a-zA-Z0-9#+._-]*)\\s*\\n(.*?)```", RegexOptions.Compiled | RegexOptions.Singleline);
    private static readonly Regex JsonTrailingCommaRegex = new(@",\s*([}\]])", RegexOptions.Compiled);

    public static bool TryParseNaturalCommandInterpretation(string raw, out NaturalCommandInterpretation interpretation)
    {
        interpretation = new NaturalCommandInterpretation("chat", string.Empty, new Dictionary<string, string>(), 0d, string.Empty);
        if (!TryExtractJsonObject(raw, out var json))
        {
            return false;
        }

        try
        {
            using var doc = JsonDocument.Parse(NormalizeNaturalCommandJson(json));
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            var kind = TryReadJsonString(root, "kind");
            var command = TryReadJsonString(root, "command");
            var reason = TryReadJsonString(root, "reason");
            var confidence = TryReadJsonDouble(root, "confidence");
            var args = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (TryGetPropertyIgnoreCase(root, "args", out var argsElement)
                && argsElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in argsElement.EnumerateObject())
                {
                    if (prop.Value.ValueKind == JsonValueKind.String)
                    {
                        args[prop.Name] = (prop.Value.GetString() ?? string.Empty).Trim();
                        continue;
                    }

                    if (prop.Value.ValueKind == JsonValueKind.Number)
                    {
                        args[prop.Name] = prop.Value.GetRawText();
                        continue;
                    }

                    if (prop.Value.ValueKind == JsonValueKind.True || prop.Value.ValueKind == JsonValueKind.False)
                    {
                        args[prop.Name] = prop.Value.GetBoolean() ? "true" : "false";
                    }
                }
            }

            var normalizedKind = (kind ?? string.Empty).Trim().ToLowerInvariant();
            if (normalizedKind is not ("command" or "chat"))
            {
                normalizedKind = string.IsNullOrWhiteSpace(command) ? "chat" : "command";
            }

            if (confidence <= 0d)
            {
                confidence = normalizedKind == "command" ? 0.51d : 0.99d;
            }

            interpretation = new NaturalCommandInterpretation(
                normalizedKind,
                (command ?? string.Empty).Trim().ToLowerInvariant(),
                args,
                Math.Clamp(confidence, 0d, 1d),
                (reason ?? string.Empty).Trim()
            );
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string NormalizeNaturalCommandJson(string json)
    {
        var normalized = (json ?? string.Empty).Trim();
        normalized = normalized
            .Replace('“', '"')
            .Replace('”', '"')
            .Replace('’', '\'');
        normalized = JsonTrailingCommaRegex.Replace(normalized, "$1");
        return normalized;
    }

    private static bool TryExtractJsonObject(string raw, out string json)
    {
        json = string.Empty;
        var normalized = (raw ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return false;
        }

        var fence = CodeFenceRegex.Match(normalized);
        if (fence.Success && fence.Groups.Count >= 3)
        {
            normalized = fence.Groups[2].Value.Trim();
        }

        var start = normalized.IndexOf('{');
        var end = normalized.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            return false;
        }

        json = normalized[start..(end + 1)];
        return true;
    }

    private static string? TryReadJsonString(JsonElement root, string property)
    {
        if (!TryGetPropertyIgnoreCase(root, property, out var value))
        {
            return null;
        }

        return value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    }

    private static double TryReadJsonDouble(JsonElement root, string property)
    {
        if (!TryGetPropertyIgnoreCase(root, property, out var value))
        {
            return 0d;
        }

        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var numeric))
        {
            return numeric;
        }

        if (value.ValueKind == JsonValueKind.String
            && double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        return 0d;
    }

    private static bool TryGetPropertyIgnoreCase(JsonElement root, string property, out JsonElement value)
    {
        foreach (var prop in root.EnumerateObject())
        {
            if (prop.NameEquals(property) || prop.Name.Equals(property, StringComparison.OrdinalIgnoreCase))
            {
                value = prop.Value;
                return true;
            }
        }

        value = default;
        return false;
    }
}

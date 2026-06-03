using System.Globalization;
using System.Text.Json;

namespace Omnux.Middleware;

public sealed partial class MemorySearchTool
{
    private static string? BuildFtsQuery(string raw)
    {
        var tokens = ExtractTokens(raw);
        if (tokens.Length == 0)
        {
            return null;
        }

        var keywords = tokens
            .Where(IsRelaxedKeyword)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(16)
            .ToArray();
        if (keywords.Length == 0)
        {
            keywords = tokens
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(16)
                .ToArray();
        }

        return string.Join(" AND ", keywords.Select(QuoteToken));
    }

    private static string? BuildRelaxedFtsQuery(string raw)
    {
        var tokens = ExtractTokens(raw);
        if (tokens.Length == 0)
        {
            return null;
        }

        var keywords = tokens
            .Where(IsRelaxedKeyword)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToArray();

        if (keywords.Length == 0)
        {
            keywords = tokens
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(8)
                .ToArray();
        }

        if (keywords.Length == 0)
        {
            return null;
        }

        return string.Join(" OR ", keywords.Select(QuoteToken));
    }

    private static string[] ExtractTokens(string raw)
    {
        return FtsTokenRegex
            .Matches(raw)
            .Select(match => match.Value.Trim())
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Take(24)
            .ToArray();
    }

    private static bool IsRelaxedKeyword(string token)
    {
        var normalized = (token ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        if (FtsStopWords.Contains(normalized))
        {
            return false;
        }

        if (normalized.Length >= 2)
        {
            return true;
        }

        return normalized.Any(char.IsDigit);
    }

    private static string QuoteToken(string token)
    {
        return $"\"{token.Replace("\"", string.Empty, StringComparison.Ordinal)}\"";
    }

    private static string BuildSearchSql(string ftsQuery, int candidateLimit)
    {
        return
            "WITH ranked AS ("
            + " SELECT chunks_fts.path, chunks_fts.source, chunks_fts.start_line, chunks_fts.end_line,"
            + " chunks_fts.text, chunks.memory_tier, chunks.last_accessed_at, bm25(chunks_fts) AS rank"
            + " FROM chunks_fts JOIN chunks ON chunks.id = chunks_fts.id"
            + $" WHERE chunks_fts MATCH '{EscapeSql(ftsQuery)}'"
            + " ORDER BY rank ASC"
            + $" LIMIT {candidateLimit}"
            + ")"
            + " SELECT COALESCE(json_group_array(json_object("
            + " 'path', path,"
            + " 'source', source,"
            + " 'startLine', start_line,"
            + " 'endLine', end_line,"
            + " 'snippet', text,"
            + " 'memoryTier', memory_tier,"
            + " 'lastAccessedAt', last_accessed_at,"
            + " 'rank', rank"
            + " )), '[]')"
            + " FROM ranked;";
    }

    private IReadOnlyList<SearchRow> QueryRows(string ftsQuery, int candidateLimit)
    {
        var jsonRows = QuerySingleValue(BuildSearchSql(ftsQuery, candidateLimit));
        return ParseRows(jsonRows);
    }

    private static IReadOnlyList<SearchRow> ParseRows(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<SearchRow>();
        }

        using var document = JsonDocument.Parse(json);
        if (document.RootElement.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<SearchRow>();
        }

        var rows = new List<SearchRow>(document.RootElement.GetArrayLength());
        foreach (var item in document.RootElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            rows.Add(new SearchRow(
                GetString(item, "path"),
                GetString(item, "source"),
                GetString(item, "snippet"),
                GetInt(item, "startLine"),
                GetInt(item, "endLine"),
                GetString(item, "memoryTier"),
                GetLong(item, "lastAccessedAt"),
                GetDouble(item, "rank")
            ));
        }

        return rows;
    }

    private static string GetString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            return string.Empty;
        }

        return value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : string.Empty;
    }

    private static int GetInt(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            return 0;
        }

        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var intValue))
        {
            return intValue;
        }

        return value.ValueKind == JsonValueKind.String
               && int.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : 0;
    }

    private static long GetLong(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            return 0L;
        }

        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var longValue))
        {
            return longValue;
        }

        return value.ValueKind == JsonValueKind.String
               && long.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : 0L;
    }

    private static double GetDouble(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            return 0d;
        }

        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var doubleValue))
        {
            return doubleValue;
        }

        return value.ValueKind == JsonValueKind.String
               && double.TryParse(
                   value.GetString(),
                   NumberStyles.Float | NumberStyles.AllowThousands,
                   CultureInfo.InvariantCulture,
                   out var parsed
               )
            ? parsed
            : 0d;
    }

    private sealed record SearchRow(
        string Path,
        string Source,
        string Snippet,
        int StartLine,
        int EndLine,
        string MemoryTier,
        long LastAccessedAt,
        double Rank
    );
}

using System.Text.Json;

namespace Omnux.Middleware;

public sealed record GroqCompoundSearchSource(string Title, string Url, string Snippet);

public sealed record GroqCompoundWebAnswer(
    string Text,
    IReadOnlyList<GroqCompoundSearchSource> Sources,
    string Model
);

/// <summary>
/// Groq compound(서버측 Tavily 웹검색 내장, OpenAI 호환) 응답 파서 — 웹검색 폴백 체인용
/// (ASK_ORCHESTRATION_PLAN.md P0-4). Gemini grounding 이 키/쿼터/타임아웃으로 죽었을 때
/// "검색 실패"로 끝내는 대신 compound 가 최후 폴백으로 답한다.
/// 실측 응답 형태(2026-06): choices[0].message.content + message.executed_tools[].search_results
/// = [{title,url,content,score}] 배열. 방어적으로 {results:[...]} 래핑도 허용한다.
/// </summary>
public static class GroqCompoundResponseParser
{
    public const string DefaultCompoundModel = "groq/compound-mini";
    public const int MaxSources = 8;
    public const int SourceSnippetMaxChars = 300;

    private const string ModelEnvName = "OMNUX_GROQ_COMPOUND_MODEL";

    public static string ResolveCompoundModel()
    {
        var raw = (Environment.GetEnvironmentVariable(ModelEnvName) ?? string.Empty).Trim();
        return raw.Length > 0 ? raw : DefaultCompoundModel;
    }

    public static GroqCompoundWebAnswer? TryParse(string? responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(responseBody);
            var root = doc.RootElement;
            if (!root.TryGetProperty("choices", out var choices)
                || choices.ValueKind != JsonValueKind.Array
                || choices.GetArrayLength() == 0)
            {
                return null;
            }

            var message = choices[0].TryGetProperty("message", out var messageElement)
                && messageElement.ValueKind == JsonValueKind.Object
                ? messageElement
                : default;
            if (message.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var text = message.TryGetProperty("content", out var contentElement)
                && contentElement.ValueKind == JsonValueKind.String
                ? (contentElement.GetString() ?? string.Empty).Trim()
                : string.Empty;
            if (text.Length == 0)
            {
                return null;
            }

            var model = root.TryGetProperty("model", out var modelElement)
                && modelElement.ValueKind == JsonValueKind.String
                ? (modelElement.GetString() ?? string.Empty).Trim()
                : string.Empty;
            if (model.Length == 0)
            {
                model = DefaultCompoundModel;
            }

            return new GroqCompoundWebAnswer(text, CollectSources(message), model);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IReadOnlyList<GroqCompoundSearchSource> CollectSources(JsonElement message)
    {
        if (!message.TryGetProperty("executed_tools", out var tools)
            || tools.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<GroqCompoundSearchSource>();
        }

        var sources = new List<GroqCompoundSearchSource>();
        var seenUrls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var tool in tools.EnumerateArray())
        {
            if (tool.ValueKind != JsonValueKind.Object
                || !tool.TryGetProperty("search_results", out var searchResults))
            {
                continue;
            }

            var items = searchResults.ValueKind switch
            {
                JsonValueKind.Array => searchResults,
                JsonValueKind.Object when searchResults.TryGetProperty("results", out var wrapped)
                    && wrapped.ValueKind == JsonValueKind.Array => wrapped,
                _ => default
            };
            if (items.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var item in items.EnumerateArray())
            {
                if (sources.Count >= MaxSources)
                {
                    return sources;
                }

                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var url = ReadString(item, "url");
                if (url.Length == 0 || !seenUrls.Add(url))
                {
                    continue;
                }

                var title = ReadString(item, "title");
                var snippet = ReadString(item, "content");
                if (snippet.Length > SourceSnippetMaxChars)
                {
                    snippet = snippet[..SourceSnippetMaxChars] + "…";
                }

                sources.Add(new GroqCompoundSearchSource(
                    title.Length > 0 ? title : url,
                    url,
                    snippet
                ));
            }
        }

        return sources;
    }

    private static string ReadString(JsonElement element, string property)
    {
        return element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? (value.GetString() ?? string.Empty).Trim()
            : string.Empty;
    }
}

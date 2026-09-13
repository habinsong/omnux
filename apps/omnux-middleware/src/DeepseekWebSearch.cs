using System.Text;
using System.Text.Json;

namespace Omnux.Middleware;

public sealed record DeepseekWebSource(string Title, string Url);

public sealed record DeepseekWebAnswer(
    string Text,
    IReadOnlyList<DeepseekWebSource> Sources,
    string Model
);

/// <summary>
/// DeepSeek 의 서버측 웹 검색 응답 파서.
///
/// DeepSeek 는 OpenAI 호환 엔드포인트에는 서버 검색이 없고, Anthropic 호환 엔드포인트
/// (<c>/anthropic/v1/messages</c>)에서만 <c>web_search_20250305</c> 서버툴을 받는다.
/// (2026-09-13 실키 호출로 확인: server_tool_use → web_search_tool_result 로 결과가 온다)
/// 응답은 thinking / text / server_tool_use / web_search_tool_result 블록이 섞여 오므로
/// 본문 text 만 이어 붙이고 출처는 web_search_result 에서 뽑는다.
/// </summary>
public static class DeepseekWebSearchParser
{
    public const int MaxSources = 8;
    public const int DefaultMaxUses = 4;

    /// <summary>Anthropic 호환 요청 본문. tools 배열 형식은 Anthropic Messages 규격 그대로다.</summary>
    public static string BuildRequestJson(string model, string systemPrompt, string userInput, int maxTokens)
    {
        var builder = new StringBuilder();
        builder.Append('{');
        builder.Append($"\"model\":\"{EscapeJson(model)}\",");
        builder.Append($"\"max_tokens\":{Math.Clamp(maxTokens, 256, 8192)},");
        if (!string.IsNullOrWhiteSpace(systemPrompt))
        {
            builder.Append($"\"system\":\"{EscapeJson(systemPrompt)}\",");
        }

        builder.Append($"\"tools\":[{{\"type\":\"web_search_20250305\",\"name\":\"web_search\",\"max_uses\":{DefaultMaxUses}}}],");
        builder.Append("\"messages\":[{\"role\":\"user\",\"content\":\"");
        builder.Append(EscapeJson(userInput));
        builder.Append("\"}]}");
        return builder.ToString();
    }

    public static DeepseekWebAnswer? TryParse(string? responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(responseBody);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("content", out var content)
                || content.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            var text = new StringBuilder();
            var sources = new List<DeepseekWebSource>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var block in content.EnumerateArray())
            {
                if (block.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var type = ReadString(block, "type");
                if (type == "text")
                {
                    var value = ReadString(block, "text");
                    if (value.Length > 0)
                    {
                        if (text.Length > 0)
                        {
                            text.Append('\n');
                        }

                        text.Append(value);
                    }

                    continue;
                }

                if (type != "web_search_tool_result"
                    || !block.TryGetProperty("content", out var results)
                    || results.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                foreach (var result in results.EnumerateArray())
                {
                    if (sources.Count >= MaxSources)
                    {
                        break;
                    }

                    if (result.ValueKind != JsonValueKind.Object
                        || ReadString(result, "type") != "web_search_result")
                    {
                        continue;
                    }

                    var url = ReadString(result, "url");
                    if (url.Length == 0 || !seen.Add(url))
                    {
                        continue;
                    }

                    var title = ReadString(result, "title");
                    sources.Add(new DeepseekWebSource(title.Length > 0 ? title : url, url));
                }
            }

            var answer = text.ToString().Trim();
            if (answer.Length == 0)
            {
                return null;
            }

            var model = ReadString(root, "model");
            return new DeepseekWebAnswer(answer, sources, model.Length > 0 ? model : "deepseek");
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string ReadString(JsonElement element, string property)
    {
        return element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? (value.GetString() ?? string.Empty).Trim()
            : string.Empty;
    }

    private static string EscapeJson(string value)
    {
        return (value ?? string.Empty)
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal)
            .Replace("\t", "\\t", StringComparison.Ordinal)
            .Replace("\b", "\\b", StringComparison.Ordinal)
            .Replace("\f", "\\f", StringComparison.Ordinal)
            .Replace("\r", "\\r", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal);
    }
}

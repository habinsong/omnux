using System.Text;
using System.Text.Json;

namespace Omnux.Middleware;

internal static class OpenAiCompatibleProtocol
{
    public static string BuildChatBody(
        string model,
        string systemPrompt,
        string userInput,
        List<(string Role, string Content)>? multiTurn,
        string maxTokensProperty,
        int maxOutputTokens,
        bool stream,
        IReadOnlyList<string>? extraProperties = null
    )
    {
        string messagesJson;
        if (multiTurn != null && multiTurn.Count > 1 && multiTurn[0].Role != "user")
        {
            var mb = new StringBuilder();
            mb.Append($"{{\"role\":\"system\",\"content\":\"{EscapeJson(systemPrompt)}\"}}");
            foreach (var (role, msgContent) in multiTurn)
            {
                var apiRole = role == "assistant" ? "assistant" : "user";
                mb.Append($",{{\"role\":\"{apiRole}\",\"content\":\"{EscapeJson(msgContent)}\"}}");
            }
            messagesJson = mb.ToString();
        }
        else
        {
            messagesJson = $"{{\"role\":\"system\",\"content\":\"{EscapeJson(systemPrompt)}\"}},"
                + $"{{\"role\":\"user\",\"content\":\"{EscapeJson(userInput)}\"}}";
        }

        var extras = extraProperties == null || extraProperties.Count == 0
            ? string.Empty
            : "," + string.Join(",", extraProperties);
        return "{"
            + $"\"model\":\"{EscapeJson(model)}\","
            + "\"temperature\":0.3,"
            + $"\"stream\":{(stream ? "true" : "false")},"
            + $"\"{EscapeJson(maxTokensProperty)}\":{maxOutputTokens},"
            + "\"messages\":["
            + messagesJson
            + "]"
            + extras
            + "}";
    }

    public static string BuildFailureMessage(
        string provider,
        System.Net.HttpStatusCode statusCode,
        string failureBody
    )
    {
        var name = DisplayName(provider);
        var statusInt = (int)statusCode;
        var lowered = (failureBody ?? string.Empty).ToLowerInvariant();
        var looksLikeQuota = lowered.Contains("quota")
                             || lowered.Contains("rate limit")
                             || lowered.Contains("rate_limit")
                             || lowered.Contains("too many requests")
                             || lowered.Contains("credits");

        if (string.Equals(provider, "nvidia", StringComparison.OrdinalIgnoreCase))
        {
            if (statusCode == System.Net.HttpStatusCode.TooManyRequests || looksLikeQuota)
            {
                return $"{name} 무료 할당량(또는 rate limit)에 도달했습니다 ({statusInt}). 잠시 후 다시 시도하거나 다른 provider(예: Cerebras·Groq·Gemini)로 바꿔 보세요.";
            }
            if (statusCode == System.Net.HttpStatusCode.Unauthorized || statusCode == System.Net.HttpStatusCode.Forbidden)
            {
                return $"{name} 인증 실패 ({statusInt}). API 키를 확인해 주세요.";
            }
            if (statusCode == System.Net.HttpStatusCode.ServiceUnavailable || statusCode == System.Net.HttpStatusCode.BadGateway)
            {
                return $"{name} 서버가 일시적으로 불안정합니다 ({statusInt}). 잠시 후 다시 시도해 주세요.";
            }
        }

        if (statusCode == System.Net.HttpStatusCode.TooManyRequests)
        {
            return $"{name} rate limit ({statusInt}). 잠시 후 다시 시도해 주세요.";
        }

        // 제공자를 가리지 않고 "무엇을 해야 하는지"까지 알려 준다. 숫자만 던지면 사용자가 못 고친다.
        if (statusCode == System.Net.HttpStatusCode.Unauthorized || statusCode == System.Net.HttpStatusCode.Forbidden)
        {
            return $"{name} 인증 실패 ({statusInt}). 설정 탭에서 {name} API 키를 다시 저장해 주세요.";
        }

        if (statusCode == System.Net.HttpStatusCode.PaymentRequired)
        {
            return $"{name} 결제 필요 ({statusInt}). 계정 크레딧이나 결제 수단을 확인하거나 다른 제공자를 골라 주세요.";
        }

        // 모델 이름이 틀렸을 때는 그렇게 말해 준다. 숫자만 주면 사용자도, 모델 체인도 원인을 모른다.
        if (ProviderModelAvailabilityPolicy.LooksLikeUnknownModel(failureBody))
        {
            return $"{name} 모델을 찾을 수 없습니다 ({statusInt}). {SummarizeFailureBody(failureBody)}";
        }

        // 그 외 실패도 본문 요약을 함께 준다. 숫자만 던지면 사용자가 고칠 수 없다.
        var summary = SummarizeFailureBody(failureBody);
        return summary.Length == 0
            ? $"{name} 요청 실패: {statusInt}"
            : $"{name} 요청 실패: {statusInt} — {summary}";
    }

    /// <summary>실패 본문에서 사람이 읽을 부분만 짧게 뽑는다. JSON 이면 message 필드를 먼저 본다.</summary>
    internal static string SummarizeFailureBody(string? failureBody)
    {
        var body = (failureBody ?? string.Empty).Trim();
        if (body.Length == 0)
        {
            return string.Empty;
        }

        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(body);
            var root = document.RootElement;
            if (root.ValueKind == System.Text.Json.JsonValueKind.Object)
            {
                if (root.TryGetProperty("error", out var error))
                {
                    if (error.ValueKind == System.Text.Json.JsonValueKind.String)
                    {
                        return Shorten(error.GetString());
                    }

                    if (error.ValueKind == System.Text.Json.JsonValueKind.Object
                        && error.TryGetProperty("message", out var nested)
                        && nested.ValueKind == System.Text.Json.JsonValueKind.String)
                    {
                        return Shorten(nested.GetString());
                    }
                }

                if (root.TryGetProperty("message", out var message)
                    && message.ValueKind == System.Text.Json.JsonValueKind.String)
                {
                    return Shorten(message.GetString());
                }

                if (root.TryGetProperty("detail", out var detail)
                    && detail.ValueKind == System.Text.Json.JsonValueKind.String)
                {
                    return Shorten(detail.GetString());
                }
            }
        }
        catch (System.Text.Json.JsonException)
        {
            // JSON 이 아니면 본문을 그대로 짧게 쓴다.
        }

        return Shorten(body);
    }

    private static string Shorten(string? value)
    {
        var text = (value ?? string.Empty).Replace("\r", " ", StringComparison.Ordinal).Replace("\n", " ", StringComparison.Ordinal).Trim();
        while (text.Contains("  ", StringComparison.Ordinal))
        {
            text = text.Replace("  ", " ", StringComparison.Ordinal);
        }

        return text.Length <= 200 ? text : text[..200] + "…";
    }

    public static string DisplayName(string provider)
    {
        return provider.ToLowerInvariant() switch
        {
            "groq" => "Groq",
            "gemini" => "Gemini",
            "cerebras" => "Cerebras",
            "nvidia" => "NVIDIA NIM",
            "deepseek" => "DeepSeek",
            _ => provider
        };
    }

    public static OpenAiCompatibleStreamChunk ExtractStreamChunk(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("choices", out var choices)
                || choices.ValueKind != JsonValueKind.Array
                || choices.GetArrayLength() == 0)
            {
                return new OpenAiCompatibleStreamChunk(string.Empty, string.Empty);
            }

            var first = choices[0];
            var finishReason = first.TryGetProperty("finish_reason", out var finishReasonElement)
                ? finishReasonElement.GetString() ?? string.Empty
                : string.Empty;
            if (!first.TryGetProperty("delta", out var delta) || delta.ValueKind != JsonValueKind.Object)
            {
                return new OpenAiCompatibleStreamChunk(string.Empty, finishReason);
            }

            if (!delta.TryGetProperty("content", out var content))
            {
                return new OpenAiCompatibleStreamChunk(string.Empty, finishReason);
            }

            if (content.ValueKind == JsonValueKind.String)
            {
                return new OpenAiCompatibleStreamChunk(content.GetString() ?? string.Empty, finishReason);
            }

            if (content.ValueKind == JsonValueKind.Array)
            {
                var builder = new StringBuilder();
                foreach (var part in content.EnumerateArray())
                {
                    if (part.ValueKind == JsonValueKind.String)
                    {
                        builder.Append(part.GetString());
                    }
                    else if (part.ValueKind == JsonValueKind.Object
                             && part.TryGetProperty("text", out var textPart)
                             && textPart.ValueKind == JsonValueKind.String)
                    {
                        builder.Append(textPart.GetString());
                    }
                }

                return new OpenAiCompatibleStreamChunk(builder.ToString(), finishReason);
            }
        }
        catch (JsonException)
        {
        }

        return new OpenAiCompatibleStreamChunk(string.Empty, string.Empty);
    }

    private static string EscapeJson(string value)
    {
        return value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal)
            .Replace("\t", "\\t", StringComparison.Ordinal)
            .Replace("\b", "\\b", StringComparison.Ordinal)
            .Replace("\f", "\\f", StringComparison.Ordinal)
            .Replace("\r", "\\r", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal);
    }
}

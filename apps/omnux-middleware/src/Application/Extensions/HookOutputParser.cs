using System.Text.Json;

namespace Omnux.Middleware;

/// <summary>훅 표준 출력 해석 결과. 파싱 실패와 판정 없음을 구분한다.</summary>
internal sealed record HookOutputParseResult(
    HookOutcome Outcome,
    string Reason,
    string UpdatedInputJson,
    string AdditionalContext,
    bool HadJson,
    string ParseError
)
{
    public static readonly HookOutputParseResult None = new(
        HookOutcome.None,
        string.Empty,
        string.Empty,
        string.Empty,
        false,
        string.Empty
    );
}

/// <summary>
/// 훅 표준 출력(JSON) 해석. AOT 안전하게 JsonDocument 만 사용하고 원문을 보존한다.
/// 출력이 비었거나 JSON 이 아니면 판정 없음으로 처리하며 오류로 만들지 않는다.
/// </summary>
internal static class HookOutputParser
{
    public const int MaxStdoutChars = 64 * 1024;

    public static HookOutputParseResult Parse(string? stdout)
    {
        var text = (stdout ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return HookOutputParseResult.None;
        }

        if (text.Length > MaxStdoutChars)
        {
            return HookOutputParseResult.None with
            {
                ParseError = $"표준 출력이 상한 {MaxStdoutChars}자를 넘었다"
            };
        }

        if (text[0] != '{')
        {
            // 사람이 읽는 로그 출력을 오류로 만들지 않는다.
            return HookOutputParseResult.None;
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(text);
        }
        catch (JsonException exception)
        {
            return HookOutputParseResult.None with { ParseError = exception.Message };
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return HookOutputParseResult.None with { ParseError = "최상위가 객체가 아니다" };
            }

            var outcome = ReadOutcome(root, out var outcomeError);
            var reason = ReadString(root, "reason");
            var additionalContext = ReadString(root, "additionalContext");
            var updatedInput = string.Empty;
            if (root.TryGetProperty("updatedInput", out var updatedElement)
                && updatedElement.ValueKind == JsonValueKind.Object)
            {
                updatedInput = updatedElement.GetRawText();
            }

            return new HookOutputParseResult(
                outcome,
                reason,
                updatedInput,
                additionalContext,
                HadJson: true,
                ParseError: outcomeError
            );
        }
    }

    private static HookOutcome ReadOutcome(JsonElement root, out string error)
    {
        error = string.Empty;
        if (!root.TryGetProperty("decision", out var element))
        {
            return HookOutcome.None;
        }

        if (element.ValueKind != JsonValueKind.String)
        {
            error = "decision 이 문자열이 아니다";
            return HookOutcome.None;
        }

        var value = (element.GetString() ?? string.Empty).Trim().ToLowerInvariant();
        return value switch
        {
            "allow" => HookOutcome.Allow,
            "ask" => HookOutcome.Ask,
            "deny" or "block" => HookOutcome.Deny,
            "" or "defer" or "none" => HookOutcome.None,
            _ => Unknown(value, out error)
        };

        static HookOutcome Unknown(string value, out string error)
        {
            error = $"알 수 없는 decision 값: {value}";
            return HookOutcome.None;
        }
    }

    private static string ReadString(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var element))
        {
            return string.Empty;
        }

        return element.ValueKind == JsonValueKind.String
            ? (element.GetString() ?? string.Empty).Trim()
            : string.Empty;
    }
}

using System.Text.Json;

namespace Omnux.Middleware;

/// <summary>
/// 빌드탭 요청이 "이미 만든 결과를 그대로 실행해 달라"는 뜻인지 판정한다.
///
/// 표현은 사람마다 다르다("실행해봐", "한번 돌려봐", "그거 켜봐", "게임 실행", "run it",
/// "동작하는지 보여줘"…). 그래서 어휘 목록으로 맞히려 들지 않고 모델에게 의미를 묻는다.
/// 어휘 목록은 모델 호출이 실패했을 때만 쓰는 최후 폴백이다.
/// </summary>
public static class CodingRunRequestIntentPolicy
{
    /// <summary>이 길이를 넘는 요청은 후속 실행 요청이 아니라 새 작업 지시로 본다(판정 호출도 아낀다).</summary>
    public const int MaxFollowUpRequestLength = 120;

    /// <summary>판정 프롬프트. 언어와 표현에 상관없이 같은 스키마로 답하게 한다.</summary>
    public static string BuildClassificationPrompt(string userRequest)
    {
        return "You classify one message sent to a coding assistant that has ALREADY produced a project in this conversation.\n"
            + "Answer with one JSON object and nothing else.\n"
            + "Schema: {\"run_existing\":bool}\n"
            + "run_existing = true when the message only asks to run / launch / start / try / play / demo the thing that was already built, without asking for any new or changed code.\n"
            + "run_existing = false when the message asks to create, add, change, fix, refactor, explain, or test something new, or reports that it does not work.\n"
            + "The message may be written in any language and any style. Judge the intent, not the words.\n\n"
            + "Message:\n"
            + (userRequest ?? string.Empty);
    }

    /// <summary>판정 응답을 읽는다. 읽지 못하면 false 를 돌려 호출측이 폴백을 쓰게 한다.</summary>
    public static bool TryParse(string? responseText, out bool runExisting)
    {
        runExisting = false;
        var text = (responseText ?? string.Empty).Trim();
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(text[start..(end + 1)]);
            if (document.RootElement.ValueKind != JsonValueKind.Object
                || !document.RootElement.TryGetProperty("run_existing", out var value))
            {
                return false;
            }

            runExisting = value.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.String => bool.TryParse(value.GetString(), out var parsed) && parsed,
                JsonValueKind.Number => value.TryGetInt32(out var number) && number != 0,
                _ => false
            };
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>길이만으로 후속 실행 요청일 가능성을 걸러 판정 호출을 아낀다.</summary>
    public static bool CouldBeFollowUpRunRequest(string? text)
    {
        var normalized = (text ?? string.Empty).Trim();
        return normalized.Length > 0 && normalized.Length <= MaxFollowUpRequestLength;
    }

    // 모델 판정이 실패했을 때만 쓰는 폴백. 여기에 의존하지 말 것 — 표현은 얼마든지 달라진다.
    private static readonly string[] FallbackRunMarkers =
    {
        "실행", "돌려", "구동", "켜봐", "띄워", "플레이", "run it", "run the", "launch", "start it", "execute"
    };

    private static readonly string[] FallbackBuildMarkers =
    {
        "만들", "작성", "구현", "추가", "수정", "고쳐", "고치", "바꿔", "변경", "리팩", "삭제", "지워",
        "붙여", "넣어", "create", "implement", "write", "add ", "fix", "change", "refactor"
    };

    private static readonly string[] FallbackFailureMarkers =
    {
        "안 되", "안되", "안 돼", "안돼", "안됨", "오류", "에러", "실패", "죽어", "멈춰", "error", "fail"
    };

    /// <summary>모델 판정이 없을 때만 쓰는 어휘 폴백.</summary>
    public static bool FallbackLooksLikeRunOnlyRequest(string? text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (!CouldBeFollowUpRunRequest(normalized))
        {
            return false;
        }

        return ContainsAny(normalized, FallbackRunMarkers)
               && !ContainsAny(normalized, FallbackBuildMarkers)
               && !ContainsAny(normalized, FallbackFailureMarkers);
    }

    private static bool ContainsAny(string text, string[] markers)
    {
        foreach (var marker in markers)
        {
            if (text.Contains(marker, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}

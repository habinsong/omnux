namespace Omnux.Middleware;

/// <summary>
/// 한 번의 LLM 호출에 사용자가 건 조절값. 질문·빌드·자동화 탭이 같은 값을 쓴다.
/// 제공자가 지원하지 않는 값은 <see cref="ProviderRequestTuningPolicy"/> 에서 조용히 떨어진다.
/// </summary>
public sealed record LlmTuning(
    string ReasoningEffort = "",
    string ContextBudget = "",
    bool WebSearch = false
)
{
    public static readonly LlmTuning Default = new();

    public static LlmTuning From(string? reasoningEffort, string? contextBudget, bool webSearch = false)
    {
        return new LlmTuning(
            NormalizeReasoning(reasoningEffort),
            NormalizeContext(contextBudget),
            webSearch
        );
    }

    public bool HasReasoning => ReasoningEffort.Length > 0 && ReasoningEffort != "auto";

    /// <summary>입력 프롬프트 예산 배수. compact 는 무료 티어 TPM 한도(예: Groq 8000)에 맞추기 위한 값이다.</summary>
    public double PromptScale => ContextBudget switch
    {
        "compact" => 0.4d,
        "full" => 1.75d,
        _ => 1.0d
    };

    /// <summary>출력 토큰 예산 배수.</summary>
    public double OutputScale => ContextBudget switch
    {
        "compact" => 0.5d,
        "full" => 1.5d,
        _ => 1.0d
    };

    public int ScalePrompt(int baseChars) => Math.Max(800, (int)Math.Round(baseChars * PromptScale));

    public int ScaleOutput(int baseTokens) => Math.Max(256, (int)Math.Round(baseTokens * OutputScale));

    private static string NormalizeReasoning(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "off" or "minimal" or "low" or "medium" or "high" or "auto" => normalized,
            _ => string.Empty
        };
    }

    private static string NormalizeContext(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "compact" or "standard" or "full" => normalized,
            _ => string.Empty
        };
    }
}

/// <summary>
/// 조절값을 제공자별 실제 요청 파라미터로 옮긴다. 여기의 JSON 조각은 모두 실키 호출로 확인한 형식이다.
/// (groq browser_search / groq compound_custom / gemini thinkingConfig / nvidia chat_template_kwargs)
/// </summary>
public static class ProviderRequestTuningPolicy
{
    /// <summary>OpenAI 호환 body 에 덧붙일 JSON 속성들. 앞에 콤마 없이 "key":value 형태로만 돌려준다.</summary>
    public static IReadOnlyList<string> BuildOpenAiCompatibleExtras(ProviderCapability capability, LlmTuning tuning)
    {
        var extras = new List<string>(2);

        var level = capability.NormalizeReasoningLevel(tuning.HasReasoning ? tuning.ReasoningEffort : null);
        if (tuning.HasReasoning && level.Length > 0)
        {
            switch (capability.Reasoning)
            {
                case ProviderReasoningMode.OpenAiEffort:
                    extras.Add($"\"reasoning_effort\":\"{level}\"");
                    break;
                case ProviderReasoningMode.NvidiaThinking:
                    extras.Add($"\"chat_template_kwargs\":{{\"thinking\":{(level == "off" ? "false" : "true")}}}");
                    break;
            }
        }

        if (tuning.WebSearch)
        {
            switch (capability.WebSearch)
            {
                case ProviderWebSearchMode.GroqBrowserSearch:
                    extras.Add("\"tools\":[{\"type\":\"browser_search\"}]");
                    break;
                case ProviderWebSearchMode.GroqCompound:
                    extras.Add("\"compound_custom\":{\"tools\":{\"enabled_tools\":[\"web_search\",\"visit_website\"]}}");
                    break;
            }
        }

        return extras;
    }

    /// <summary>Gemini generationConfig 에 덧붙일 JSON 속성들.</summary>
    public static IReadOnlyList<string> BuildGeminiGenerationConfigExtras(ProviderCapability capability, LlmTuning tuning)
    {
        if (!tuning.HasReasoning || capability.Reasoning != ProviderReasoningMode.GeminiThinkingLevel)
        {
            return Array.Empty<string>();
        }

        var level = capability.NormalizeReasoningLevel(tuning.ReasoningEffort);
        return level.Length == 0
            ? Array.Empty<string>()
            : new[] { $"\"thinkingConfig\":{{\"thinkingLevel\":\"{level.ToUpperInvariant()}\"}}" };
    }

    /// <summary>Gemini tools 배열 항목. 네이티브 검색을 켤 때만 google_search 가 들어간다.</summary>
    public static string BuildGeminiToolsJson(ProviderCapability capability, LlmTuning tuning)
    {
        return tuning.WebSearch && capability.WebSearch == ProviderWebSearchMode.GeminiGoogleSearch
            ? "[{\"google_search\":{}}]"
            : string.Empty;
    }

    /// <summary>Codex CLI 의 model_reasoning_effort 값. 지원 안 하면 빈 문자열.</summary>
    public static string BuildCliReasoningEffort(ProviderCapability capability, LlmTuning tuning)
    {
        if (capability.Reasoning != ProviderReasoningMode.CliEffort)
        {
            return string.Empty;
        }

        var level = capability.NormalizeReasoningLevel(tuning.HasReasoning ? tuning.ReasoningEffort : null);
        return level is "off" or "minimal" ? "low" : level;
    }

    /// <summary>JSON body 끝에 extras 를 이어 붙인다. body 는 "{...}" 형태여야 한다.</summary>
    public static string AppendExtras(string body, IReadOnlyList<string> extras)
    {
        if (extras.Count == 0)
        {
            return body;
        }

        var trimmed = (body ?? string.Empty).TrimEnd();
        if (!trimmed.EndsWith('}'))
        {
            return body ?? string.Empty;
        }

        return trimmed[..^1] + "," + string.Join(",", extras) + "}";
    }
}

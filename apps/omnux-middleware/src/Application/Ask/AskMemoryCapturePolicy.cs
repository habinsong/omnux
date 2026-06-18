using System.Text.Json;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

/// <summary>경량 추출 결과 — Memorable=false 면 나머지는 무시.</summary>
public sealed record AskMemoryExtraction(bool Memorable, string Title, string Fact);

/// <summary>
/// 턴 종료 후 "기억할 사실" 자동 적재의 순수 정책 (ASK_ORCHESTRATION_PLAN.md P1-3).
/// 게이트(휴리스틱) → 경량 LLM 추출(JSON) → 파싱/캡/중복키만 담당하고 I/O 는
/// CommandService.AskMemoryCapture 파셜이 담당한다. 오탐 적재는 메모리를 오염시키므로
/// 게이트는 보수적으로 — 선호/결정/프로필/지속 지시만 통과시킨다.
/// </summary>
internal static class AskMemoryCapturePolicy
{
    public const int MinInputLength = 8;
    public const int TitleMinChars = 4;
    public const int TitleMaxChars = 60;
    public const int FactMinChars = 10;
    public const int FactMaxChars = 600;
    public const int DailyLimit = 8;
    public const int LlmTimeoutSeconds = 4;

    private const string DisableEnvName = "OMNUX_ASK_AUTO_MEMORY";

    // 지속 가치 신호: 명시적 기억 요청 / 선호·결정 선언 / 프로필 / "앞으로·항상·기본" 지시.
    private static readonly Regex MemorableSignalRegex = new(
        @"(기억해|기억하고|잊지\s*마|메모해\s*둬|앞으로(는)?\s|항상\s|기본(값)?(으로|은)\s|디폴트로\s|선호(해|함|야)|좋아하(고|는|니까)|싫어하(고|는|니까)|내\s*(이름|생일|직업|회사|이메일|환경|장비|맥북|컴퓨터)(은|는|이|가)\s|(으로|로)\s*(정하자|정했|정할게|하기로\s*했|통일하자|통일해)|규칙(으로|은|:)\s|policy|항상\s*[가-힣A-Za-z]+\s*해줘)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase
    );

    public static bool IsDisabledByEnv()
    {
        return IsDisabledValue(Environment.GetEnvironmentVariable(DisableEnvName));
    }

    /// <summary>기본 on — "0"/"false"/"off"/"no" 일 때만 비활성.</summary>
    public static bool IsDisabledValue(string? raw)
    {
        var normalized = (raw ?? string.Empty).Trim();
        return normalized.Equals("0", StringComparison.Ordinal)
            || normalized.Equals("false", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("off", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("no", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>LLM 호출 전 휴리스틱 게이트 — 신호 없으면 비용 0 으로 종료.</summary>
    public static bool LooksLikeMemorableUserInput(string? userText)
    {
        var normalized = (userText ?? string.Empty).Trim();
        if (normalized.Length < MinInputLength || normalized.StartsWith("/", StringComparison.Ordinal))
        {
            return false;
        }

        return MemorableSignalRegex.IsMatch(normalized);
    }

    /// <summary>경량 LLM 추출 프롬프트 — JSON 한 객체만 출력하도록 강제.</summary>
    public static string BuildExtractionPrompt(string userText, string? assistantText)
    {
        var user = Truncate((userText ?? string.Empty).Trim(), 900);
        var assistant = Truncate((assistantText ?? string.Empty).Trim(), 400);
        var builder = new System.Text.StringBuilder();
        builder.AppendLine("당신은 대화에서 '오래 기억할 가치가 있는 사용자 사실'만 추출하는 분류기입니다.");
        builder.AppendLine("기억할 가치: 사용자 선호/결정/규칙/프로필/환경처럼 다음 대화에도 유효한 것.");
        builder.AppendLine("기억하지 않을 것: 일회성 질문, 일반 지식, 잡담, 이번 턴에만 유효한 요청.");
        builder.AppendLine("반드시 JSON 객체 하나만 출력하세요. 다른 텍스트 금지.");
        builder.AppendLine("형식: {\"memorable\": true|false, \"title\": \"명사구 4~60자\", \"fact\": \"사실 1~3문장, 한국어\"}");
        builder.AppendLine("memorable 이 false 면 title/fact 는 빈 문자열.");
        builder.AppendLine();
        builder.AppendLine("[사용자 발화]");
        builder.AppendLine(user);
        if (assistant.Length > 0)
        {
            builder.AppendLine();
            builder.AppendLine("[직전 어시스턴트 답변 일부]");
            builder.AppendLine(assistant);
        }

        return builder.ToString();
    }

    /// <summary>LLM 출력 파싱 — ```json 펜스 허용, 캡 적용. 실패/불량이면 null.</summary>
    public static AskMemoryExtraction? TryParseExtraction(string? llmOutput)
    {
        var raw = (llmOutput ?? string.Empty).Trim();
        if (raw.Length == 0)
        {
            return null;
        }

        var jsonStart = raw.IndexOf('{');
        var jsonEnd = raw.LastIndexOf('}');
        if (jsonStart < 0 || jsonEnd <= jsonStart)
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(raw[jsonStart..(jsonEnd + 1)]);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("memorable", out var memorableEl))
            {
                return null;
            }

            var memorable = memorableEl.ValueKind == JsonValueKind.True;
            if (!memorable)
            {
                return new AskMemoryExtraction(false, string.Empty, string.Empty);
            }

            var title = ReadString(root, "title");
            var fact = ReadString(root, "fact");
            if (title.Length < TitleMinChars || fact.Length < FactMinChars)
            {
                return null;
            }

            if (title.Length > TitleMaxChars)
            {
                title = title[..TitleMaxChars].Trim();
            }

            if (fact.Length > FactMaxChars)
            {
                fact = fact[..FactMaxChars].Trim() + "…";
            }

            return new AskMemoryExtraction(true, title, fact);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>중복 판정 키 — 소문자 토큰 연결("답변 말투 규칙" == "답변말투 규칙").</summary>
    public static string NormalizeTitleKey(string? title)
    {
        var lowered = (title ?? string.Empty).ToLowerInvariant();
        return string.Concat(Regex.Matches(lowered, @"[\p{L}\p{N}]+", RegexOptions.CultureInvariant)
            .Select(match => match.Value));
    }

    private static string ReadString(JsonElement element, string property)
    {
        return element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? (value.GetString() ?? string.Empty).Trim()
            : string.Empty;
    }

    private static string Truncate(string value, int max)
    {
        return value.Length <= max ? value : value[..max];
    }
}

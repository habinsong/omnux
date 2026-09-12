using System.Collections.Concurrent;
using System.Text.Json;

namespace Omnux.Middleware;

/// <summary>요청 한 건의 성격. 프로파일·검증·품질 게이트가 공통으로 읽는다.</summary>
public sealed record CodingTaskSignals(
    bool Game,
    bool Gui,
    bool Interactive,
    bool Frontend
)
{
    public static readonly CodingTaskSignals None = new(false, false, false, false);
}

/// <summary>
/// 요청이 게임인지·GUI 인지·대화형인지 판정하는 단일 지점.
///
/// 예전에는 각 정책이 `ContainsAny(text, "game", "arcade", "tetris", …)` 로 영어 토큰만 봤다.
/// "파이썬으로 테트리스 게임 만들어줘" 는 어떤 토큰에도 안 걸려서 게임 프로파일·게임 검증이
/// 통째로 빠졌다. 이제 요청당 한 번 LLM 이 판정한 결과를 여기에 담아 두고 모든 정책이 그것을 읽는다.
/// LLM 판정이 없거나 실패하면 각 정책의 기존 휴리스틱으로 되돌아간다(동작 회귀 없음).
/// </summary>
public static class CodingTaskSignalResolver
{
    private const int MaxEntries = 64;

    private static readonly ConcurrentDictionary<string, CodingTaskSignals> Cache = new(StringComparer.Ordinal);
    private static readonly ConcurrentQueue<string> Order = new();

    public static string BuildKey(string? objective)
    {
        var text = CodingLanguagePolicy.ExtractLatestCodingRequestText(objective ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            text = (objective ?? string.Empty).Trim();
        }

        return text.Length <= 600 ? text : text[..600];
    }

    public static CodingTaskSignals? TryGet(string? objective)
    {
        var key = BuildKey(objective);
        return key.Length == 0 ? null : Cache.TryGetValue(key, out var signals) ? signals : null;
    }

    public static void Set(string? objective, CodingTaskSignals signals)
    {
        var key = BuildKey(objective);
        if (key.Length == 0)
        {
            return;
        }

        if (Cache.TryAdd(key, signals))
        {
            Order.Enqueue(key);
        }
        else
        {
            Cache[key] = signals;
        }

        while (Cache.Count > MaxEntries && Order.TryDequeue(out var oldest))
        {
            Cache.TryRemove(oldest, out _);
        }
    }

    public static void Clear() => Cache.Clear();

    /// <summary>판정용 프롬프트. 언어에 상관없이 같은 스키마로 답하게 한다.</summary>
    public static string BuildClassificationPrompt(string userRequest)
    {
        return "You classify a software build request. Answer with one JSON object and nothing else.\n"
            + "Schema: {\"game\":bool,\"gui\":bool,\"interactive\":bool,\"frontend\":bool}\n"
            + "game: the result is a playable game (any genre, any language).\n"
            + "gui: the program opens a desktop window (pygame, tkinter, Qt, SDL, curses full-screen UI, …).\n"
            + "interactive: the program waits for user input while running (stdin prompts, key presses, a game loop).\n"
            + "frontend: the deliverable is a web page or web app rendered in a browser.\n"
            + "The request may be written in any language. Judge the meaning, not the words.\n\n"
            + "Request:\n"
            + (userRequest ?? string.Empty);
    }

    public static bool TryParse(string? responseText, out CodingTaskSignals signals)
    {
        signals = CodingTaskSignals.None;
        var text = (responseText ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return false;
        }

        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(text[start..(end + 1)]);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            signals = new CodingTaskSignals(
                ReadBool(root, "game"),
                ReadBool(root, "gui"),
                ReadBool(root, "interactive"),
                ReadBool(root, "frontend")
            );
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool ReadBool(JsonElement root, string property)
    {
        if (!root.TryGetProperty(property, out var value))
        {
            return false;
        }

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String => bool.TryParse(value.GetString(), out var parsed) && parsed,
            JsonValueKind.Number => value.TryGetInt32(out var number) && number != 0,
            _ => false
        };
    }
}

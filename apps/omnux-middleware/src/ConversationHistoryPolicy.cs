using System.Text;

namespace Omnux.Middleware;

internal static class ConversationHistoryPolicy
{
    /// <summary>
    /// BuildHistoryText 결과("[user] ...\n[assistant] ...")를 개별 메시지 블록으로 파싱한다.
    /// </summary>
    public static List<(string Role, string Text)> ParseHistoryMessages(string history)
    {
        var result = new List<(string Role, string Text)>();
        if (string.IsNullOrWhiteSpace(history))
        {
            return result;
        }

        var rawLines = history.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        string? currentRole = null;
        var currentText = new StringBuilder();

        for (var i = 0; i < rawLines.Length; i++)
        {
            var line = rawLines[i];
            if (line.StartsWith("[user] ", StringComparison.Ordinal))
            {
                if (currentRole != null)
                {
                    result.Add((currentRole, currentText.ToString().TrimEnd()));
                }

                currentRole = "user";
                currentText.Clear();
                currentText.Append(line["[user] ".Length..]);
            }
            else if (line.StartsWith("[assistant] ", StringComparison.Ordinal))
            {
                if (currentRole != null)
                {
                    result.Add((currentRole, currentText.ToString().TrimEnd()));
                }

                currentRole = "assistant";
                currentText.Clear();
                currentText.Append(line["[assistant] ".Length..]);
            }
            else if (currentRole != null)
            {
                currentText.Append('\n');
                currentText.Append(line);
            }
        }

        if (currentRole != null)
        {
            result.Add((currentRole, currentText.ToString().TrimEnd()));
        }

        return result;
    }

    public static string TrimContextHistory(string history, int maxChars)
    {
        if (string.IsNullOrWhiteSpace(history))
        {
            return string.Empty;
        }

        var trimmed = history.Trim();
        if (trimmed.Length <= maxChars)
        {
            return trimmed;
        }

        var messages = ParseHistoryMessages(trimmed);
        if (messages.Count == 0)
        {
            return trimmed[^maxChars..];
        }

        var kept = new List<string>();
        var budget = maxChars;

        for (var i = messages.Count - 1; i >= 0; i--)
        {
            var msg = messages[i];
            var prefix = $"[{msg.Role}] ";
            var available = budget - prefix.Length - 1;

            if (available <= 0)
            {
                break;
            }

            var text = msg.Text.Length <= available ? msg.Text : msg.Text[..available] + "...";
            var block = $"{prefix}{text}";
            kept.Insert(0, block);
            budget -= block.Length + 1;
        }

        return string.Join('\n', kept);
    }

    public static string BuildBudgetedContextHistory(string history, int maxChars)
    {
        if (string.IsNullOrWhiteSpace(history))
        {
            return string.Empty;
        }

        var messages = ParseHistoryMessages(history);
        if (messages.Count == 0)
        {
            return string.Empty;
        }

        const int RecentMessageCount = 4;
        const int MaxCharsPerRecentMessage = 800;
        var recentCount = Math.Min(messages.Count, RecentMessageCount);
        var olderCount = Math.Max(0, messages.Count - recentCount);

        var recentParts = new List<string>();
        foreach (var msg in messages.Skip(olderCount))
        {
            var text = msg.Text.Length <= MaxCharsPerRecentMessage
                ? msg.Text
                : msg.Text[..MaxCharsPerRecentMessage] + "...";
            recentParts.Add($"[{msg.Role}] {text}");
        }

        var recent = string.Join('\n', recentParts);
        if (olderCount == 0)
        {
            return TrimContextHistory(recent, maxChars);
        }

        var olderMessages = messages.Take(olderCount).ToList();
        // 남은 예산을 전부 옛 대화에 쓴다. 1200자 고정이면 예산이 5000자여도 대화 앞부분이 버려졌다.
        var olderBudget = Math.Max(1200, maxChars - recent.Length - 200);
        var olderSummary = BuildMessageLevelSummary(olderMessages, olderBudget);
        var combined = string.IsNullOrWhiteSpace(olderSummary)
            ? recent
            : $"[이전 대화 압축]\n{olderSummary}\n\n[최근 턴]\n{recent}";
        return combined.Length <= maxChars ? combined : TrimContextHistory(combined, maxChars);
    }

    /// <summary>
    /// 최근 턴 앞의 대화를 예산 안에서 그대로 남긴다.
    /// 예전에는 "요구/오류/검색/api" 같은 낱말 목록에 걸리는 줄만 최대 4개 남겼는데,
    /// 낱말에 안 걸리는 사실(이름·버전·결정 사항)이 통째로 사라져 몇 턴 뒤에 다시 물으면
    /// 모델이 "그런 얘기 없었다"고 답했다(실측). 이제는 최신 것부터 예산이 닿는 데까지 채운다.
    /// </summary>
    public static string BuildMessageLevelSummary(IReadOnlyList<(string Role, string Text)> olderMessages, int maxChars)
    {
        if (olderMessages.Count == 0 || maxChars <= 0)
        {
            return string.Empty;
        }

        const int MaxCharsPerOlderMessage = 400;
        var selected = new List<string>();
        var used = 0;
        var dropped = 0;

        // 최신 것부터 담아야 예산이 모자랄 때 오래된 쪽이 밀린다.
        for (var index = olderMessages.Count - 1; index >= 0; index -= 1)
        {
            var message = olderMessages[index];
            var text = (message.Text ?? string.Empty).Trim();
            if (text.Length == 0)
            {
                continue;
            }

            if (text.Length > MaxCharsPerOlderMessage)
            {
                text = text[..MaxCharsPerOlderMessage] + "...";
            }

            var line = $"[{message.Role}] {text}";
            if (used + line.Length + 1 > maxChars && selected.Count > 0)
            {
                dropped = index + 1;
                break;
            }

            selected.Add(line);
            used += line.Length + 1;
        }

        if (selected.Count == 0)
        {
            return string.Empty;
        }

        selected.Reverse();
        if (dropped > 0)
        {
            selected.Insert(0, $"...(앞선 {dropped}개 메시지 생략)");
        }

        return string.Join('\n', selected);
    }
}

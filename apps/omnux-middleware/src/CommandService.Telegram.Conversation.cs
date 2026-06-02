using System.Text;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    // /history [N] — 텔레그램 thread의 최근 N개 user/assistant 쌍을 압축 요약으로 반환.
    private string? TryHandleTelegramHistorySlashCommand(string text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (!normalized.StartsWith("/history", StringComparison.OrdinalIgnoreCase)
            && !normalized.StartsWith("/log", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var firstLine = normalized.Split('\n', 2)[0];
        var tokens = firstLine.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var n = 5;
        if (tokens.Length >= 2 && int.TryParse(tokens[1], out var requested))
        {
            n = Math.Clamp(requested, 1, 20);
        }

        var thread = EnsureTelegramLinkedConversation();
        if (thread.Messages == null || thread.Messages.Count == 0)
        {
            return "대화 기록이 비어 있습니다.";
        }

        // user/assistant 쌍을 뒤에서 모은다.
        var pairs = new List<(string User, string Assistant, DateTimeOffset Stamp)>();
        ConversationMessageView? pendingUser = null;
        for (var i = thread.Messages.Count - 1; i >= 0; i -= 1)
        {
            var msg = thread.Messages[i];
            if (string.Equals(msg.Role, "assistant", StringComparison.OrdinalIgnoreCase))
            {
                pendingUser = msg;
                continue;
            }
            if (string.Equals(msg.Role, "user", StringComparison.OrdinalIgnoreCase) && pendingUser != null)
            {
                pairs.Add((msg.Text, pendingUser.Text, pendingUser.CreatedUtc));
                pendingUser = null;
                if (pairs.Count >= n)
                {
                    break;
                }
            }
        }

        if (pairs.Count == 0)
        {
            return "최근 user/assistant 쌍이 없습니다.";
        }

        var builder = new StringBuilder();
        builder.AppendLine($"📜 최근 대화 {pairs.Count}개:");
        for (var i = pairs.Count - 1; i >= 0; i -= 1)
        {
            var (u, a, stamp) = pairs[i];
            var idx = pairs.Count - i;
            var localStamp = stamp.ToLocalTime().ToString("MM-dd HH:mm");
            builder.AppendLine();
            builder.AppendLine($"#{idx} · {localStamp}");
            builder.AppendLine($"🙂 {TrimHistoryPreview(u, 220)}");
            builder.AppendLine($"🤖 {TrimHistoryPreview(a, 360)}");
        }
        return builder.ToString().TrimEnd();
    }

    private static string TrimHistoryPreview(string text, int maxChars)
    {
        var safe = (text ?? string.Empty).Replace("\r\n", " ").Replace("\n", " ").Trim();
        if (safe.Length <= maxChars) return safe;
        return safe[..maxChars] + "…";
    }

    public ConversationThreadView EnsureTelegramLinkedConversation()
    {
        return _conversationAppService.EnsureTelegramLinkedConversation();
    }

    private string? TryBuildLastTelegramAssistantNotebookAppend()
    {
        var thread = EnsureTelegramLinkedConversation();
        var assistant = thread.Messages
            .Where(message => message.Role.Equals("assistant", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(message => message.CreatedUtc)
            .FirstOrDefault();
        if (assistant == null || string.IsNullOrWhiteSpace(assistant.Text))
        {
            return null;
        }

        var lines = new[]
        {
            "텔레그램 답변에서 저장한 내용",
            "",
            $"대화: {thread.Title}",
            $"응답: {assistant.Meta}",
            "",
            TrimForOutput(assistant.Text, 2200)
        };
        return "/notebook append learning " + string.Join("\n", lines).Trim();
    }

    private string? TryBuildLastTelegramAssistantPlanCreate()
    {
        var thread = EnsureTelegramLinkedConversation();
        var assistant = thread.Messages
            .Where(message => message.Role.Equals("assistant", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(message => message.CreatedUtc)
            .FirstOrDefault();
        if (assistant == null || string.IsNullOrWhiteSpace(assistant.Text))
        {
            return null;
        }

        var lines = new[]
        {
            "아래 텔레그램 답변을 실제 실행 가능한 작업계획으로 정리",
            "",
            $"대화: {thread.Title}",
            $"응답: {assistant.Meta}",
            "",
            TrimForOutput(assistant.Text, 2600)
        };
        return "/plan create --constraint 답변의 의도와 범위를 유지하기 --constraint 실행 가능한 단계와 검증 기준을 분리하기 " + string.Join("\n", lines).Trim();
    }

    private string ResolveTelegramStateKey(ConversationThreadView? thread = null)
    {
        var contextualKey = (_executionContext.CurrentTelegramTurn?.SessionKey ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(contextualKey))
        {
            return contextualKey;
        }

        if (thread != null && !string.IsNullOrWhiteSpace(thread.Id))
        {
            return thread.Id;
        }

        return EnsureTelegramLinkedConversation().Id;
    }

    private string BuildTelegramFollowupAwareInput(ConversationThreadView thread, string input)
    {
        return TelegramConversationContextPolicy.BuildFollowupAwareInput(thread, input);
    }

    private static (string? User, string? Assistant) FindTelegramAnchorTurn(ConversationThreadView thread, string currentInput)
    {
        return TelegramConversationContextPolicy.FindAnchorTurn(thread, currentInput);
    }
}

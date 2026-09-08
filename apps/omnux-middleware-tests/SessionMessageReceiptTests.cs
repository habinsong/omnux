using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class SessionMessageReceiptTests
{
    [Fact]
    public void AppendingAMessageDoesNotReturnAnOldAnswerAsANewReply()
    {
        var root = Path.Combine(Path.GetTempPath(), "omnux-session-receipt-" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new ConversationStore(Path.Combine(root, "conversations.json"));
            var thread = store.Create("chat", "single", "대화", null, null, null);
            store.AppendMessage(thread.Id, "assistant", "이전 질문에 대한 답변", "");
            var result = new SessionSendTool(store).Send(thread.Id, "다음 질문", 60);
            Assert.Equal("accepted", result.Status);
            Assert.Null(result.Reply);
            Assert.Equal("다음 질문", store.Get(thread.Id)!.Messages.Last().Text);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }
}

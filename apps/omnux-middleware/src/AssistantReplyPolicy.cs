namespace Omnux.Middleware;

/// <summary>
/// 답변 언어는 사용자 입력을 따른다. 특정 자연어 이름 목록으로 강제하지 않는다.
/// </summary>
internal static class AssistantReplyPolicy
{
    public const string SystemLanguageRule =
        "Reply in the same language the user used. Keep answers concise and practical.";

    public const string ChatSystemPreamble =
        "You are omnux assistant. Reply in the same language the user used. Keep answers concise and practical. ";
}

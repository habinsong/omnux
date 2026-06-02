namespace Omnux.Middleware;

internal static class CommandHelpTextPolicy
{
    public static string BuildUnifiedLlmHelpText(string source)
    {
        var channel = source.Equals("telegram", StringComparison.OrdinalIgnoreCase) ? "텔레그램" : "웹";
        return $"""
                [{channel} LLM 도움말]
                슬래시 없이도 이렇게 말하면 됩니다.
                - "단일 모드로 바꿔"
                - "Codex로 바꿔"
                - "다중 요약 제공자를 Gemini로 설정해"
                - "모델 목록 보여줘"

                자주 쓰는 명령:
                - /talk [low|high]
                - /code [low|high]
                - /model <groq|gemini|copilot|cerebras|nvidia|codex>
                - /llm status
                - /llm models [groq|gemini|copilot|cerebras|nvidia|codex|all]
                - /llm usage

                세부 설정:
                - /mode <single|orchestration|multi>
                - /provider <single|orchestration|summary> <groq|gemini|copilot|cerebras|nvidia|codex|auto>
                - /model <single|orchestration|multi.groq|multi.gemini|multi.copilot|multi.cerebras|multi.nvidia|multi.codex> <model-id>
                """;
    }

    public static string BuildMemoryCommandHelpText()
    {
        return """
               [메모리 명령]
               - /memory clear
               - /memory create [compact]

               예시:
               - /memory clear
               - /memory create
               - /memory create compact
               """;
    }
}

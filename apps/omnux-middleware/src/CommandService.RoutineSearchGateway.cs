namespace Omnux.Middleware;

public sealed partial class CommandService
{
    internal IRoutineSearchGateway CreateRoutineSearchGateway()
    {
        return new RoutineSearchGatewayAdapter(this, UrlContextAnswerService);
    }

    private sealed class RoutineSearchGatewayAdapter : IRoutineSearchGateway
    {
        private CommandService Owner { get; }
        private GeminiUrlContextAnswerService UrlContextAnswerService { get; }

        public RoutineSearchGatewayAdapter(
            CommandService owner,
            GeminiUrlContextAnswerService urlContextAnswerService
        )
        {
            Owner = owner;
            UrlContextAnswerService = urlContextAnswerService;
        }

        async Task<LlmSingleChatResult> IRoutineSearchGateway.GenerateGeminiUrlContextAnswerAsync(
            string input,
            IReadOnlyList<string> urls,
            string memoryHint,
            bool allowMarkdownTable,
            bool enforceTelegramOutputStyle,
            Action<ChatStreamUpdate>? streamCallback,
            string scope,
            string mode,
            string conversationId,
            string decisionPath,
            long decisionMs,
            CancellationToken cancellationToken
        )
        {
            var result = await UrlContextAnswerService.GenerateAsync(
                input,
                urls,
                memoryHint,
                allowMarkdownTable,
                enforceTelegramOutputStyle,
                streamCallback,
                scope,
                mode,
                conversationId,
                decisionPath,
                decisionMs,
                cancellationToken
            );
            return result.Response;
        }

        Task<SearchAnswerCompositionResult> IRoutineSearchGateway.ComposeGroundedWebAnswerWithFallbackAsync(
            string input,
            string memoryHint,
            bool selfDecideNeedWeb,
            bool allowMarkdownTable,
            bool enforceTelegramOutputStyle,
            Action<ChatStreamUpdate>? streamCallback,
            string scope,
            string mode,
            string conversationId,
            string decisionPath,
            long decisionMs,
            string source,
            CancellationToken cancellationToken
        )
        {
            return Owner.ComposeGroundedWebAnswerWithFallbackAsync(
                input,
                memoryHint,
                selfDecideNeedWeb,
                allowMarkdownTable,
                enforceTelegramOutputStyle,
                streamCallback,
                scope,
                mode,
                conversationId,
                decisionPath,
                decisionMs,
                source,
                cancellationToken
            );
        }
    }
}

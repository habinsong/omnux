namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private IRoutineApplicationService? _routineAppService;

    internal void ConfigureRoutineApplicationService(IRoutineApplicationService routineAppService)
    {
        _routineAppService = routineAppService;
    }

    private IRoutineApplicationService RoutineAppService =>
        _routineAppService
        ?? throw new InvalidOperationException("Routine application service가 구성되지 않았습니다.");

    internal IRoutineLlmGateway CreateRoutineLlmGateway()
    {
        return new RoutineLlmGatewayAdapter(this);
    }

    private sealed class RoutineLlmGatewayAdapter : IRoutineLlmGateway
    {
        private CommandService Owner { get; }

        public RoutineLlmGatewayAdapter(CommandService owner)
        {
            Owner = owner;
        }

        Task<LlmSingleChatResult> IRoutineLlmGateway.GenerateByProviderSafeAsync(
            string provider,
            string? model,
            string input,
            CancellationToken cancellationToken,
            int? maxOutputTokens
        )
        {
            return Owner.GenerateByProviderSafeAsync(provider, model, input, cancellationToken, maxOutputTokens);
        }

        async Task<LlmSingleChatResult> IRoutineLlmGateway.GenerateGeminiUrlContextAnswerAsync(
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
            var result = await Owner.GenerateGeminiUrlContextAnswerDetailedAsync(
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

        Task<SearchAnswerCompositionResult> IRoutineLlmGateway.ComposeGroundedWebAnswerWithFallbackAsync(
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

    private static DateTimeOffset ComputeNextDailyRunUtc(int hour, int minute, string timezoneId, DateTimeOffset nowUtc)
    {
        return RoutineApplicationService.ComputeNextDailyRunUtc(hour, minute, timezoneId, nowUtc);
    }

    private static string BuildRoutineTitle(string request)
    {
        return RoutineApplicationService.BuildRoutineTitle(request);
    }

    private static string BuildFallbackRoutineCode(string request, RoutineSchedule schedule)
    {
        return RoutineApplicationService.BuildFallbackRoutineCode(request, schedule);
    }

    private static string? BuildCronRunEntrySummary(string output)
    {
        return RoutineApplicationService.BuildCronRunEntrySummary(output);
    }

    private static void AppendRoutineRunLogEntry(RoutineDefinition routine, RoutineRunLogEntry entry)
    {
        RoutineApplicationService.AppendRoutineRunLogEntry(routine, entry);
    }

    private static string NormalizeRoutineExecutionMode(string? executionMode)
    {
        return RoutineApplicationService.NormalizeRoutineExecutionMode(executionMode);
    }
}

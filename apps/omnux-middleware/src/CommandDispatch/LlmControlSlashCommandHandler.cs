namespace Omnux.Middleware;

/// <summary>
/// <c>/llm</c> 패밀리 중 <c>help</c>와 <c>set</c>(groq/copilot/provider-then-model) 텍스트 명령 핸들러.
/// <see cref="ILlmControlApplicationService"/> + 순수 도움말 정책만 의존하며 CommandService private state에
/// 의존하지 않는다(결함 4번 M4).
/// <c>/llm usage</c>·<c>/llm models</c>는 리포트 로직이 아직 CommandService에 있어 <see cref="CanHandle"/>에서
/// false를 반환해 레거시로 fall-through한다(후속 분리 대상). 텔레그램 <c>/llm</c>은 telegram-direct가 먼저 처리한다.
/// </summary>
internal sealed class LlmControlSlashCommandHandler : ISlashCommandHandler
{
    private readonly ILlmControlApplicationService _controlService;

    public LlmControlSlashCommandHandler(ILlmControlApplicationService controlService)
    {
        _controlService = controlService;
    }

    public bool CanHandle(SlashCommandContext context)
    {
        var kind = UnifiedSlashCommandPolicy.Parse(context.Text)?.Kind;
        return kind is UnifiedSlashCommandKind.LlmHelp
            or UnifiedSlashCommandKind.LlmSetGroqModel
            or UnifiedSlashCommandKind.LlmSetCopilotModel
            or UnifiedSlashCommandKind.LlmSetProviderThenModel;
    }

    public async Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken)
    {
        var command = UnifiedSlashCommandPolicy.Parse(context.Text);
        var source = context.Source;

        return command?.Kind switch
        {
            UnifiedSlashCommandKind.LlmHelp => CommandHelpTextPolicy.BuildUnifiedLlmHelpText(source),
            UnifiedSlashCommandKind.LlmSetGroqModel => await _controlService.SetGroqModelAsync(source, command.Primary, cancellationToken),
            UnifiedSlashCommandKind.LlmSetCopilotModel => await _controlService.SetCopilotModelAsync(source, command.Primary, cancellationToken),
            UnifiedSlashCommandKind.LlmSetProviderThenModel => await _controlService.SetModelForProviderAsync(source, command.Primary, command.Secondary, cancellationToken),
            _ => string.Empty
        };
    }
}

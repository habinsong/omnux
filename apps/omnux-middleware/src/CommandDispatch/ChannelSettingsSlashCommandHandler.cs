namespace Omnux.Middleware;

/// <summary>
/// 채널 LLM 설정 텍스트 명령(<c>/talk</c>, <c>/code</c>, <c>/profile</c>, <c>/mode</c>,
/// <c>/provider</c>, <c>/model</c>, <c>/status model</c>) 핸들러.
/// <see cref="ILlmSettingsApplicationService"/>만 의존하며 CommandService private state에 의존하지 않는다(결함 4번 M4).
/// 기존 <c>CommandService.ExecuteUnifiedSlashChannelCommand</c>(웹 경로) 동작을 동일하게 재현한다.
/// 텔레그램의 <c>/talk</c>·<c>/profile</c> 등은 텔레그램 direct 경로가 먼저 처리하므로 여기 도달하지 않는다.
/// </summary>
internal sealed class ChannelSettingsSlashCommandHandler : ISlashCommandHandler
{
    private readonly ILlmSettingsApplicationService _settingsService;

    public ChannelSettingsSlashCommandHandler(ILlmSettingsApplicationService settingsService)
    {
        _settingsService = settingsService;
    }

    public bool CanHandle(SlashCommandContext context)
    {
        var kind = UnifiedSlashCommandPolicy.Parse(context.Text)?.Kind;
        return kind is UnifiedSlashCommandKind.ApplyProfile
            or UnifiedSlashCommandKind.SetMode
            or UnifiedSlashCommandKind.SetProvider
            or UnifiedSlashCommandKind.SetModel
            or UnifiedSlashCommandKind.BuildStatus;
    }

    public Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken)
    {
        var command = UnifiedSlashCommandPolicy.Parse(context.Text);
        var source = context.Source;

        var result = command?.Kind switch
        {
            UnifiedSlashCommandKind.ApplyProfile => _settingsService.ApplyChannelProfile(new LlmChannelProfileRequest(source, command.Primary, command.Secondary)),
            UnifiedSlashCommandKind.SetMode => _settingsService.SetChannelMode(new LlmChannelModeRequest(source, command.Primary)),
            UnifiedSlashCommandKind.SetProvider => _settingsService.SetChannelProvider(new LlmChannelProviderRequest(source, command.Primary, command.Secondary)),
            UnifiedSlashCommandKind.SetModel => _settingsService.SetChannelModel(new LlmChannelModelRequest(source, command.Primary, command.Secondary)),
            UnifiedSlashCommandKind.BuildStatus => _settingsService.BuildChannelModelStatus(new LlmChannelStatusRequest(source)),
            _ => string.Empty
        };

        return Task.FromResult(result);
    }
}

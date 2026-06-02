namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private SlashCommandRouter? _slashCommandRouter;

    // 결함 4번 God Object 탈결합: 텍스트/슬래시 명령을 도메인 핸들러로 위임하는 라우터.
    // 각 핸들러는 자기 도메인 ApplicationService만 의존하며 CommandService private state에 의존하지 않는다.
    // 아직 이관하지 않은 명령은 라우터가 null을 반환하므로 레거시 라우팅 경로로 fall-through한다(strangler-fig).
    private SlashCommandRouter SlashCommandRouter =>
        _slashCommandRouter ??= new SlashCommandRouter(new ISlashCommandHandler[]
        {
            new DoctorSlashCommandHandler(_doctorAppService),
            new NotebookSlashCommandHandler(_notebookAppService),
            new PlanSlashCommandHandler(_planAppService),
            new TaskSlashCommandHandler(_taskGraphAppService),
            new MemorySlashCommandHandler(_memoryAppService),
            new ChannelSettingsSlashCommandHandler(_llmSettingsAppService),
            new LlmControlSlashCommandHandler(
                new LlmControlApplicationService(_groqModelCatalog, _copilotWrapper, _llmRouter, _llmSettingsAppService)
            ),
        });

    private Task<string?> TryHandleViaSlashRouterAsync(
        string text,
        string source,
        CancellationToken cancellationToken
    )
    {
        return SlashCommandRouter.TryHandleAsync(new SlashCommandContext(text, source), cancellationToken);
    }
}

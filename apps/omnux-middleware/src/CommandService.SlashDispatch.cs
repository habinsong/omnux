namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private SlashCommandRouter? _slashCommandRouter;
    private ILlmControlApplicationService? _llmControlService;

    // /llm 제어(모델 set + usage/models 리포트) application service. 핸들러와 CommandService.Telegram.LlmReports
    // wrapper가 같은 인스턴스를 공유한다.
    private ILlmControlApplicationService LlmControlService =>
        _llmControlService ??= new LlmControlApplicationService(
            _groqModelCatalog,
            _copilotWrapper,
            _llmRouter,
            _llmSettingsAppService,
            _llmPreferenceContext,
            _providers
        );

    // 결함 4번 God Object 탈결합: 텍스트/슬래시 명령을 도메인 핸들러로 위임하는 라우터.
    // 각 핸들러는 자기 도메인 ApplicationService만 의존하며 CommandService private state에 의존하지 않는다.
    // 아직 이관하지 않은 명령은 라우터가 null을 반환하므로 레거시 라우팅 경로로 fall-through한다(strangler-fig).
    private SlashCommandRouter SlashCommandRouter =>
        _slashCommandRouter ??= new SlashCommandRouter(new ISlashCommandHandler[]
        {
            new StaticSlashCommandHandler(),
            new DoctorSlashCommandHandler(_doctorAppService),
            new NotebookSlashCommandHandler(_notebookAppService),
            new HandoffSlashCommandHandler(_notebookAppService),
            new PlanSlashCommandHandler(_planAppService),
            new TaskSlashCommandHandler(_taskGraphAppService),
            new MemorySlashCommandHandler(_memoryAppService, _conversationAppService),
            new ChannelSettingsSlashCommandHandler(_llmSettingsAppService),
            new LlmControlSlashCommandHandler(LlmControlService),
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

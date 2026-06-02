namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> ExecuteUnifiedSlashCommandAsync(
        UnifiedSlashCommand command,
        string source,
        CancellationToken cancellationToken
    )
    {
        return command.Kind switch
        {
            UnifiedSlashCommandKind.StaticMessage => command.Message,
            UnifiedSlashCommandKind.ApplyProfile => ApplyChannelProfile(source, command.Primary, command.Secondary),
            UnifiedSlashCommandKind.SetMode => SetChannelMode(source, command.Primary),
            UnifiedSlashCommandKind.SetProvider => SetChannelProvider(source, command.Primary, command.Secondary),
            UnifiedSlashCommandKind.SetModel => SetChannelModel(source, command.Primary, command.Secondary),
            UnifiedSlashCommandKind.BuildStatus => BuildChannelModelStatus(source),
            _ => await ExecuteUnifiedSlashCommandOrchestrationAsync(command, source, cancellationToken)
        };
    }

    private async Task<string?> ExecuteUnifiedSlashCommandOrchestrationAsync(
        UnifiedSlashCommand command,
        string source,
        CancellationToken cancellationToken
    )
    {
        var memoryResult = await ExecuteUnifiedSlashMemoryCommandAsync(command, source, cancellationToken);
        if (memoryResult != null)
        {
            return memoryResult;
        }

        var doctorResult = await ExecuteUnifiedSlashCommandDoctorAsync(command, cancellationToken);
        if (doctorResult != null)
        {
            return doctorResult;
        }

        var domainResult = await ExecuteUnifiedSlashCommandDomainAsync(command, source, cancellationToken);
        if (domainResult != null)
        {
            return domainResult;
        }

        var llmResult = await ExecuteUnifiedSlashCommandLlmAsync(command, source, cancellationToken);
        if (llmResult != null)
        {
            return llmResult;
        }

        return null;
    }
}

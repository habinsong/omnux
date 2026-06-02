namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> ExecuteUnifiedSlashCommandAsync(
        UnifiedSlashCommand command,
        string source,
        CancellationToken cancellationToken
    )
    {
        if (command.Kind == UnifiedSlashCommandKind.StaticMessage)
        {
            return command.Message;
        }

        var channelResult = ExecuteUnifiedSlashChannelCommand(command, source);
        if (channelResult != null)
        {
            return channelResult;
        }

        return await ExecuteUnifiedSlashCommandOrchestrationAsync(command, source, cancellationToken);
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

        var doctorResult = await ExecuteUnifiedSlashCommandDoctorAsync(command, source, cancellationToken);
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

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private string? ExecuteUnifiedSlashChannelCommand(UnifiedSlashCommand command, string source)
    {
        return command.Kind switch
        {
            UnifiedSlashCommandKind.ApplyProfile => ApplyChannelProfile(source, command.Primary, command.Secondary),
            UnifiedSlashCommandKind.SetMode => SetChannelMode(source, command.Primary),
            UnifiedSlashCommandKind.SetProvider => SetChannelProvider(source, command.Primary, command.Secondary),
            UnifiedSlashCommandKind.SetModel => SetChannelModel(source, command.Primary, command.Secondary),
            UnifiedSlashCommandKind.BuildStatus => BuildChannelModelStatus(source),
            _ => null
        };
    }
}

using System.Globalization;
using System.Text;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private Task<string> ExecuteNaturalCommandDispatchAsync(NaturalCommandExecutionRequest request)
    {
        var command = request.Command.Trim();
        if (string.IsNullOrWhiteSpace(command) || !command.StartsWith("/", StringComparison.Ordinal))
        {
            _auditLogger.Log(request.Source, "natural_command_dispatch", "fail", "invalid_slash_command");
            return Task.FromResult("invalid natural command dispatch");
        }

        _auditLogger.Log(
            request.Source,
            "natural_command_dispatch",
            "ok",
            $"cmd={NormalizeAuditToken(command, "-")}"
        );

        return ExecuteNormalizedCommandRoutingAsync(
            command,
            request.Source,
            request.CancellationToken,
            InputAttachmentPolicy.Normalize(request.Attachments),
            request.WebUrls,
            request.WebSearchEnabled
        );
    }

    private async Task<string> ExecuteNaturalCompoundCommandsAsync(
        string source,
        IReadOnlyList<string> compoundCommands,
        CancellationToken cancellationToken,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled
    )
    {
        _auditLogger.Log(
            source,
            "natural_command_compound",
            "ok",
            $"count={compoundCommands.Count} cmds={string.Join(",", compoundCommands)}"
        );

        var combined = new StringBuilder();
        foreach (var cmd in compoundCommands)
        {
            var partial = await ExecuteNaturalCommandDispatchAsync(new NaturalCommandExecutionRequest(
                cmd,
                source,
                cancellationToken,
                attachments,
                webUrls,
                webSearchEnabled
            ));
            if (combined.Length > 0)
            {
                combined.Append("\n\n");
            }

            combined.Append(partial);
        }

        return combined.ToString();
    }

    private async Task<string> ExecuteNaturalDeterministicCommandAsync(
        string source,
        string deterministicCommand,
        CancellationToken cancellationToken,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled
    )
    {
        _auditLogger.Log(
            source,
            "natural_command_deterministic",
            "ok",
            $"cmd={NormalizeAuditToken(deterministicCommand, "-")}"
        );
        return await ExecuteNaturalCommandDispatchAsync(new NaturalCommandExecutionRequest(
            deterministicCommand,
            source,
            cancellationToken,
            attachments,
            webUrls,
            webSearchEnabled
        ));
    }

    private async Task<string> ExecuteNaturalResolvedCommandAsync(
        string source,
        string slashCommand,
        NaturalCommandInterpretation interpretation,
        CancellationToken cancellationToken,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled
    )
    {
        var resolvedSlashCommand = slashCommand.Trim();
        _auditLogger.Log(
            source,
            "natural_command_resolved",
            "ok",
            $"cmd={NormalizeAuditToken(resolvedSlashCommand, "-")} confidence={interpretation.Confidence.ToString("0.00", CultureInfo.InvariantCulture)}"
        );
        return await ExecuteNaturalCommandDispatchAsync(new NaturalCommandExecutionRequest(
            resolvedSlashCommand,
            source,
            cancellationToken,
            attachments,
            webUrls,
            webSearchEnabled
        ));
    }

    private sealed record NaturalCommandExecutionRequest(
        string Command,
        string Source,
        CancellationToken CancellationToken,
        IReadOnlyList<InputAttachment>? Attachments,
        IReadOnlyList<string>? WebUrls,
        bool WebSearchEnabled
    );
}

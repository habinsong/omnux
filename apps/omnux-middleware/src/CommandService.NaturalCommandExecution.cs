using System.Globalization;
using System.Text;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private Task<string> ReenterNaturalCommandAsync(
        string command,
        string source,
        CancellationToken cancellationToken,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled
    )
    {
        // 자연어 결과가 다시 슬래시 명령으로 재진입하는 경계.
        return ExecuteAsync(command, source, cancellationToken, attachments, webUrls, webSearchEnabled);
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
            var partial = await ReenterNaturalCommandAsync(cmd, source, cancellationToken, attachments, webUrls, webSearchEnabled);
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
        return await ReenterNaturalCommandAsync(deterministicCommand, source, cancellationToken, attachments, webUrls, webSearchEnabled);
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
        return await ReenterNaturalCommandAsync(resolvedSlashCommand, source, cancellationToken, attachments, webUrls, webSearchEnabled);
    }
}

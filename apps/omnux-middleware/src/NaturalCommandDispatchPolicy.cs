namespace Omnux.Middleware;

internal sealed record NaturalCommandDispatchDecision(
    bool ShouldExecute,
    bool IsChat,
    string? SlashCommand,
    string? Message,
    string Code
);

internal static class NaturalCommandDispatchPolicy
{
    public static NaturalCommandDispatchDecision Resolve(
        string source,
        NaturalCommandInterpretation? interpretation,
        string rawInput
    )
    {
        if (interpretation == null)
        {
            return new NaturalCommandDispatchDecision(false, true, null, null, "empty");
        }

        var validation = NaturalCommandValidationPolicy.ValidateNaturalCommandInterpretation(
            source,
            interpretation,
            rawInput
        );
        if (validation.IsChat)
        {
            return new NaturalCommandDispatchDecision(false, true, null, null, validation.Code);
        }

        if (!validation.Valid)
        {
            return validation.Code == "natural_kill_disallowed"
                ? new NaturalCommandDispatchDecision(false, false, null, validation.Message, validation.Code)
                : new NaturalCommandDispatchDecision(false, false, null, null, validation.Code);
        }

        var slashCommand = validation.Canonical?.SlashCommand.Trim();
        if (string.IsNullOrWhiteSpace(slashCommand) || !slashCommand.StartsWith("/", StringComparison.Ordinal))
        {
            return new NaturalCommandDispatchDecision(false, false, null, null, "invalid_slash_command");
        }

        return new NaturalCommandDispatchDecision(true, false, slashCommand, null, validation.Code);
    }
}

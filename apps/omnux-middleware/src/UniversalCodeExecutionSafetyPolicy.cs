namespace Omnux.Middleware;

internal static class UniversalCodeExecutionSafetyPolicy
{
    public static UniversalCodeExecutionSafetyDecision EvaluateScript(string language, string code)
    {
        var normalizedLanguage = NormalizeLanguage(language);
        if (normalizedLanguage != "bash")
        {
            return UniversalCodeExecutionSafetyDecision.Allow();
        }

        var normalizedCode = (code ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Trim();
        if (string.IsNullOrWhiteSpace(normalizedCode))
        {
            return UniversalCodeExecutionSafetyDecision.Allow();
        }

        foreach (var fragment in EnumerateShellFragments(normalizedCode))
        {
            if (CodingExecutionSafetyPolicy.IsDangerousGeneratedRunCommand(fragment))
            {
                return UniversalCodeExecutionSafetyDecision.Block(
                    "dangerous_shell_pattern",
                    "shell script contains a destructive, bootstrap, or workspace-escape command"
                );
            }
        }

        return UniversalCodeExecutionSafetyDecision.Allow();
    }

    private static IEnumerable<string> EnumerateShellFragments(string code)
    {
        yield return code.Replace("\n", "; ", StringComparison.Ordinal);

        foreach (var line in code.Split('\n', StringSplitOptions.TrimEntries))
        {
            if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#'))
            {
                continue;
            }

            yield return line;
        }
    }

    private static string NormalizeLanguage(string language)
    {
        var value = (language ?? string.Empty).Trim().ToLowerInvariant();
        return value switch
        {
            "shell" => "bash",
            "sh" => "bash",
            _ => value
        };
    }
}

internal readonly record struct UniversalCodeExecutionSafetyDecision(
    bool Allowed,
    string Reason,
    string Message
)
{
    public static UniversalCodeExecutionSafetyDecision Allow()
    {
        return new UniversalCodeExecutionSafetyDecision(true, string.Empty, string.Empty);
    }

    public static UniversalCodeExecutionSafetyDecision Block(string reason, string message)
    {
        return new UniversalCodeExecutionSafetyDecision(false, reason, message);
    }
}

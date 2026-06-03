using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal static class McpConfigSecretRedactionPolicy
{
    private const int MaxArgPreviewChars = 160;

    private static readonly Regex InlineSecretRegex = new(
        @"(?<key>(?:api[_-]?key|token|secret|password|pat|auth)[^=\s]*=)(?<value>[^\s]+)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );

    public static IReadOnlyList<string> RedactArgs(IReadOnlyList<string> args)
    {
        var redacted = new List<string>(args.Count);
        var redactNext = false;
        foreach (var arg in args)
        {
            if (redactNext || LooksSensitiveArg(arg))
            {
                redacted.Add("<redacted>");
                redactNext = false;
                if (IsSensitiveFlag(arg) && !arg.Contains('='))
                {
                    redactNext = true;
                }
                continue;
            }

            if (IsSensitiveFlag(arg))
            {
                redacted.Add(arg);
                redactNext = true;
                continue;
            }

            redacted.Add(TrimForPreview(RedactInlineSecrets(arg)));
        }

        return redacted;
    }

    public static string RedactInlineSecrets(string value)
    {
        return InlineSecretRegex.Replace(value ?? string.Empty, "${key}<redacted>");
    }

    private static bool LooksSensitiveArg(string arg)
    {
        var value = arg ?? string.Empty;
        return InlineSecretRegex.IsMatch(value)
               || value.StartsWith("ghp_", StringComparison.OrdinalIgnoreCase)
               || value.StartsWith("sk-", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSensitiveFlag(string arg)
    {
        var value = (arg ?? string.Empty).Trim().ToLowerInvariant();
        if (!value.StartsWith('-'))
        {
            return false;
        }

        return value.Contains("token", StringComparison.Ordinal)
               || value.Contains("api-key", StringComparison.Ordinal)
               || value.Contains("apikey", StringComparison.Ordinal)
               || value.Contains("secret", StringComparison.Ordinal)
               || value.Contains("password", StringComparison.Ordinal)
               || value.Contains("auth", StringComparison.Ordinal)
               || value.EndsWith("pat", StringComparison.Ordinal);
    }

    private static string TrimForPreview(string value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return normalized.Length <= MaxArgPreviewChars
            ? normalized
            : normalized[..MaxArgPreviewChars] + "...";
    }
}

namespace Omnux.Middleware;

internal static class Env
{
    public static string? Get(string key)
    {
        var value = Environment.GetEnvironmentVariable(key);
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        if (key.StartsWith("OMNUX_", StringComparison.Ordinal))
        {
            value = Environment.GetEnvironmentVariable("OMNINODE_" + key["OMNUX_".Length..]);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }
}

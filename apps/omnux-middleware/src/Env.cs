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

        return null;
    }
}

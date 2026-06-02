namespace Omnux.Middleware;

internal static class KillCommandPolicy
{
    public static bool TryParse(string text, out int pid)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            pid = 0;
            return false;
        }

        if (!text.StartsWith("/kill ", StringComparison.OrdinalIgnoreCase))
        {
            pid = 0;
            return false;
        }

        var tokens = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length != 2)
        {
            pid = 0;
            return false;
        }

        if (!int.TryParse(tokens[1], out var parsedPid) || parsedPid <= 1)
        {
            pid = 0;
            return false;
        }

        pid = parsedPid;
        return true;
    }
}

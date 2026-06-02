namespace Omnux.Middleware;

internal static class LocalTimeTextPolicy
{
    public static string BuildLocalNowText(
        DateTimeOffset? now = null,
        TimeZoneInfo? localTimeZone = null
    )
    {
        var current = now ?? DateTimeOffset.Now;
        var timezone = localTimeZone ?? TimeZoneInfo.Local;
        return $"{current:yyyy-MM-dd HH:mm:ss} ({FormatUtcOffsetLabel(current.Offset)}, {timezone.Id})";
    }

    public static string FormatUtcOffsetLabel(TimeSpan offset)
    {
        var sign = offset < TimeSpan.Zero ? "-" : "+";
        var abs = offset < TimeSpan.Zero ? offset.Negate() : offset;
        return $"UTC{sign}{abs:hh\\:mm}";
    }
}

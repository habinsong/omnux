using System.Text;

namespace Omnux.Middleware;

internal sealed class FileGitOperationPreviewStore
{
    public const int DefaultTtlMinutes = 30;

    private readonly string _statePath;
    private readonly TimeSpan _ttl;
    private readonly Func<DateTimeOffset> _utcNow;

    public FileGitOperationPreviewStore(
        string statePath,
        TimeSpan? ttl = null,
        Func<DateTimeOffset>? utcNow = null
    )
    {
        _statePath = Path.GetFullPath(string.IsNullOrWhiteSpace(statePath)
            ? DefaultStatePathResolver.CreateDefault().ResolveStateFilePath("git_operation_previews.json")
            : statePath);
        _ttl = ttl ?? TimeSpan.FromMinutes(DefaultTtlMinutes);
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public DateTimeOffset BuildExpiry()
    {
        return _utcNow().Add(_ttl);
    }

    public void Save(GitOperationPreviewRecord record)
    {
        var state = LoadState(deleteExpired: true);
        var records = state.Records
            .Where(existing => !string.Equals(existing.PreviewId, record.PreviewId, StringComparison.Ordinal))
            .Append(record)
            .OrderBy(existing => existing.CreatedAtUtc)
            .ToArray();

        WriteState(new GitOperationPreviewState(records));
    }

    public GitOperationPreviewRecord? TryLoad(string previewId)
    {
        var trimmed = (previewId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return null;
        }

        var state = LoadState(deleteExpired: true);
        var record = state.Records.FirstOrDefault(existing =>
            string.Equals(existing.PreviewId, trimmed, StringComparison.Ordinal)
        );
        if (record == null || IsExpired(record))
        {
            Delete(trimmed);
            return null;
        }

        return record;
    }

    public void Delete(string previewId)
    {
        var trimmed = (previewId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return;
        }

        var state = LoadState(deleteExpired: false);
        var records = state.Records
            .Where(existing => !string.Equals(existing.PreviewId, trimmed, StringComparison.Ordinal))
            .ToArray();
        WriteState(new GitOperationPreviewState(records));
    }

    public void DeleteExpired()
    {
        _ = LoadState(deleteExpired: true);
    }

    private GitOperationPreviewState LoadState(bool deleteExpired)
    {
        if (!File.Exists(_statePath))
        {
            return new GitOperationPreviewState(Array.Empty<GitOperationPreviewRecord>());
        }

        GitOperationPreviewState? state;
        try
        {
            var json = AtomicFileStore.ReadAllTextWithBackup(
                _statePath,
                IsValidStateJson,
                Encoding.UTF8,
                "git-operation-preview-store"
            );
            state = string.IsNullOrWhiteSpace(json)
                ? null
                : GitOperationJson.DeserializeState(json);
        }
        catch
        {
            state = null;
        }

        state ??= new GitOperationPreviewState(Array.Empty<GitOperationPreviewRecord>());
        if (!deleteExpired)
        {
            return state;
        }

        var records = state.Records.Where(record => !IsExpired(record)).ToArray();
        if (records.Length != state.Records.Count)
        {
            WriteState(new GitOperationPreviewState(records));
        }

        return new GitOperationPreviewState(records);
    }

    private void WriteState(GitOperationPreviewState state)
    {
        AtomicFileStore.WriteAllText(
            _statePath,
            GitOperationJson.Serialize(state, indented: true),
            ownerOnly: true
        );
    }

    private bool IsExpired(GitOperationPreviewRecord record)
    {
        return record.ExpiresAtUtc <= _utcNow();
    }

    private static bool IsValidStateJson(string json)
    {
        try
        {
            return GitOperationJson.DeserializeState(json) != null;
        }
        catch
        {
            return false;
        }
    }
}

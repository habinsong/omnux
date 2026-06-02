using System.Text.Json;

namespace Omnux.Middleware;

public sealed record SyncConfiguration(
    string? GistId,
    string? GitHubToken,
    DateTimeOffset? LastSyncUtc
);

public interface ISyncConfigurationStore
{
    SyncConfiguration Read();
    void Write(SyncConfiguration config);
}

public sealed class SyncConfigurationStore : ISyncConfigurationStore
{
    private readonly string _configFilePath;
    private readonly object _lock = new();

    public SyncConfigurationStore(PathOptions paths)
    {
        var stateRoot = Path.GetDirectoryName(Path.GetFullPath(paths.ConversationStatePath))
                        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".omnux");
        _configFilePath = Path.Combine(stateRoot, "sync-config.json");
    }

    public SyncConfiguration Read()
    {
        lock (_lock)
        {
            if (!File.Exists(_configFilePath))
            {
                return new SyncConfiguration(null, null, null);
            }

            try
            {
                var json = File.ReadAllText(_configFilePath);
                var config = JsonSerializer.Deserialize(json, OmniJsonContext.Default.SyncConfiguration);
                return config ?? new SyncConfiguration(null, null, null);
            }
            catch
            {
                return new SyncConfiguration(null, null, null);
            }
        }
    }

    public void Write(SyncConfiguration config)
    {
        lock (_lock)
        {
            var directory = Path.GetDirectoryName(_configFilePath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var json = JsonSerializer.Serialize(config, OmniJsonContext.Default.SyncConfiguration);
            File.WriteAllText(_configFilePath, json);
        }
    }
}

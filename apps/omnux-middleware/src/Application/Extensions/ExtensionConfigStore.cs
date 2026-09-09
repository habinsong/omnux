using System.Text;

namespace Omnux.Middleware;

/// <summary>저장 결과. 실패를 호출자에게 그대로 전달한다.</summary>
internal sealed record ExtensionConfigSaveResult(
    bool Saved,
    string Error,
    ExtensionConfigSnapshot Snapshot
);

/// <summary>
/// 확장 설정 파일 저장소. 손상·미래 버전 문서를 덮어쓰지 않고,
/// 쓰기 실패를 성공으로 바꾸지 않는다.
/// </summary>
internal sealed class ExtensionConfigStore
{
    public const string FileName = "extensions.json";
    public const string PathEnvName = "OMNUX_EXTENSIONS_PATH";

    private readonly string _path;
    private readonly object _writeLock = new();

    public ExtensionConfigStore(string? path = null)
    {
        _path = path ?? ResolveDefaultPath();
    }

    public string Path => _path;

    public static string ResolveDefaultPath()
    {
        var configured = (Environment.GetEnvironmentVariable(PathEnvName) ?? string.Empty).Trim();
        if (configured.Length > 0)
        {
            return System.IO.Path.GetFullPath(configured);
        }

        return DefaultStatePathResolver.CreateDefault().ResolveStateFilePath(FileName);
    }

    public ExtensionConfigSnapshot Read()
    {
        if (!File.Exists(_path))
        {
            return ExtensionConfigSnapshot.Empty;
        }

        string text;
        try
        {
            text = File.ReadAllText(_path, Encoding.UTF8);
        }
        catch (Exception exception)
        {
            return ExtensionConfigSnapshot.Empty with
            {
                Exists = true,
                LoadError = $"설정을 읽지 못했다: {exception.Message}"
            };
        }

        var parsed = ExtensionConfigJson.Parse(text);
        var updated = ReadUpdatedUtc();
        if (parsed.Damaged || parsed.UnsupportedVersion)
        {
            return parsed.Snapshot with { Exists = true, UpdatedUtc = updated };
        }

        return parsed.Snapshot with { Exists = true, UpdatedUtc = updated };
    }

    /// <summary>
    /// 설정 저장. 기존 문서가 손상됐거나 미래 버전이면 기본값으로 덮어쓰지 않고 거부한다.
    /// 사용자가 명시적으로 복구를 선택한 경우에만 allowOverwriteDamaged 를 켠다.
    /// </summary>
    public ExtensionConfigSaveResult Save(
        ExtensionConfigSnapshot snapshot,
        bool allowOverwriteDamaged = false
    )
    {
        var current = Read();
        if (!allowOverwriteDamaged && current.Exists && current.LoadError.Length > 0)
        {
            return new ExtensionConfigSaveResult(
                Saved: false,
                Error: $"기존 설정을 읽지 못해 저장을 중단했다: {current.LoadError}",
                Snapshot: current
            );
        }

        var payload = ExtensionConfigJson.Serialize(
            snapshot with { UpdatedUtc = DateTime.UtcNow.ToString("O") }
        );

        lock (_writeLock)
        {
            try
            {
                AtomicFileStore.WriteAllText(_path, payload + "\n", ownerOnly: true);
            }
            catch (Exception exception)
            {
                return new ExtensionConfigSaveResult(
                    Saved: false,
                    Error: $"설정을 저장하지 못했다: {exception.Message}",
                    Snapshot: current
                );
            }
        }

        var reloaded = Read();
        if (reloaded.LoadError.Length > 0)
        {
            return new ExtensionConfigSaveResult(
                Saved: false,
                Error: $"저장 후 재확인에 실패했다: {reloaded.LoadError}",
                Snapshot: reloaded
            );
        }

        return new ExtensionConfigSaveResult(Saved: true, Error: string.Empty, Snapshot: reloaded);
    }

    private string ReadUpdatedUtc()
    {
        try
        {
            return File.GetLastWriteTimeUtc(_path).ToString("O");
        }
        catch (Exception)
        {
            return string.Empty;
        }
    }
}

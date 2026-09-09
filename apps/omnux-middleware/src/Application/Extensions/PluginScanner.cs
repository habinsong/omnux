using System.Text;

namespace Omnux.Middleware;

/// <summary>플러그인 탐색 결과. 읽기 실패한 경로를 목록에서 지우지 않고 보고한다.</summary>
internal sealed record PluginScanResult(
    IReadOnlyList<PluginEntry> Entries,
    IReadOnlyList<string> ScannedRoots,
    IReadOnlyList<string> Errors
);

/// <summary>
/// 로컬 디렉터리 기반 플러그인 탐색. 네트워크 설치는 하지 않는다.
/// 각 루트의 1단계 하위 디렉터리에서 omnux-plugin.json 을 찾는다.
/// </summary>
internal sealed class PluginScanner
{
    public const string DefaultDirectoryName = "plugins";
    public const string RootEnvName = "OMNUX_PLUGINS_ROOT";
    public const int MaxPluginsPerRoot = 128;

    private readonly IReadOnlyList<string> _roots;

    public PluginScanner(IReadOnlyList<string> roots)
    {
        _roots = roots;
    }

    /// <summary>항상 검사하는 기본 폴더. 환경 변수로 바꿀 수 있어 검사에서 개인 상태를 피할 수 있다.</summary>
    public static string ResolveDefaultRoot()
    {
        var configured = (Environment.GetEnvironmentVariable(RootEnvName) ?? string.Empty).Trim();
        if (configured.Length > 0)
        {
            return Path.GetFullPath(configured);
        }

        return DefaultStatePathResolver.CreateDefault().ResolveStateDirectoryPath(DefaultDirectoryName);
    }

    public PluginScanResult Scan(IReadOnlyCollection<string> disabledPluginIds)
    {
        var entries = new List<PluginEntry>();
        var errors = new List<string>();
        var scanned = new List<string>();
        var seenIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var root in _roots)
        {
            var fullRoot = SafeFullPath(root, errors);
            if (fullRoot.Length == 0)
            {
                continue;
            }

            scanned.Add(fullRoot);
            if (!Directory.Exists(fullRoot))
            {
                // 아직 만들지 않은 폴더는 오류가 아니다. 목록에는 남긴다.
                continue;
            }

            string[] directories;
            try
            {
                directories = Directory.GetDirectories(fullRoot);
            }
            catch (Exception exception)
            {
                errors.Add($"{fullRoot}: 하위 폴더를 읽지 못했다 ({exception.Message})");
                continue;
            }

            Array.Sort(directories, StringComparer.Ordinal);
            var count = 0;
            foreach (var directory in directories)
            {
                if (count >= MaxPluginsPerRoot)
                {
                    errors.Add($"{fullRoot}: 플러그인이 상한 {MaxPluginsPerRoot}개를 넘어 이후 폴더를 건너뛰었다");
                    break;
                }

                var manifestPath = Path.Combine(directory, PluginManifestParser.ManifestFileName);
                if (!File.Exists(manifestPath))
                {
                    continue;
                }

                count++;
                string text;
                try
                {
                    text = File.ReadAllText(manifestPath, Encoding.UTF8);
                }
                catch (Exception exception)
                {
                    errors.Add($"{manifestPath}: 읽지 못했다 ({exception.Message})");
                    continue;
                }

                var manifest = PluginManifestParser.Parse(text, directory);
                if (manifest.Id.Length > 0 && !seenIds.Add(manifest.Id))
                {
                    errors.Add($"{manifestPath}: 중복 플러그인 id {manifest.Id} — 먼저 찾은 항목을 유지했다");
                    continue;
                }

                if (!manifest.IsValid)
                {
                    foreach (var error in manifest.Errors)
                    {
                        errors.Add($"{manifestPath}: {error}");
                    }
                }

                var enabled = manifest.IsValid && !disabledPluginIds.Contains(manifest.Id);
                entries.Add(new PluginEntry(manifest, enabled));
            }
        }

        return new PluginScanResult(entries, scanned, errors);
    }

    /// <summary>활성 플러그인이 기여한 훅. 비활성·손상 플러그인의 훅은 포함하지 않는다.</summary>
    public static IReadOnlyList<HookDefinition> CollectHooks(IReadOnlyList<PluginEntry> entries)
    {
        var hooks = new List<HookDefinition>();
        foreach (var entry in entries)
        {
            if (!entry.Enabled || !entry.Manifest.IsValid)
            {
                continue;
            }

            hooks.AddRange(entry.Manifest.Hooks);
        }

        return hooks;
    }

    /// <summary>활성 플러그인이 기여한 규칙.</summary>
    public static IReadOnlyList<ExtensionRule> CollectRules(IReadOnlyList<PluginEntry> entries)
    {
        var rules = new List<ExtensionRule>();
        foreach (var entry in entries)
        {
            if (!entry.Enabled || !entry.Manifest.IsValid)
            {
                continue;
            }

            rules.AddRange(entry.Manifest.Rules);
        }

        return rules;
    }

    private static string SafeFullPath(string root, ICollection<string> errors)
    {
        var trimmed = (root ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return string.Empty;
        }

        try
        {
            return Path.GetFullPath(trimmed);
        }
        catch (Exception exception)
        {
            errors.Add($"{trimmed}: 경로를 해석하지 못했다 ({exception.Message})");
            return string.Empty;
        }
    }
}

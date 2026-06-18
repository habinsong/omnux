using System.Text;

namespace Omnux.Middleware;

public sealed record UserRulesSnapshot(string Text, string UpdatedUtc, bool Exists);

/// <summary>
/// 사용자 전역 규칙/페르소나 저장소 (ASK_ORCHESTRATION_PLAN.md P1-2).
/// 단일 마크다운 파일(state/user_rules.md) — 스킬(작업방식 단발)과 달리 모든 답변에
/// 상시 주입되는 짧은 지침이다. 저장 캡 4,000자, 주입 캡 600자.
/// 프로젝트별 규칙은 v2(계획서 기록) — v1 은 전역 한 문서로 단순하게 간다.
/// </summary>
public static class UserRuleStore
{
    public const int SaveMaxChars = 4000;
    public const int InjectionMaxChars = 600;

    private const string FileName = "user_rules.md";
    private const string PathEnvName = "OMNUX_USER_RULES_PATH";
    private static readonly object WriteLock = new();

    public static string ResolveDefaultPath()
    {
        var overridePath = (Environment.GetEnvironmentVariable(PathEnvName) ?? string.Empty).Trim();
        if (overridePath.Length > 0)
        {
            return Path.GetFullPath(overridePath);
        }

        return DefaultStatePathResolver.CreateDefault().ResolveStateFilePath(FileName);
    }

    public static UserRulesSnapshot Read(string? path = null)
    {
        var fullPath = path ?? ResolveDefaultPath();
        try
        {
            if (!File.Exists(fullPath))
            {
                return new UserRulesSnapshot(string.Empty, string.Empty, false);
            }

            var text = File.ReadAllText(fullPath, Encoding.UTF8).Trim();
            var updated = File.GetLastWriteTimeUtc(fullPath).ToString("O");
            return new UserRulesSnapshot(text, updated, true);
        }
        catch
        {
            return new UserRulesSnapshot(string.Empty, string.Empty, false);
        }
    }

    public static UserRulesSnapshot Save(string? text, string? path = null)
    {
        var fullPath = path ?? ResolveDefaultPath();
        var normalized = (text ?? string.Empty).Replace("\r\n", "\n", StringComparison.Ordinal).Trim();
        if (normalized.Length > SaveMaxChars)
        {
            normalized = normalized[..SaveMaxChars].TrimEnd();
        }

        lock (WriteLock)
        {
            AtomicFileStore.WriteAllText(fullPath, normalized + "\n", ownerOnly: true);
        }

        return Read(fullPath);
    }

    public static UserRulesSnapshot Delete(string? path = null)
    {
        var fullPath = path ?? ResolveDefaultPath();
        lock (WriteLock)
        {
            try
            {
                if (File.Exists(fullPath))
                {
                    File.Delete(fullPath);
                }
            }
            catch
            {
                // 삭제 실패는 Read 결과(Exists)로 드러난다.
            }
        }

        return Read(fullPath);
    }

    /// <summary>프롬프트 주입용 절단 — 600자 캡, 줄 단위 우선 보존.</summary>
    public static string ClampForInjection(string? text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (normalized.Length <= InjectionMaxChars)
        {
            return normalized;
        }

        var clipped = normalized[..InjectionMaxChars];
        var lastNewline = clipped.LastIndexOf('\n');
        if (lastNewline > InjectionMaxChars / 2)
        {
            clipped = clipped[..lastNewline];
        }

        return clipped.TrimEnd() + "\n…(이하 생략)";
    }
}

using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private string ActivateTelegramSkill(string name, string? scope, bool returnAck)
    {
        var skill = FindSkill(name, scope);
        if (skill == null)
        {
            return $"스킬을 찾지 못했습니다: {name}";
        }

        var key = ResolveTelegramStateKey();
        if (!string.IsNullOrWhiteSpace(key))
        {
            _activeSkillByThread[key] = skill.Name;
            PersistActiveSkillForThread(key, skill.Name);
        }

        _auditLogger.Log("telegram", "skill_activate", "ok", $"name={skill.Name} scope={skill.Scope}");
        if (!returnAck)
        {
            return string.Empty;
        }

        return $"""
               `{skill.Name}` 스킬을 텔레그램 대화에 적용했습니다.
               다음 메시지부터 이 스킬 지침을 우선 적용합니다.

               - 범위: {skill.Scope}
               - 설명: {LocalAssistantQuestionPolicy.TrimAssistantInfoText(skill.Description, 120)}
               - 해제: /skill off
               """;
    }

    // 현재 텔레그램 thread에 활성화된 스킬 정보를 반환. 없으면 안내.
    private string BuildTelegramSkillStatusResponse()
    {
        var key = ResolveTelegramStateKey();
        if (string.IsNullOrWhiteSpace(key)
            || !_activeSkillByThread.TryGetValue(key, out var active)
            || string.IsNullOrWhiteSpace(active))
        {
            return AppendTelegramInlineButtons(
                """
                현재 텔레그램 대화에 활성화된 스킬이 없습니다.
                - 활성화: /skill use <name>
                - 목록: /skill list
                """,
                ("/skill list", "📋 목록"),
                ("/help skill", "ℹ️ 도움말")
            );
        }

        var skill = FindSkill(active, null);
        if (skill == null)
        {
            return AppendTelegramInlineButtons(
                $"활성 스킬: `{active}` (스냅샷에서 본문을 찾지 못함 — 재로드 권장)",
                ("/skill off", "🚫 끄기"),
                ("/skill list", "📋 목록")
            );
        }

        return AppendTelegramInlineButtons(
            $"""
            🎯 활성 스킬: `{skill.Name}`
            - 범위: {skill.Scope}
            - 설명: {LocalAssistantQuestionPolicy.TrimAssistantInfoText(skill.Description, 160)}
            - 해제: /skill off
            - 다른 스킬로 전환: /skill use <name>
            """,
            ("/skill off", "🚫 끄기"),
            ("/skill list", "📋 목록")
        );
    }

    private string DeactivateTelegramSkill()
    {
        var key = ResolveTelegramStateKey();
        if (!string.IsNullOrWhiteSpace(key)
            && _activeSkillByThread.TryRemove(key, out var skillName))
        {
            PersistActiveSkillForThread(key, null);
            _auditLogger.Log("telegram", "skill_deactivate", "ok", $"name={skillName}");
            return $"`{skillName}` 스킬을 해제했습니다.";
        }

        return "현재 텔레그램 대화에 활성화된 스킬이 없습니다.";
    }

    private string BuildTelegramSkillGetResponse(string name, string? scope)
    {
        var result = SkillFiles.Get(name, scope);
        if (!result.Ok)
        {
            return $"스킬 불러오기 실패: {result.Error}";
        }

        var body = LocalAssistantQuestionPolicy.TrimToUtf8ByteCount((result.Body ?? string.Empty).Trim(), 2300);
        if (string.IsNullOrWhiteSpace(body))
        {
            body = "(본문 없음)";
        }

        return $"""
               [스킬]
               - 이름: {result.Name}
               - 범위: {result.Scope}
               - 설명: {LocalAssistantQuestionPolicy.TrimAssistantInfoText(result.Description, 180)}
               - 경로: {RelativizeSkillPathForTelegram(result.Path)}

               [SKILL.md]
               {body}
               """;
    }

    private SkillManifest? FindMentionedSkill(string normalizedText)
    {
        // 공통 단어 경계 검사 helper 사용. 다중 스킬은 상위에서 거부되므로 첫 매칭만 사용.
        return DetectMentionedSkillsInPrompt(normalizedText).FirstOrDefault();
    }

    private SkillManifest? FindSkill(string name, string? scope)
    {
        var normalizedName = (name ?? string.Empty).Trim();
        var normalizedScope = (scope ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedName))
        {
            return null;
        }

        try
        {
            return _projectContextLoader.LoadSnapshot()
                .Skills
                .Where(skill => skill.Name.Equals(normalizedName, StringComparison.OrdinalIgnoreCase))
                .Where(skill => string.IsNullOrWhiteSpace(normalizedScope)
                                || skill.Scope.Equals(normalizedScope, StringComparison.OrdinalIgnoreCase))
                .OrderBy(skill => skill.Scope.Equals("project", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
                .FirstOrDefault();
        }
        catch (Exception ex)
        {
            _auditLogger.Log("telegram", "skill_find", "failed", ex.Message);
            return null;
        }
    }

    private static bool LooksLikeTelegramSkillActivationRequest(string normalized, string compact, bool hasSkillMention)
    {
        if (!hasSkillMention
            && !ContainsAny(normalized, "스킬", "skill", "skills", "skill.md")
            && !compact.Contains("스킬", StringComparison.Ordinal)
            && !compact.Contains("skill", StringComparison.Ordinal))
        {
            return false;
        }

        return ContainsAny(
            normalized,
            "사용해",
            "사용해줘",
            "써",
            "써줘",
            "적용해",
            "켜",
            "켜줘",
            "활성화",
            "불러",
            "불러와",
            "로드",
            "activate",
            "use",
            "load")
            || compact.Contains("사용해", StringComparison.Ordinal)
            || compact.Contains("사용해줘", StringComparison.Ordinal)
            || compact.Contains("활성화", StringComparison.Ordinal)
            || compact.Contains("불러와", StringComparison.Ordinal)
            || compact.Contains("activate", StringComparison.Ordinal)
            || compact.Contains("use", StringComparison.Ordinal)
            || compact.Contains("load", StringComparison.Ordinal);
    }

    private static bool LooksLikeInlineSkillTask(string normalized)
    {
        return Regex.IsMatch(
                   normalized,
                   @"(?i)(사용해서|써서|적용해서|활용해서|이용해서|가지고|using\s+|use\s+\S+\s+to\s+)"
               )
               || ContainsAny(
                   normalized,
                   "설명",
                   "알려",
                   "말해",
                   "정리",
                   "분석",
                   "비교",
                   "원리",
                   "방법",
                   "이유",
                   "어떻게",
                   "왜",
                   "도와",
                   "해줘",
                   "해 줘",
                   "explain",
                   "describe",
                   "tell",
                   "summarize",
                   "compare",
                   "analyze");
    }

    private static (string Name, string? Scope) ParseTelegramSkillNameAndScope(string[] tokens, int startIndex)
    {
        var name = startIndex < tokens.Length ? tokens[startIndex].Trim() : string.Empty;
        string? scope = null;
        if (startIndex + 1 < tokens.Length)
        {
            var candidate = tokens[startIndex + 1].Trim().ToLowerInvariant();
            if (candidate is "project" or "global")
            {
                scope = candidate;
            }
        }

        return (name, scope);
    }

    private static (string Description, string Body)? ExtractTelegramSkillBodySpec(string command)
    {
        var parts = (command ?? string.Empty).Replace("\r\n", "\n").Split('\n', 2);
        if (parts.Length < 2)
        {
            return null;
        }

        var payload = parts[1].Trim();
        if (string.IsNullOrWhiteSpace(payload))
        {
            return null;
        }

        var split = Regex.Split(payload, @"(?m)^\s*---\s*$", RegexOptions.None, TimeSpan.FromMilliseconds(100));
        if (split.Length >= 2)
        {
            var description = split[0].Trim();
            var body = string.Join("\n---\n", split.Skip(1)).Trim();
            if (!string.IsNullOrWhiteSpace(description) && !string.IsNullOrWhiteSpace(body))
            {
                return (description, body);
            }
        }

        var lines = payload.Split('\n');
        if (lines.Length >= 2)
        {
            var description = lines[0].Trim();
            var body = string.Join('\n', lines.Skip(1)).Trim();
            if (!string.IsNullOrWhiteSpace(description) && !string.IsNullOrWhiteSpace(body))
            {
                return (description, body);
            }
        }

        return null;
    }

    private static string BuildTelegramSkillCreateUsage()
    {
        return """
               사용법:
               /skill create <name> [project|global]
               한 줄 설명
               ---
               스킬 본문

               예:
               /skill create casual-empathy project
               일상 대화에서 감정을 먼저 인정하고 짧게 공감한다.
               ---
               - 답변 시작은 사용자의 감정/상황을 한 문장으로 인정한다.
               - 해결책은 사용자가 원할 때만 짧게 제안한다.
               """;
    }

    private string RelativizeSkillPathForTelegram(string path)
    {
        var normalized = (path ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "-";
        }

        var projectRoot = Path.GetFullPath(_paths.WorkspaceRootDir);
        try
        {
            if (normalized.StartsWith(projectRoot, StringComparison.Ordinal))
            {
                return Path.GetRelativePath(projectRoot, normalized).Replace('\\', '/');
            }
        }
        catch
        {
        }

        return normalized;
    }
}

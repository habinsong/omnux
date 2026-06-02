using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    // 사용자가 등록한 스킬 별명. key=alias(lowercase), value=skill name.
    // 시작 시 디스크에서 복원, 변경 시마다 저장.
    private readonly ConcurrentDictionary<string, string> _skillAliases =
        new(StringComparer.OrdinalIgnoreCase);
    private string? _skillAliasesStatePath;
    private string SkillAliasesStatePath
    {
        get
        {
            if (!string.IsNullOrWhiteSpace(_skillAliasesStatePath))
            {
                return _skillAliasesStatePath!;
            }
            var stateBaseDir = Path.GetDirectoryName(_paths.ConversationStatePath);
            if (string.IsNullOrWhiteSpace(stateBaseDir))
            {
                var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                stateBaseDir = string.IsNullOrWhiteSpace(home)
                    ? Path.GetTempPath()
                    : Path.Combine(home, ".omnux");
            }
            _skillAliasesStatePath = Path.Combine(stateBaseDir!, "skill_aliases.json");
            return _skillAliasesStatePath!;
        }
    }

    private void EnsureSkillAliasesLoaded()
    {
        if (_skillAliases.Count > 0)
        {
            return;
        }
        try
        {
            if (!File.Exists(SkillAliasesStatePath))
            {
                return;
            }
            var json = File.ReadAllText(SkillAliasesStatePath, Encoding.UTF8);
            if (string.IsNullOrWhiteSpace(json))
            {
                return;
            }
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return;
            }
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (prop.Value.ValueKind == JsonValueKind.String)
                {
                    var v = prop.Value.GetString();
                    if (!string.IsNullOrWhiteSpace(v))
                    {
                        _skillAliases[prop.Name] = v!;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _auditLogger.Log("local", "skill_alias_load", "failed", ex.Message);
        }
    }

    private static string EscapeJsonString(string value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        var sb = new StringBuilder(value.Length + 8);
        foreach (var c in value)
        {
            switch (c)
            {
                case '\\': sb.Append("\\\\"); break;
                case '"': sb.Append("\\\""); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20)
                    {
                        sb.AppendFormat("\\u{0:X4}", (int)c);
                    }
                    else
                    {
                        sb.Append(c);
                    }
                    break;
            }
        }
        return sb.ToString();
    }

    private void SaveSkillAliases()
    {
        try
        {
            var dir = Path.GetDirectoryName(SkillAliasesStatePath);
            if (!string.IsNullOrWhiteSpace(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
            var sb = new StringBuilder();
            sb.Append("{");
            var first = true;
            foreach (var kv in _skillAliases.OrderBy(p => p.Key, StringComparer.OrdinalIgnoreCase))
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append('"').Append(EscapeJsonString(kv.Key)).Append('"');
                sb.Append(':');
                sb.Append('"').Append(EscapeJsonString(kv.Value)).Append('"');
            }
            sb.Append("}");
            File.WriteAllText(SkillAliasesStatePath, sb.ToString(), Encoding.UTF8);
        }
        catch (Exception ex)
        {
            _auditLogger.Log("local", "skill_alias_save", "failed", ex.Message);
        }
    }

    // 스킬 별명을 슬래시 명령으로 받았을 때 실제 활성화 명령으로 rewrite.
    // 예: "/e 디지털 카메라" + alias e→eli5  =>  "eli5 스킬 사용해서 디지털 카메라"
    // 매칭 안 되면 null 반환.
    internal string? TryRewriteSlashAliasToSkillInvocation(string input)
    {
        var trimmed = (input ?? string.Empty).TrimStart();
        if (trimmed.Length < 2 || trimmed[0] != '/')
        {
            return null;
        }
        // 첫 토큰만 alias 후보. 슬래시 떼고 비교.
        var spaceIdx = trimmed.IndexOf(' ');
        var aliasToken = (spaceIdx > 0 ? trimmed[1..spaceIdx] : trimmed[1..]).Trim();
        if (string.IsNullOrWhiteSpace(aliasToken))
        {
            return null;
        }
        EnsureSkillAliasesLoaded();
        if (!_skillAliases.TryGetValue(aliasToken, out var skillName) || string.IsNullOrWhiteSpace(skillName))
        {
            return null;
        }
        var rest = spaceIdx > 0 ? trimmed[(spaceIdx + 1)..].TrimStart() : string.Empty;
        if (string.IsNullOrWhiteSpace(rest))
        {
            return $"{skillName} 스킬 사용해줘";
        }
        return $"{skillName} 스킬 사용해서 {rest}";
    }

    private string BuildTelegramSkillQuickResponse(string[] tokens)
    {
        EnsureSkillAliasesLoaded();
        // tokens: [/skill, quick, ...args]
        if (tokens.Length < 3)
        {
            return BuildTelegramSkillQuickListResponse();
        }
        var sub = tokens[2].Trim().ToLowerInvariant();
        if (sub is "list" or "ls" or "목록")
        {
            return BuildTelegramSkillQuickListResponse();
        }
        if (sub is "remove" or "rm" or "delete" or "del" or "삭제" or "제거")
        {
            if (tokens.Length < 4)
            {
                return "사용법: /skill quick remove <별명>";
            }
            var aliasToRemove = tokens[3].Trim();
            if (_skillAliases.TryRemove(aliasToRemove, out var removedSkill))
            {
                SaveSkillAliases();
                _auditLogger.Log("telegram", "skill_alias_remove", "ok", $"alias={aliasToRemove} skill={removedSkill}");
                return $"별명을 제거했습니다: /{aliasToRemove} → `{removedSkill}`";
            }
            return $"등록된 별명이 아닙니다: /{aliasToRemove}";
        }

        // 등록: /skill quick <alias> <name>
        if (tokens.Length < 4)
        {
            return "사용법: /skill quick <별명> <스킬이름>\n예: /skill quick e eli5";
        }
        var alias = tokens[2].Trim();
        var skill = tokens[3].Trim();
        if (alias.StartsWith("/", StringComparison.Ordinal))
        {
            alias = alias.TrimStart('/');
        }
        if (string.IsNullOrWhiteSpace(alias) || string.IsNullOrWhiteSpace(skill))
        {
            return "사용법: /skill quick <별명> <스킬이름>";
        }
        if (!Regex.IsMatch(alias, @"^[A-Za-z0-9가-힣_-]{1,16}$"))
        {
            return "별명은 영문/숫자/한글/하이픈/언더스코어 1~16자만 허용됩니다.";
        }
        // 예약된 슬래시 명령과 충돌 방지.
        var reserved = new[] { "skill", "skills", "off", "help", "history", "log", "think", "web", "llm", "coding", "doctor", "routine", "plan", "task", "notebook", "memory", "refactor", "model", "talk", "code", "kill", "metrics", "start" };
        if (reserved.Contains(alias, StringComparer.OrdinalIgnoreCase))
        {
            return $"`{alias}` 는 예약된 명령이라 별명으로 쓸 수 없습니다.";
        }
        var resolved = FindSkill(skill, null);
        if (resolved == null)
        {
            return $"스킬을 찾지 못했습니다: {skill}\n먼저 /skill list 로 이름을 확인하세요.";
        }
        _skillAliases[alias] = resolved.Name;
        SaveSkillAliases();
        _auditLogger.Log("telegram", "skill_alias_register", "ok", $"alias={alias} skill={resolved.Name}");
        return $"별명 등록: /{alias} → `{resolved.Name}` 스킬\n사용 예: /{alias} 디지털 카메라 원리 알려줘";
    }

    private string BuildTelegramSkillQuickListResponse()
    {
        EnsureSkillAliasesLoaded();
        if (_skillAliases.IsEmpty)
        {
            return """
                   등록된 스킬 별명이 없습니다.
                   - 등록: /skill quick <별명> <스킬이름>
                   - 예: /skill quick e eli5
                   """;
        }
        var sb = new StringBuilder();
        sb.AppendLine("[등록된 스킬 별명]");
        foreach (var kv in _skillAliases.OrderBy(p => p.Key, StringComparer.OrdinalIgnoreCase))
        {
            sb.AppendLine($"- /{kv.Key} → `{kv.Value}`");
        }
        sb.AppendLine();
        sb.AppendLine("- 등록: /skill quick <별명> <스킬이름>");
        sb.AppendLine("- 제거: /skill quick remove <별명>");
        return sb.ToString().Trim();
    }
}

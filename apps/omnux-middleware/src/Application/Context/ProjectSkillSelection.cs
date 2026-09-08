using System.Text;

namespace Omnux.Middleware;

internal static class ProjectSkillSelection
{
    public static List<SkillManifest> Mentioned(string input, IReadOnlyList<SkillManifest> skills)
    {
        var matches = new List<SkillManifest>();
        var remaining = new StringBuilder((input ?? string.Empty).Trim());
        foreach (var skill in skills.OrderByDescending(skill => skill.Name.Length))
        {
            if (string.IsNullOrWhiteSpace(skill.Name)) continue;
            var index = LocalAssistantQuestionPolicy.IndexOfSkillNameWithBoundary(remaining.ToString(), skill.Name);
            if (index < 0) continue;
            matches.Add(skill);
            for (var offset = 0; offset < skill.Name.Length; offset++) remaining[index + offset] = '\0';
        }
        return matches;
    }

    public static SkillManifest? Find(IReadOnlyList<SkillManifest> skills, string? name, string? scope)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        return skills.Where(skill => skill.Name.Equals(name.Trim(), StringComparison.OrdinalIgnoreCase))
            .Where(skill => string.IsNullOrWhiteSpace(scope) || skill.Scope.Equals(scope.Trim(), StringComparison.OrdinalIgnoreCase))
            .OrderBy(skill => skill.Scope.Equals("project", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
            .FirstOrDefault();
    }
}

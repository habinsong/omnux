using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private Task<string?> TryHandleTelegramSkillCommandAsync(string text, CancellationToken cancellationToken)
    {
        _ = cancellationToken;
        var normalized = (text ?? string.Empty).Replace("\r\n", "\n").Trim();

        // 단축 명령: /off → 활성 스킬 즉시 해제.
        if (normalized.Equals("/off", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult<string?>(DeactivateTelegramSkill());
        }

        if (!normalized.StartsWith("/skill", StringComparison.OrdinalIgnoreCase)
            && !normalized.StartsWith("/skills", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult<string?>(null);
        }

        var firstLine = normalized.Split('\n', 2)[0];
        var tokens = firstLine.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length == 0)
        {
            return Task.FromResult<string?>(BuildTelegramHelpText("skill"));
        }

        if (tokens.Length == 1
            || tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase)
            || tokens[1].Equals("도움말", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult<string?>(BuildTelegramHelpText("skill"));
        }

        var action = tokens[1].Trim().ToLowerInvariant();
        if (action is "list" or "ls" or "목록")
        {
            return Task.FromResult<string?>(BuildLocalSkillInventoryResponse());
        }

        if (action is "status" or "현재" or "상태")
        {
            return Task.FromResult<string?>(BuildTelegramSkillStatusResponse());
        }

        if (action is "off" or "stop" or "disable" or "deactivate" or "해제" or "끄기" or "중지" or "종료" or "그만")
        {
            return Task.FromResult<string?>(DeactivateTelegramSkill());
        }

        if (action is "quick" or "alias" or "별명")
        {
            return Task.FromResult<string?>(BuildTelegramSkillQuickResponse(tokens));
        }

        if (action is "use" or "activate" or "load" or "불러오기" or "사용" or "활성화")
        {
            if (tokens.Length < 3)
            {
                return Task.FromResult<string?>("사용법: /skill use <name> [project|global]");
            }

            var (name, scope) = ParseTelegramSkillNameAndScope(tokens, 2);
            return Task.FromResult<string?>(ActivateTelegramSkill(name, scope, returnAck: true));
        }

        if (action is "get" or "show" or "read" or "불러와" or "보기" or "읽기")
        {
            if (tokens.Length < 3)
            {
                return Task.FromResult<string?>("사용법: /skill get <name> [project|global]");
            }

            var (name, scope) = ParseTelegramSkillNameAndScope(tokens, 2);
            return Task.FromResult<string?>(BuildTelegramSkillGetResponse(name, scope));
        }

        if (action is "create" or "save" or "new" or "생성" or "저장" or "추가")
        {
            if (tokens.Length < 3)
            {
                return Task.FromResult<string?>(BuildTelegramSkillCreateUsage());
            }

            var (name, scope) = ParseTelegramSkillNameAndScope(tokens, 2);
            var bodySpec = ExtractTelegramSkillBodySpec(normalized);
            if (bodySpec == null)
            {
                return Task.FromResult<string?>(BuildTelegramSkillCreateUsage());
            }

            var save = SkillFiles.Save(name, scope, bodySpec.Value.Description, bodySpec.Value.Body, allowOverwrite: false);
            if (!save.Ok)
            {
                return Task.FromResult<string?>($"스킬 저장 실패: {save.Error}");
            }

            _auditLogger.Log("telegram", "skill_save", "ok", $"name={save.Name} scope={save.Scope}");
            return Task.FromResult<string?>($"""
                   스킬을 저장했습니다.
                   - 이름: {save.Name}
                   - 범위: {save.Scope}
                   - 경로: {RelativizeSkillPathForTelegram(save.Path)}
                   """);
        }

        return Task.FromResult<string?>(BuildTelegramHelpText("skill"));
    }

    private Task<string?> TryHandleTelegramNaturalSkillCommandAsync(string text, CancellationToken cancellationToken)
    {
        _ = cancellationToken;

        // 다중 스킬 언급은 활성화/인벤토리 검사보다 먼저 거부.
        var multiSkillRejection = TryBuildMultiSkillRejectionResponse(text ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(multiSkillRejection))
        {
            _auditLogger.Log("telegram", "skill_multi_mention", "blocked", "");
            return Task.FromResult<string?>(multiSkillRejection);
        }

        var normalized = Regex.Replace((text ?? string.Empty).Trim().ToLowerInvariant(), @"\s+", " ");
        if (normalized.Length == 0 || normalized.Length > 220)
        {
            return Task.FromResult<string?>(null);
        }

        var compact = Regex.Replace(normalized, @"[\p{P}\p{S}\s]+", string.Empty);

        // 비활성화/활성화 의도를 인벤토리 검사보다 먼저 처리해
        // "<스킬명> 스킬 사용해서 ... 해줘" 같은 명시적 호출이 인벤토리로 잘못 빠지지 않게 한다.
        if (LooksLikeSkillDeactivationRequest(normalized))
        {
            return Task.FromResult<string?>(DeactivateTelegramSkill());
        }

        var matched = FindMentionedSkill(normalized);
        var activationRequested = LooksLikeTelegramSkillActivationRequest(normalized, compact, matched != null);
        if (activationRequested)
        {
            if (LooksLikeInlineSkillTask(normalized))
            {
                if (matched == null)
                {
                    return Task.FromResult<string?>(null);
                }

                _ = ActivateTelegramSkill(matched.Name, matched.Scope, returnAck: false);
                return Task.FromResult<string?>(null);
            }

            if (matched != null)
            {
                return Task.FromResult<string?>(ActivateTelegramSkill(matched.Name, matched.Scope, returnAck: true));
            }
        }

        if (LocalAssistantQuestionPolicy.LooksLikeSkillInventoryQuestion(normalized, compact))
        {
            return Task.FromResult<string?>(BuildLocalSkillInventoryResponse());
        }

        return Task.FromResult<string?>(null);
    }

}

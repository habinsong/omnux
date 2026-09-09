using System.Text.Json;
using Omnux.Middleware;
using Xunit;

namespace Omnux.Middleware.Tests;

/// <summary>
/// 스킬 저장 요청의 덮어쓰기 허용 값이 실제로 전달되는지.
///
/// `ClientMessage.SkillAllowOverwrite` 는 선언돼 있고 dispatcher 가 읽지만,
/// 파서가 JSON 에서 그 값을 채우지 않으면 **항상 null** 이다.
/// 그러면 `SkillFileService.Save` 의 `File.Exists && !allowOverwrite` 가 늘 참이 되어
/// **이미 있는 스킬은 절대 고칠 수 없다.** 화면에서 저장을 누르면
/// "같은 이름의 스킬이 이미 있습니다" 만 돌아온다.
/// </summary>
public class SkillSaveOverwriteParseTests
{
    private static string Build(bool? allowOverwrite)
    {
        var payload = new Dictionary<string, object?>
        {
            ["type"] = "skill_save",
            ["skillName"] = "code-review",
            ["skillScope"] = "project",
            ["skillDescription"] = "설명",
            ["skillBody"] = "# 본문"
        };
        if (allowOverwrite.HasValue)
        {
            payload["skillAllowOverwrite"] = allowOverwrite.Value;
        }

        return JsonSerializer.Serialize(payload);
    }

    [Fact]
    public void AllowOverwriteTrueReachesTheDispatcher()
    {
        var message = WebSocketGateway.ParseClientMessage(Build(true));

        Assert.NotNull(message);
        Assert.Equal("skill_save", message!.Type);
        Assert.Equal("code-review", message.SkillName);
        // dispatcher 는 `message.SkillAllowOverwrite == true` 로 판정한다.
        Assert.True(message.SkillAllowOverwrite);
    }

    [Fact]
    public void AllowOverwriteFalseIsKeptFalse()
    {
        var message = WebSocketGateway.ParseClientMessage(Build(false));

        Assert.NotNull(message);
        Assert.False(message!.SkillAllowOverwrite);
    }

    [Fact]
    public void MissingAllowOverwriteStaysNull()
    {
        // 값을 보내지 않으면 덮어쓰기를 허용하지 않는다. 새 스킬 생성 경로다.
        var message = WebSocketGateway.ParseClientMessage(Build(null));

        Assert.NotNull(message);
        Assert.Null(message!.SkillAllowOverwrite);
        Assert.False(message.SkillAllowOverwrite == true);
    }

    [Fact]
    public void OtherSkillFieldsStillParse()
    {
        var message = WebSocketGateway.ParseClientMessage(Build(true));

        Assert.NotNull(message);
        Assert.Equal("project", message!.SkillScope);
        Assert.Equal("설명", message.SkillDescription);
        Assert.Equal("# 본문", message.SkillBody);
    }
}

using System.Reflection;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AskNotebookPolicyTests
{
    [Theory]
    [InlineData("내 노트북 내용을 보여줘")]
    [InlineData("이전 결정 알려줘")]
    [InlineData("검증 결과를 보여줘")]
    [InlineData("배운 점을 정리해줘")]
    [InlineData("이어보기 해줘")]
    public void ShouldRetrieveAcceptsOnlyExplicitNotebookSignals(string input)
    {
        Assert.True(InvokeShouldRetrieve(input));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("전에 뭐 했지?")]
    [InlineData("결정해줘")]
    [InlineData("배운 내용을 알려줘")]
    [InlineData("계속 진행해줘")]
    public void ShouldRetrieveRejectsImplicitRecallWording(string? input)
    {
        Assert.False(InvokeShouldRetrieve(input));
    }

    [Theory]
    [InlineData("노트북에 결정으로 기록해: 배포는 카나리 방식으로 진행한다", "decision", "배포는 카나리 방식으로 진행한다")]
    [InlineData("노트북에 검증 추가해 테스트 42개 통과", "verification", "테스트 42개 통과")]
    [InlineData("노트북에 배운 점으로 저장해: 캐시는 만료 시간을 둔다", "learning", "캐시는 만료 시간을 둔다")]
    [InlineData("노트북에 메모해: 재시도는 두 번만 한다", "learning", "재시도는 두 번만 한다")]
    public void TryBuildAppendRequestExtractsKindAndContent(
        string input,
        string expectedKind,
        string expectedContent
    )
    {
        var (success, request) = InvokeTryBuildAppendRequest(input);

        Assert.True(success);
        Assert.NotNull(request);
        Assert.Equal(expectedKind, ReadStringProperty(request!, "Kind"));
        Assert.Equal(expectedContent, ReadStringProperty(request!, "Content"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("노트북에 결정으로 기록해:")]
    [InlineData("노트북에 대해 설명해줘")]
    [InlineData("메모해: 배포는 카나리 방식으로 진행한다")]
    [InlineData("노트북 내용을 알려줘")]
    [InlineData("노트북에 저장해")]
    public void TryBuildAppendRequestRejectsDiscussionEmptyAndAmbiguousMemo(string? input)
    {
        var (success, request) = InvokeTryBuildAppendRequest(input);

        Assert.False(success);
        Assert.Null(request);
    }

    private static bool InvokeShouldRetrieve(string? input)
    {
        var method = GetPolicyType().GetMethod(
            "ShouldRetrieve",
            BindingFlags.Public | BindingFlags.Static
        );
        Assert.NotNull(method);
        return Assert.IsType<bool>(method!.Invoke(null, new object?[] { input }));
    }

    private static (bool Success, object? Request) InvokeTryBuildAppendRequest(string? input)
    {
        var method = GetPolicyType().GetMethod(
            "TryBuildAppendRequest",
            BindingFlags.Public | BindingFlags.Static
        );
        Assert.NotNull(method);

        var arguments = new object?[] { input, null };
        var success = Assert.IsType<bool>(method!.Invoke(null, arguments));
        return (success, arguments[1]);
    }

    private static Type GetPolicyType()
    {
        var type = typeof(AskAutoRetrievalPolicy).Assembly.GetType(
            "Omnux.Middleware.AskNotebookPolicy"
        );
        Assert.NotNull(type);
        return type!;
    }

    private static string ReadStringProperty(object instance, string propertyName)
    {
        var property = instance.GetType().GetProperty(propertyName);
        Assert.NotNull(property);
        return Assert.IsType<string>(property!.GetValue(instance));
    }
}

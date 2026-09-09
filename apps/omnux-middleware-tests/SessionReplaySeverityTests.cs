using System;
using System.Collections.Generic;
using Omnux.Middleware;
using Xunit;

namespace Omnux.Middleware.Tests;

/// <summary>
/// 세션 타임라인의 심각도·종류 판정.
/// 답변 본문에 어떤 낱말이 있다는 이유로 정상 답변을 오류로 표시하면 안 된다.
/// 심각도는 저장된 상태 표식(Meta·Kind)에서만 나와야 한다.
/// </summary>
public class SessionReplaySeverityTests
{
    private static readonly SessionReplayQuery Query = new(ConversationId: "conv-1");

    private static ConversationThreadView Thread(params ConversationMessageView[] messages)
    {
        return new ConversationThreadView(
            "conv-1",
            "chat",
            "single",
            "제목",
            "기본",
            "일반",
            Array.Empty<string>(),
            DateTimeOffset.UnixEpoch,
            DateTimeOffset.UnixEpoch,
            messages,
            Array.Empty<string>(),
            null
        );
    }

    private static SessionReplayEvent BuildOne(ConversationMessageView message)
    {
        var events = new List<SessionReplayEvent>();
        SessionReplayEventBuilder.AddConversationEvents(events, Thread(message), Query);
        return Assert.Single(events);
    }

    private static ConversationMessageView Assistant(string text, string meta = "groq:test-model")
    {
        return new ConversationMessageView("assistant", text, meta, DateTimeOffset.UnixEpoch);
    }

    [Fact]
    public void NormalAnswerMentioningFailureWordsStaysInfo()
    {
        // 오류를 "설명하는" 정상 답변이다. 실패한 호출이 아니다.
        var built = BuildOne(Assistant("자주 나는 오류를 피하려면 timeout 설정을 확인하세요."));

        Assert.Equal("info", built.Severity);
        Assert.Equal("assistant_response", built.Kind);
    }

    [Fact]
    public void QuestionAboutWarningsStaysInfo()
    {
        var built = BuildOne(new ConversationMessageView(
            "user",
            "warning 이랑 주의 로그를 어떻게 구분해?",
            string.Empty,
            DateTimeOffset.UnixEpoch
        ));

        Assert.Equal("info", built.Severity);
        Assert.Equal("user_input", built.Kind);
    }

    [Fact]
    public void AnswerMentioningWatchdogIsNotAWatchdogEvent()
    {
        var built = BuildOne(Assistant("watchdog 는 응답이 끊긴 실행을 닫는 장치입니다."));

        Assert.Equal("assistant_response", built.Kind);
        Assert.Equal("info", built.Severity);
    }

    [Fact]
    public void BreakerBlockedMetaIsError()
    {
        // 실제 생산자가 쓰는 Meta 값이다(SessionSpawnTool).
        var built = BuildOne(Assistant(
            "agent_spawn_breaker.blocked runId=r1 reason=too_many_failures",
            "sessions_spawn_breaker_blocked"
        ));

        Assert.Equal("error", built.Severity);
        Assert.Equal("run_breaker", built.Kind);
    }

    [Fact]
    public void WatchdogClosedMetaIsError()
    {
        var built = BuildOne(Assistant("실행을 닫았습니다.", "sessions_spawn_watchdog_closed"));

        Assert.Equal("error", built.Severity);
        Assert.Equal("watchdog", built.Kind);
    }

    [Fact]
    public void OpenWatchdogMetaIsWarning()
    {
        var built = BuildOne(Assistant("응답을 기다리는 중입니다.", "sessions_spawn_watchdog"));

        Assert.Equal("warning", built.Severity);
        Assert.Equal("watchdog", built.Kind);
    }

    [Fact]
    public void AutoCompressMetaIsCompressionEvent()
    {
        var built = BuildOne(Assistant("이전 대화를 요약했습니다.", "auto-compress"));

        Assert.Equal("context_compression", built.Kind);
        Assert.Equal("warning", built.Severity);
    }

    [Fact]
    public void AgentMessageBodyDoesNotDecideSeverity()
    {
        var message = new AgentCommunicationMessage(
            "m1",
            "agent-a",
            "agent-b",
            "group-1",
            "run-1",
            "conv-1",
            "note",
            "중단하지 말고 계속 진행해.",
            "corr-1",
            DateTimeOffset.UnixEpoch
        );
        var snapshot = new AgentCommunicationSnapshot(
            new[] { message },
            Array.Empty<AgentBoardEntry>(),
            Array.Empty<AgentLifecycleEvent>(),
            1,
            0,
            0,
            DateTimeOffset.UnixEpoch
        );

        var events = new List<SessionReplayEvent>();
        SessionReplayEventBuilder.AddAgentEvents(events, snapshot, Query);

        var built = Assert.Single(events);
        Assert.Equal("info", built.Severity);
        Assert.Equal("ok", built.Status);
    }

    [Fact]
    public void AgentStopKindIsWarning()
    {
        var message = new AgentCommunicationMessage(
            "m2",
            "agent-a",
            "agent-b",
            "group-1",
            "run-1",
            "conv-1",
            "stop",
            "정지 요청",
            "corr-2",
            DateTimeOffset.UnixEpoch
        );
        var snapshot = new AgentCommunicationSnapshot(
            new[] { message },
            Array.Empty<AgentBoardEntry>(),
            Array.Empty<AgentLifecycleEvent>(),
            1,
            0,
            0,
            DateTimeOffset.UnixEpoch
        );

        var events = new List<SessionReplayEvent>();
        SessionReplayEventBuilder.AddAgentEvents(events, snapshot, Query);

        Assert.Equal("warning", Assert.Single(events).Severity);
    }
}

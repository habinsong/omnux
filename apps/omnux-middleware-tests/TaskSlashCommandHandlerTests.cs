using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

// TaskSlashCommandHandler를 CommandService 없이 ITaskGraphApplicationService fake만으로 구동한다(결함 4번 M3).
public sealed class TaskSlashCommandHandlerTests
{
    [Fact]
    public void CanHandleMatchesTaskOnly()
    {
        var handler = new TaskSlashCommandHandler(new FakeTaskService());
        Assert.True(handler.CanHandle(new SlashCommandContext("/task list", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/plan list", "web")));
    }

    [Fact]
    public async Task NoArgsReturnsHelp()
    {
        var handler = new TaskSlashCommandHandler(new FakeTaskService());
        var result = await handler.HandleAsync(new SlashCommandContext("/task", "web"), CancellationToken.None);
        Assert.Contains("[작업 명령]", result);
    }

    [Fact]
    public async Task ListEmptyReturnsNoGraphsMessage()
    {
        var handler = new TaskSlashCommandHandler(new FakeTaskService());
        var result = await handler.HandleAsync(new SlashCommandContext("/task list", "web"), CancellationToken.None);
        Assert.Equal("저장된 Task graph가 없습니다.", result);
    }

    [Fact]
    public async Task ListWithItemsRendersList()
    {
        var fake = new FakeTaskService
        {
            ListResult = new TaskGraphListResult(new[]
            {
                new TaskGraphIndexEntry("graph_1", "plan_1", TaskGraphStatus.Running, DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch, 3, 1, 0, 1)
            })
        };
        var handler = new TaskSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/task list", "web"), CancellationToken.None);

        Assert.Contains("task graphs: 1", result);
        Assert.Contains("graph_1 plan=plan_1 status=Running done=1/3", result);
    }

    [Fact]
    public async Task CreateMissingPlanReturnsUsage()
    {
        var handler = new TaskSlashCommandHandler(new FakeTaskService());
        var result = await handler.HandleAsync(new SlashCommandContext("/task create", "web"), CancellationToken.None);
        Assert.Contains("사용법: /task create", result);
    }

    [Fact]
    public async Task StatusNotFoundReturnsMessage()
    {
        var handler = new TaskSlashCommandHandler(new FakeTaskService { GetSnapshot = null });
        var result = await handler.HandleAsync(new SlashCommandContext("/task status missing", "web"), CancellationToken.None);
        Assert.Equal("Task graph를 찾을 수 없습니다.", result);
    }

    [Fact]
    public async Task StatusFoundFormatsSnapshot()
    {
        var fake = new FakeTaskService { GetSnapshot = BuildSnapshot() };
        var handler = new TaskSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/task status graph_1", "web"), CancellationToken.None);

        Assert.Equal("graph_1", fake.LastGetId);
        Assert.Contains("graph=graph_1 plan=plan_1 status=Running nodes=1", result);
        Assert.Contains("- t1 [Pending] build", result);
    }

    [Fact]
    public async Task OutputNotFoundReturnsMessage()
    {
        var handler = new TaskSlashCommandHandler(new FakeTaskService { GetOutput = null });
        var result = await handler.HandleAsync(new SlashCommandContext("/task output g t", "web"), CancellationToken.None);
        Assert.Equal("Task output을 찾을 수 없습니다.", result);
    }

    [Fact]
    public async Task TelegramLargeOutputUsesHandoff()
    {
        var bigStdout = string.Join('\n', Enumerable.Range(0, 80).Select(i => $"line {i} ........................................"));
        var output = new TaskOutputResult("graph_1", "t1", null, bigStdout, string.Empty, null);
        var handler = new TaskSlashCommandHandler(new FakeTaskService { GetOutput = output });

        var result = await handler.HandleAsync(new SlashCommandContext("/task output graph_1 t1", "telegram"), CancellationToken.None);

        Assert.Contains("telegram_command_output_handoff", result);
        Assert.Contains("작업 출력", result);
    }

    [Fact]
    public async Task RunPassesHardcodedWebSourceLikeLegacy()
    {
        var fake = new FakeTaskService { RunResult = new TaskGraphActionResult(true, "실행", null) };
        var handler = new TaskSlashCommandHandler(fake);

        // 레거시 동작 보존: /task run은 source 인자와 무관하게 "web"으로 실행한다.
        await handler.HandleAsync(new SlashCommandContext("/task run graph_1", "telegram"), CancellationToken.None);

        Assert.Equal("graph_1", fake.LastRunId);
        Assert.Equal("web", fake.LastRunSource);
    }

    [Fact]
    public async Task UnknownActionReturnsHint()
    {
        var handler = new TaskSlashCommandHandler(new FakeTaskService());
        var result = await handler.HandleAsync(new SlashCommandContext("/task frobnicate", "web"), CancellationToken.None);
        Assert.Contains("알 수 없는 /task 명령", result);
    }

    private static TaskGraphSnapshot BuildSnapshot()
    {
        var node = new TaskNode("t1", "build it", "build", TaskNodeStatus.Pending, Array.Empty<string>(), "prompt", Array.Empty<string>(), Array.Empty<string>(), null, null, null);
        var graph = new TaskGraph("graph_1", "plan_1", DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch, TaskGraphStatus.Running, new[] { node });
        return new TaskGraphSnapshot(graph, Array.Empty<TaskExecutionRecord>());
    }

    private sealed class FakeTaskService : ITaskGraphApplicationService
    {
        public TaskGraphListResult ListResult { get; set; } = new TaskGraphListResult(Array.Empty<TaskGraphIndexEntry>());
        public TaskGraphSnapshot? GetSnapshot { get; set; }
        public TaskOutputResult? GetOutput { get; set; }
        public TaskGraphActionResult RunResult { get; set; } = new TaskGraphActionResult(true, "ok", null);

        public string? LastGetId { get; private set; }
        public string? LastRunId { get; private set; }
        public string? LastRunSource { get; private set; }

        public TaskGraphActionResult CreateTaskGraph(string planId) => new TaskGraphActionResult(true, "created", null);

        public TaskGraphActionResult UpdateTaskGraph(string graphId, string? rawJson) => new TaskGraphActionResult(true, "updated", null);

        public TaskGraphListResult ListTaskGraphs() => ListResult;

        public TaskGraphSnapshot? GetTaskGraph(string graphId)
        {
            LastGetId = graphId;
            return GetSnapshot;
        }

        public Task<TaskGraphActionResult> RunTaskGraphAsync(string graphId, string source, TaskGraphEventSink? eventSink, CancellationToken cancellationToken)
        {
            LastRunId = graphId;
            LastRunSource = source;
            return Task.FromResult(RunResult);
        }

        public TaskGraphActionResult CancelTask(string graphId, string taskId) => new TaskGraphActionResult(true, "canceled", null);

        public Task<TaskGraphActionResult> RetryTaskAsync(string graphId, string taskId, string source, TaskGraphEventSink? eventSink, CancellationToken cancellationToken)
            => Task.FromResult(new TaskGraphActionResult(true, "retry", null));

        public Task<TaskGraphActionResult> ResumeTaskGraphAsync(string graphId, string source, TaskGraphEventSink? eventSink, CancellationToken cancellationToken)
            => Task.FromResult(new TaskGraphActionResult(true, "resume", null));

        public TaskOutputResult? GetTaskOutput(string graphId, string taskId) => GetOutput;
    }
}

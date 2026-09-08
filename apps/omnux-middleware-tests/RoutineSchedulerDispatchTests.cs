using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class RoutineSchedulerDispatchTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"omnux-routine-dispatch-{Guid.NewGuid():N}");

    [Theory]
    [InlineData(false, -1)]
    [InlineData(true, 60)]
    public async Task SchedulerRechecksReservationBeforeStarting(bool enabled, int minutesFromNow)
    {
        var (service, registry) = CreateService();
        var routine = NewRoutine("scheduled");
        routine.Enabled = enabled;
        routine.NextRunUtc = DateTimeOffset.UtcNow.AddMinutes(minutesFromNow);
        registry.Mutate(items => { items.Add(routine.Id, routine); });

        var result = await service.RunRoutineNowAsync(routine.Id, "scheduler", CancellationToken.None);

        Assert.False(result.Ok);
        Assert.False(routine.Running);
        Assert.Null(routine.LastRunUtc);
        Assert.Empty(routine.CronRunLog);
    }

    [Fact]
    public async Task RepeatedPollDoesNotQueueTwiceAndPausedQueueDoesNotRun()
    {
        var (service, registry) = CreateService();
        var routine = NewRoutine("queued");
        registry.Mutate(items => { items.Add(routine.Id, routine); });
        IReadOnlyList<Task> queued;
        lock (registry.SyncRoot)
        {
            queued = service.QueueDueRoutineRuns(CancellationToken.None);
            _ = Assert.Single(queued);
            Assert.Empty(service.QueueDueRoutineRuns(CancellationToken.None));
            routine.Enabled = false;
        }
        await Task.WhenAll(queued).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Null(routine.LastRunUtc);
        Assert.Empty(routine.CronRunLog);

        lock (registry.SyncRoot)
        {
            routine.Enabled = true;
            queued = service.QueueDueRoutineRuns(CancellationToken.None);
            _ = Assert.Single(queued);
            routine.NextRunUtc = DateTimeOffset.UtcNow.AddHours(1);
        }
        await Task.WhenAll(queued).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Null(routine.LastRunUtc);
    }

    [Fact]
    public async Task CanceledDispatchLeavesReservationAvailable()
    {
        var (service, registry) = CreateService();
        var routine = NewRoutine("canceled");
        registry.Mutate(items => { items.Add(routine.Id, routine); });
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var queued = service.QueueDueRoutineRuns(cancellation.Token);
        await Task.WhenAll(queued).WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Null(routine.LastRunUtc);
        Assert.False(routine.Running);
        queued = service.QueueDueRoutineRuns(cancellation.Token);
        _ = Assert.Single(queued);
        await Task.WhenAll(queued).WaitAsync(TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task LocalScriptKeepsCompleteOutputAndWritesReadableRunHistory()
    {
        var (service, registry) = CreateService();
        var routine = NewRoutine("local-script");
        routine.Enabled = false;
        routine.ExecutionMode = "script";
        routine.Language = "python";
        routine.Code = "print('x' * 2400 + 'END_OF_OUTPUT')";
        registry.Mutate(items => { items.Add(routine.Id, routine); });

        var result = await service.RunRoutineNowAsync(routine.Id, "web", CancellationToken.None);

        Assert.True(result.Ok, result.Message);
        Assert.Contains(new string('x', 2400) + "END_OF_OUTPUT", result.Message);
        Assert.False(routine.Running);
        Assert.False(routine.Enabled);
        var entry = Assert.Single(routine.CronRunLog);
        Assert.True(File.Exists(entry.ArtifactPath));
        var detail = service.GetRoutineRunDetail(routine.Id, entry.Ts);
        Assert.True(detail.Ok);
        Assert.Contains("END_OF_OUTPUT", detail.Content);
        Assert.Equal(new string('x', 2400) + "END_OF_OUTPUT", detail.Output);
        Assert.DoesNotContain("routineId:", detail.Output);
    }

    [Fact]
    public async Task FailedArtifactWriteDoesNotReportSuccess()
    {
        var (service, registry) = CreateService();
        File.WriteAllText(Path.Combine(_root, "artifacts"), "디렉터리 대신 파일이 있습니다.");
        var routine = NewRoutine("write-failure");
        routine.ExecutionMode = "script";
        routine.Language = "python";
        routine.Code = "print('result')";
        registry.Mutate(items => { items.Add(routine.Id, routine); });
        var result = await service.RunRoutineNowAsync(routine.Id, "web", CancellationToken.None);
        Assert.False(result.Ok);
        Assert.Contains("결과 저장 실패", result.Message);
        Assert.Equal("error", Assert.Single(routine.CronRunLog).Status);
        Assert.False(routine.Running);
    }

    [Fact]
    public void SameTimestampRunArtifactsDoNotOverwriteEarlierOutput()
    {
        var store = new FileRunArtifactStore(Path.Combine(_root, "artifacts"));
        var now = DateTimeOffset.UtcNow;
        var first = new RoutineRunArtifactWriteRequest("same-time", "출력 보존", "web", 1, "ok", "first output", null, "disabled", null, now, now, null);
        var firstPath = store.WriteRoutineRun(first);
        var secondPath = store.WriteRoutineRun(first with { Output = "second output" });
        Assert.NotNull(firstPath);
        Assert.NotEqual(firstPath, secondPath);
        Assert.Contains("first output", store.ReadText(firstPath));
        Assert.Contains("second output", store.ReadText(secondPath));
    }

    private (RoutineApplicationService Service, RoutineRegistry Registry) CreateService()
    {
        var config = new AppConfig { RoutinePromptDir = Path.Combine(_root, "prompts"), WorkspaceRootDir = Path.Combine(_root, "workspace"), EnableDynamicCode = true };
        var registry = new RoutineRegistry(new MemoryRoutineStore());
        // 예약 검증 이전에 실행 의존성에 접근하면 검사가 실패한다. 외부 호출은 연결하지 않는다.
        var service = new RoutineApplicationService(config.Providers, config.Paths, config.Context, config.Security,
            null!, null!, null!, new FileRunArtifactStore(Path.Combine(_root, "artifacts")), new UniversalCodeRunner(Path.Combine(_root, "runs"), 10), null!, null!, registry, null!, null!, null!, startScheduler: false);
        return (service, registry);
    }

    private static RoutineDefinition NewRoutine(string id) => new()
    {
        Id = id, Title = "예약 경계 검사", Request = "새 소식을 정리해 주세요", ExecutionMode = "web",
        ScheduleSourceMode = "manual", NextRunUtc = DateTimeOffset.UtcNow.AddMinutes(-1),
        MaxRetries = 0, RetryDelaySeconds = 0, NotifyTelegram = false
    };

    private sealed class MemoryRoutineStore : IRoutineStore
    {
        public string StorePath => "memory";
        public IReadOnlyList<RoutineDefinition> Load() => Array.Empty<RoutineDefinition>();
        public void Save(IReadOnlyList<RoutineDefinition> items) { }
    }

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }
}

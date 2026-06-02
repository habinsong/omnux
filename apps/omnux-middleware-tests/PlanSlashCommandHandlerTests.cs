using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

// PlanSlashCommandHandler를 CommandService 없이 IPlanningApplicationService fake만으로 구동한다(결함 4번 M3).
public sealed class PlanSlashCommandHandlerTests
{
    [Fact]
    public void CanHandleMatchesPlanOnly()
    {
        var handler = new PlanSlashCommandHandler(new FakePlanService());
        Assert.True(handler.CanHandle(new SlashCommandContext("/plan list", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/task list", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/notebook", "web")));
    }

    [Fact]
    public async Task NoArgsReturnsHelp()
    {
        var handler = new PlanSlashCommandHandler(new FakePlanService());
        var result = await handler.HandleAsync(new SlashCommandContext("/plan", "web"), CancellationToken.None);
        Assert.Contains("[계획 명령]", result);
    }

    [Fact]
    public async Task ListEmptyReturnsNoPlansMessage()
    {
        var handler = new PlanSlashCommandHandler(new FakePlanService());
        var result = await handler.HandleAsync(new SlashCommandContext("/plan list", "web"), CancellationToken.None);
        Assert.Equal("저장된 계획이 없습니다.", result);
    }

    [Fact]
    public async Task ListWithItemsRendersList()
    {
        var fake = new FakePlanService
        {
            ListResult = new PlanListResult(new[]
            {
                new PlanIndexEntry("plan_1", "제목A", "목표", PlanStatus.Draft, DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch, null)
            })
        };
        var handler = new PlanSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/plan list", "web"), CancellationToken.None);

        Assert.Contains("[계획 목록]", result);
        Assert.Contains("plan_1", result);
        Assert.Contains("제목A", result);
    }

    [Fact]
    public async Task GetMissingIdReturnsUsage()
    {
        var handler = new PlanSlashCommandHandler(new FakePlanService());
        var result = await handler.HandleAsync(new SlashCommandContext("/plan get", "web"), CancellationToken.None);
        Assert.Contains("사용법: /plan get", result);
    }

    [Fact]
    public async Task GetNotFoundReturnsErrorText()
    {
        var fake = new FakePlanService { GetSnapshot = null };
        var handler = new PlanSlashCommandHandler(fake);
        var result = await handler.HandleAsync(new SlashCommandContext("/plan get missing", "web"), CancellationToken.None);
        Assert.Contains("계획 오류: 계획을 찾을 수 없습니다.", result);
    }

    [Fact]
    public async Task GetFoundFormatsSnapshot()
    {
        var fake = new FakePlanService { GetSnapshot = BuildSnapshot() };
        var handler = new PlanSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/plan get plan_1", "web"), CancellationToken.None);

        Assert.Equal("plan_1", fake.LastGetId);
        Assert.Contains("id=plan_1", result);
        Assert.Contains("status=Approved", result);
        Assert.Contains("title=제목", result);
    }

    [Fact]
    public async Task CreateWithoutObjectiveReturnsUsage()
    {
        var handler = new PlanSlashCommandHandler(new FakePlanService());
        var result = await handler.HandleAsync(new SlashCommandContext("/plan create", "web"), CancellationToken.None);
        Assert.Contains("사용법: /plan create", result);
    }

    [Fact]
    public async Task CreateParsesModeConstraintAndObjective()
    {
        var fake = new FakePlanService { CreateResult = new PlanActionResult(true, "생성됨", BuildSnapshot()) };
        var handler = new PlanSlashCommandHandler(fake);

        await handler.HandleAsync(
            new SlashCommandContext("/plan create --mode interview --constraint 보안 doctor 기능 구현", "web"),
            CancellationToken.None);

        Assert.Equal("doctor 기능 구현", fake.LastCreateObjective);
        Assert.Equal("interview", fake.LastCreateMode);
        Assert.Equal(new[] { "보안" }, fake.LastCreateConstraints);
    }

    [Fact]
    public async Task RunPassesSourceThrough()
    {
        var fake = new FakePlanService { RunResult = new PlanActionResult(true, "실행", null) };
        var handler = new PlanSlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/plan run plan_1", "telegram"), CancellationToken.None);

        Assert.Equal("plan_1", fake.LastRunId);
        Assert.Equal("telegram", fake.LastRunSource);
    }

    [Fact]
    public async Task UnknownActionReturnsHint()
    {
        var handler = new PlanSlashCommandHandler(new FakePlanService());
        var result = await handler.HandleAsync(new SlashCommandContext("/plan frobnicate", "web"), CancellationToken.None);
        Assert.Contains("알 수 없는 /plan 명령", result);
    }

    private static PlanSnapshot BuildSnapshot()
    {
        var plan = new WorkPlan(
            "plan_1",
            "제목",
            "목표",
            PlanStatus.Approved,
            DateTimeOffset.UnixEpoch,
            DateTimeOffset.UnixEpoch,
            null,
            Array.Empty<string>(),
            Array.Empty<PlanStep>(),
            Array.Empty<string>(),
            null
        );
        return new PlanSnapshot(plan, null, null);
    }

    private sealed class FakePlanService : IPlanningApplicationService
    {
        public PlanListResult ListResult { get; set; } = new PlanListResult(Array.Empty<PlanIndexEntry>());
        public PlanSnapshot? GetSnapshot { get; set; }
        public PlanActionResult CreateResult { get; set; } = new PlanActionResult(true, "ok", null);
        public PlanActionResult RunResult { get; set; } = new PlanActionResult(true, "ok", null);

        public string? LastGetId { get; private set; }
        public string? LastCreateObjective { get; private set; }
        public string? LastCreateMode { get; private set; }
        public IReadOnlyList<string>? LastCreateConstraints { get; private set; }
        public string? LastRunId { get; private set; }
        public string? LastRunSource { get; private set; }

        public Task<PlanActionResult> CreatePlanAsync(string objective, IReadOnlyList<string>? constraints, string? mode, string? sourceConversationId, CancellationToken cancellationToken)
        {
            LastCreateObjective = objective;
            LastCreateConstraints = constraints;
            LastCreateMode = mode;
            return Task.FromResult(CreateResult);
        }

        public Task<PlanActionResult> ReviewPlanAsync(string planId, CancellationToken cancellationToken)
            => Task.FromResult(new PlanActionResult(true, "review", null));

        public PlanActionResult ApprovePlan(string planId) => new PlanActionResult(true, "approve", null);

        public PlanActionResult UpdatePlan(string planId, string? rawJson) => new PlanActionResult(true, "update", null);

        public PlanListResult ListPlans() => ListResult;

        public PlanSnapshot? GetPlan(string planId)
        {
            LastGetId = planId;
            return GetSnapshot;
        }

        public Task<PlanActionResult> RunPlanAsync(string planId, string source, CancellationToken cancellationToken)
        {
            LastRunId = planId;
            LastRunSource = source;
            return Task.FromResult(RunResult);
        }
    }
}

namespace Omnux.Middleware;

internal sealed class CodingProjectChangeService : ICodingProjectChangeService
{
    private readonly IConversationStore _conversations;
    private readonly ProjectWorkspaceBindingService _bindings;
    private readonly FileProjectChangeStore _previews;
    private readonly string _runsRoot;

    public CodingProjectChangeService(IConversationStore conversations, ProjectWorkspaceBindingService bindings, FileProjectChangeStore previews, string workspace)
    {
        _conversations = conversations;
        _bindings = bindings;
        _previews = previews;
        _runsRoot = Path.Combine(workspace, "runs");
    }

    public async Task<ProjectChangeResponse> PreviewAsync(string conversationId, string target, CancellationToken cancellationToken)
    {
        try
        {
            var selection = Resolve(conversationId, target);
            using var lease = _bindings.Acquire(selection.Project, conversationId);
            var files = await ProjectChangePlanner.BuildAsync(selection.Project.Path, selection.Baseline, selection.Candidate, cancellationToken);
            var preview = new ProjectChangePreview(Guid.NewGuid().ToString("N"), conversationId, target, selection.Project, files);
            _previews.Save(new ProjectChangeRecord(preview, selection.Candidate, selection.Baseline, DateTimeOffset.UtcNow));
            return new ProjectChangeResponse(true, files.Count == 0 ? "반영할 변경이 없습니다." : "프로젝트에 반영할 변경을 확인해 주세요.", preview);
        }
        catch (Exception ex) when (ex is not OperationCanceledException) { return new ProjectChangeResponse(false, ex.Message); }
    }

    public async Task<ProjectChangeResponse> ApplyAsync(string previewId, CancellationToken cancellationToken)
    {
        try
        {
            var record = _previews.Read(previewId) ?? throw new InvalidOperationException("변경 검토 기록을 찾을 수 없습니다. 다시 확인해 주세요.");
            var selection = Resolve(record.Preview.ConversationId, record.Preview.Target);
            if (selection.Candidate != record.CandidateDirectory || selection.Baseline != record.BaselineDirectory || selection.Project.Path != record.Preview.Project.Path)
                throw new InvalidOperationException("빌드 또는 프로젝트가 바뀌었습니다. 변경 내용을 다시 확인해 주세요.");
            using var lease = _bindings.Acquire(selection.Project, record.Preview.ConversationId);
            await ProjectChangeTransaction.ApplyAsync(record, cancellationToken);
            _previews.Remove(previewId);
            return new ProjectChangeResponse(true, $"{record.Preview.Files.Count}개 파일을 프로젝트에 반영했습니다.", ChangedPaths: record.Preview.Files.Select(file => file.Path).ToArray());
        }
        catch (Exception ex) when (ex is not OperationCanceledException) { return new ProjectChangeResponse(false, ex.Message); }
    }

    private (CodingProjectBinding Project, string Candidate, string Baseline) Resolve(string conversationId, string target)
    {
        var conversation = _conversations.Get(conversationId) ?? throw new InvalidOperationException("빌드 기록을 찾을 수 없습니다.");
        var project = _bindings.Resolve(null, conversation.CodingProject) ?? throw new InvalidOperationException("등록된 프로젝트에 연결한 빌드가 아닙니다.");
        var result = conversation.LatestCodingResult;
        if (result?.Mode != "multi") throw new InvalidOperationException("비교 작업의 결과를 선택해 주세요.");
        var execution = target == "main" ? result.Execution
            : target.StartsWith("worker-", StringComparison.Ordinal) && int.TryParse(target[7..], out var index) && index >= 0 && index < result.Workers.Count ? result.Workers[index].Execution : null;
        if (execution == null) throw new InvalidOperationException("선택한 결과를 찾을 수 없습니다.");
        var candidate = ProjectWorkspaceFiles.CanonicalDirectory(execution.RunDirectory);
        var root = ProjectWorkspaceFiles.CanonicalDirectory(_runsRoot);
        if (candidate == project.Path || !CodingPreviewPolicy.IsRegularDirectoryWithinRun(candidate, root))
            throw new InvalidOperationException("프로젝트와 분리된 비교 결과 폴더가 아닙니다.");
        var baseline = Path.Combine(Path.GetDirectoryName(candidate)!, ProjectWorkspaceFiles.BaselineDirectory);
        if (!CodingPreviewPolicy.IsRegularDirectoryWithinRun(baseline, root)) throw new InvalidOperationException("비교 작업의 원본 스냅샷을 찾을 수 없습니다.");
        return (project, candidate, baseline);
    }
}

namespace Omnux.Middleware;

public sealed partial class CodingApplicationService
{
    // 기존 대화 저장소를 사용한다. 정상 결과가 저장되면 체크포인트를 덮어쓰지 않는다.
    internal sealed class CodingCheckpoint : IDisposable
    {
        private readonly IConversationStore _store;
        private readonly CodingRunRequest _request;
        private readonly string _conversationId;
        private readonly string _root;
        private readonly CancellationToken _token;
        private readonly string _id = Guid.NewGuid().ToString("N");
        private readonly object _sync = new();
        private readonly Dictionary<string, string?> _models;

        public CodingCheckpoint(IConversationStore store, CodingRunRequest request, string conversationId,
            string root, CancellationToken token)
        {
            _store = store;
            _request = request;
            _conversationId = conversationId;
            _root = root;
            _token = token;
            _models = new Dictionary<string, string?> {
                ["groq"] = request.GroqModel, ["gemini"] = request.GeminiModel,
                ["cerebras"] = request.CerebrasModel, ["nvidia"] = request.NvidiaModel,
                ["copilot"] = request.CopilotModel, ["codex"] = request.CodexModel,
                ["grok"] = request.GrokModel
            };
            _store.SetLatestCodingResult(_conversationId, Snapshot("incomplete"));
        }

        public Action<CodingProgressUpdate> Bind(Action<CodingProgressUpdate>? callback)
        {
            void Report(CodingProgressUpdate update)
            {
                lock (_sync)
                {
                    if (_models.ContainsKey(update.Provider) && !string.IsNullOrWhiteSpace(update.Model)) _models[update.Provider] = update.Model;
                    if (update.Phase is "writing" or "executing") Refresh("incomplete");
                    callback?.Invoke(update with { ConversationId = _conversationId });
                }
            }
            Report(new CodingProgressUpdate(_request.Mode, _request.Provider ?? "auto", _request.Model ?? "", "checkpoint",
                "작업 위치를 저장했습니다.", 0, 0, 0, false, StageTitle: "작업 준비"));
            return Report;
        }

        private ConversationCodingResultSnapshot Snapshot(string status)
        {
            var language = CodingLanguagePolicy.ResolveInitialCodingLanguage(_request.Language, _request.Input);
            var provider = string.IsNullOrWhiteSpace(_request.Provider) ? "auto" : _request.Provider.Trim().ToLowerInvariant();
            var model = (_request.Model ?? (provider == "auto" ? "" : _models.GetValueOrDefault(provider)) ?? "").Trim();
            if (model == "none") model = "";
            var execution = new CodeExecutionResult(language, _root, "-", "", -1, "", "", status);
            return new ConversationCodingResultSnapshot(_request.Mode, _conversationId, provider, model,
                language, status == "cancelled" ? "작업을 중단했습니다. 남아 있는 파일에서 이어갈 수 있습니다."
                    : "완료되지 않은 작업입니다. 남아 있는 파일에서 이어갈 수 있습니다.",
                execution, Array.Empty<CodingWorkerResultSnapshot>(), CollectFiles(),
                ResumeInput: _request.Input, CheckpointId: _id, ResumeModels: new Dictionary<string, string?>(_models));
        }

        private string[] CollectFiles()
        {
            var files = new List<string>();
            var directories = new Stack<string>();
            directories.Push(_root);
            var options = new EnumerationOptions { IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint };
            while (directories.TryPop(out var directory))
            {
                if (!Directory.Exists(directory)) continue;
                foreach (var entry in Directory.EnumerateFileSystemEntries(directory, "*", options))
                {
                    if (CodingWorkspaceFilePolicy.ShouldSkip(Path.GetRelativePath(_root, entry))) continue;
                    if (Directory.Exists(entry)) directories.Push(entry);
                    else if (CodingPreviewPolicy.ContentType(entry).Length > 0 && CodingPreviewPolicy.IsRegularFileWithinRun(entry, _root)) files.Add(entry);
                }
            }
            return files.Order(StringComparer.Ordinal).ToArray();
        }

        private void Refresh(string status)
        {
            if (_store.Get(_conversationId)?.LatestCodingResult?.CheckpointId != _id) return;
            _store.TryUpdateCodingCheckpoint(_conversationId, _id, Snapshot(status));
        }

        public void Dispose()
        {
            lock (_sync) Refresh(_token.IsCancellationRequested ? "cancelled" : "incomplete");
        }
    }
}

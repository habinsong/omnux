using System.Collections.Concurrent;
using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed class ConversationApplicationService : IConversationApplicationService
{
    private const string BackupManifestEntryName = "omnux-package.json";
    private const int ConversationSearchDefaultMaxResults = 12;
    private const int ConversationSearchMaxResults = 40;
    private static readonly string[] BackupAllScopes =
    {
        "conversations",
        "routines",
        "routing-policy",
        "memory-notes",
        "plans",
        "tasks",
        "notebooks",
        "skills/global",
        "commands/global",
        "skills/project",
        "commands/project"
    };
    private static readonly HashSet<string> BackupAllScopeSet = BackupAllScopes.ToHashSet(StringComparer.Ordinal);

    private readonly IConversationStore _conversationStore;
    private readonly IMemoryNoteStore _memoryNoteStore;
    private readonly AuditLogger _auditLogger;
    private readonly PathOptions _paths;
    private readonly MemorySearchTool _memorySearchTool;
    private readonly ISyncConfigurationStore _syncConfigStore;

    private readonly object _indexSyncLock = new();
    private DateTimeOffset _lastIndexSyncUtc = DateTimeOffset.MinValue;
    private readonly TimeSpan _indexSyncThrottle = TimeSpan.FromSeconds(20);
    private readonly ConcurrentDictionary<string, BackupImportPackage> _backupImportPreviews
        = new(StringComparer.Ordinal);

    // ClearActiveSkill은 CommandService의 _activeSkillByThread private state에
    // 결합되어 있어 façade로 옮기지 못함. CommandService 생성 후
    // ConfigureClearActiveSkillDelegate로 위임 함수를 주입.
    private Func<string?, bool>? _clearActiveSkill;

    public ConversationApplicationService(
        IConversationStore conversationStore,
        IMemoryNoteStore memoryNoteStore,
        AuditLogger auditLogger,
        PathOptions paths,
        MemorySearchTool memorySearchTool,
        ISyncConfigurationStore syncConfigStore
    )
    {
        _conversationStore = conversationStore;
        _memoryNoteStore = memoryNoteStore;
        _auditLogger = auditLogger;
        _paths = paths;
        _memorySearchTool = memorySearchTool;
        _syncConfigStore = syncConfigStore;
    }

    public void ConfigureClearActiveSkillDelegate(Func<string?, bool> @delegate)
    {
        _clearActiveSkill = @delegate;
    }

    public IReadOnlyList<ConversationThreadSummary> ListConversations(string scope, string mode)
        => _conversationStore.List(scope, mode);

    public ConversationThreadView CreateConversation(
        string scope,
        string mode,
        string? title,
        string? project,
        string? category,
        IReadOnlyList<string>? tags
    ) => _conversationStore.Create(scope, mode, title, project, category, tags);

    public ConversationThreadView? GetConversation(string conversationId)
        => _conversationStore.Get(conversationId);

    public bool DeleteConversation(string conversationId)
    {
        var targetConversationId = (conversationId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(targetConversationId))
        {
            return false;
        }

        var thread = _conversationStore.Get(targetConversationId);
        if (thread == null)
        {
            return false;
        }

        var linkedNotes = thread.LinkedMemoryNotes
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var deleted = _conversationStore.Delete(targetConversationId);
        if (!deleted)
        {
            return false;
        }

        _auditLogger.Log(
            "web",
            "delete_conversation",
            "ok",
            $"conversationId={NormalizeAuditToken(targetConversationId, "-")} linkedNotes={linkedNotes.Length} removedNotes=0"
        );
        return true;
    }

    public ConversationThreadView UpdateConversationMetadata(
        string conversationId,
        string? title,
        string? project,
        string? category,
        IReadOnlyList<string>? tags
    )
    {
        var targetConversationId = (conversationId ?? string.Empty).Trim();
        var before = _conversationStore.Get(targetConversationId)
            ?? throw new InvalidOperationException("conversation not found");
        var updated = _conversationStore.UpdateMetadata(
            targetConversationId,
            title,
            project,
            category,
            tags
        );

        var titleChanged = !string.Equals(before.Title, updated.Title, StringComparison.Ordinal);
        if (!titleChanged || before.LinkedMemoryNotes.Count == 0)
        {
            return updated;
        }

        var renamedNotes = before.LinkedMemoryNotes
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name =>
            {
                var original = name.Trim();
                var renamed = _memoryNoteStore.RenameForConversationTitle(original, updated.Title);
                return string.IsNullOrWhiteSpace(renamed) ? original : renamed;
            })
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        return _conversationStore.SetLinkedMemoryNotes(updated.Id, renamedNotes);
    }

    public WorkspaceFilePreview? ReadWorkspaceFile(string filePath, int maxChars = 120_000)
        => ReadWorkspaceFile(filePath, null, maxChars);

    public WorkspaceFilePreview? ReadWorkspaceFile(string filePath, string? conversationId, int maxChars = 120_000)
    {
        var raw = (filePath ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        try
        {
            var fullPath = TryResolveWorkspacePreviewPath(raw, conversationId);
            if (string.IsNullOrWhiteSpace(fullPath) || !File.Exists(fullPath))
            {
                return null;
            }

            var content = File.ReadAllText(fullPath);
            if (content.Length > maxChars)
            {
                content = content[..maxChars] + "\n...(truncated)";
            }

            return new WorkspaceFilePreview(fullPath, content);
        }
        catch
        {
            return null;
        }
    }

    public ConversationSearchResult SearchConversations(string query, int? maxResults = null)
    {
        var normalizedQuery = (query ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedQuery))
        {
            return new ConversationSearchResult(normalizedQuery, Array.Empty<ConversationSearchHit>(), false);
        }

        TrySyncConversationIndexThrottled();
        var resolvedMax = Math.Clamp(maxResults ?? ConversationSearchDefaultMaxResults, 1, ConversationSearchMaxResults);
        var memoryResult = _memorySearchTool.Search(normalizedQuery, Math.Min(ConversationSearchMaxResults, resolvedMax * 3), 0.05d);
        var hits = BuildConversationSearchHits(normalizedQuery, memoryResult, resolvedMax);
        if (hits.Count == 0)
        {
            hits = BuildInMemoryConversationSearchHits(normalizedQuery, resolvedMax);
        }

        return new ConversationSearchResult(
            normalizedQuery,
            hits,
            memoryResult.Disabled,
            memoryResult.Error
        );
    }

    public BackupExportResult ExportBackup(BackupExportOptions? options = null)
    {
        var included = new List<string>();
        var excluded = new List<string>
        {
            "API 키",
            "Telegram token/chat id",
            "auth session",
            "OTP",
            "lock/cache/runtime 임시 파일",
            "runtime logs",
            "outbox"
        };
        IReadOnlyList<string> selectedScopes = BackupAllScopes;

        try
        {
            selectedScopes = NormalizeBackupExportScopes(options?.IncludeScopes);
            using var memory = new MemoryStream();
            var fileSha256ByEntry = new Dictionary<string, string>(StringComparer.Ordinal);
            using (var archive = new ZipArchive(memory, ZipArchiveMode.Create, leaveOpen: true))
            {
                if (IsBackupScopeIncluded(selectedScopes, "conversations"))
                {
                    AddFileToBackup(archive, _paths.ConversationStatePath, "conversations.json", included, fileSha256ByEntry);
                }
                if (IsBackupScopeIncluded(selectedScopes, "routines"))
                {
                    AddFileToBackup(archive, _paths.RoutineStatePath, "routines.json", included, fileSha256ByEntry);
                }
                if (IsBackupScopeIncluded(selectedScopes, "routing-policy"))
                {
                    AddFileToBackup(archive, ResolveStateFilePath("routing-policy.json"), "routing-policy.json", included, fileSha256ByEntry);
                }
                if (IsBackupScopeIncluded(selectedScopes, "memory-notes"))
                {
                    AddDirectoryToBackup(archive, _paths.MemoryNotesRootDir, "memory-notes", included, fileSha256ByEntry);
                }
                if (IsBackupScopeIncluded(selectedScopes, "plans"))
                {
                    AddDirectoryToBackup(archive, ResolveStateDirectoryPath("plans"), "plans", included, fileSha256ByEntry);
                }
                if (IsBackupScopeIncluded(selectedScopes, "tasks"))
                {
                    AddDirectoryToBackup(archive, ResolveStateDirectoryPath("tasks"), "tasks", included, fileSha256ByEntry);
                }
                if (IsBackupScopeIncluded(selectedScopes, "notebooks"))
                {
                    AddDirectoryToBackup(archive, ResolveStateDirectoryPath("notebooks"), "notebooks", included, fileSha256ByEntry);
                }
                if (IsBackupScopeIncluded(selectedScopes, "skills/global"))
                {
                    AddDirectoryToBackup(archive, ResolveStateDirectoryPath("skills"), "skills/global", included, fileSha256ByEntry);
                }
                if (IsBackupScopeIncluded(selectedScopes, "commands/global"))
                {
                    AddDirectoryToBackup(archive, ResolveStateDirectoryPath("commands"), "commands/global", included, fileSha256ByEntry);
                }
                if (IsBackupScopeIncluded(selectedScopes, "skills/project"))
                {
                    AddDirectoryToBackup(archive, Path.Combine(_paths.WorkspaceRootDir, ".omni", "skills"), "skills/project", included, fileSha256ByEntry);
                }
                if (IsBackupScopeIncluded(selectedScopes, "commands/project"))
                {
                    AddDirectoryToBackup(archive, Path.Combine(_paths.WorkspaceRootDir, ".omni", "commands"), "commands/project", included, fileSha256ByEntry);
                }
                if (fileSha256ByEntry.Count == 0)
                {
                    throw new InvalidOperationException("선택된 백업 범위에 내보낼 파일이 없습니다.");
                }
                AddBackupManifest(archive, included, excluded, fileSha256ByEntry, selectedScopes);
            }

            var bytes = memory.ToArray();
            var fileName = $"omnux-backup-{DateTimeOffset.UtcNow:yyyyMMdd-HHmmss}.zip";
            return new BackupExportResult(
                true,
                fileName,
                Convert.ToBase64String(bytes),
                bytes.Length,
                included,
                excluded,
                Scope: selectedScopes
            );
        }
        catch (Exception ex)
        {
            return new BackupExportResult(false, string.Empty, string.Empty, 0, included, excluded, ex.Message, selectedScopes);
        }
    }

    public BackupImportPreviewResult PreviewBackupImport(string fileName, string contentBase64)
    {
        try
        {
            var bytes = Convert.FromBase64String((contentBase64 ?? string.Empty).Trim());
            ValidateBackupManifestIntegrity(bytes);
            var conversations = ReadBackupConversations(bytes);
            var existingIds = _conversationStore.ListAll()
                .Select(item => item.Id)
                .ToHashSet(StringComparer.Ordinal);
            var conflicts = conversations
                .Where(item => existingIds.Contains(item.Id))
                .Select(item => item.Id)
                .OrderBy(item => item, StringComparer.Ordinal)
                .ToArray();
            var fileConflicts = BuildBackupFileConflicts(bytes);
            var manifest = ReadBackupManifest(bytes);
            var fileCount = CountBackupFiles(bytes);
            var previewId = Guid.NewGuid().ToString("N");
            _backupImportPreviews[previewId] = new BackupImportPackage(
                bytes,
                conversations,
                DateTimeOffset.UtcNow
            );

            CleanupExpiredBackupPreviews();
            return new BackupImportPreviewResult(
                true,
                previewId,
                string.IsNullOrWhiteSpace(fileName) ? "backup.zip" : Path.GetFileName(fileName.Trim()),
                conversations.Count,
                conflicts.Length,
                fileConflicts.Length,
                fileCount,
                conflicts,
                fileConflicts,
                ResolveBackupSyncMode(manifest),
                ResolveBackupConflictPolicy(manifest)
            );
        }
        catch (Exception ex)
        {
            return new BackupImportPreviewResult(
                false,
                string.Empty,
                fileName ?? string.Empty,
                0,
                0,
                0,
                0,
                Array.Empty<string>(),
                Array.Empty<string>(),
                "unknown",
                "unknown",
                ex.Message
            );
        }
    }

    public BackupImportApplyResult ApplyBackupImport(string previewId, bool overwrite)
    {
        var normalizedPreviewId = (previewId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedPreviewId)
            || !_backupImportPreviews.TryGetValue(normalizedPreviewId, out var package))
        {
            return new BackupImportApplyResult(false, 0, 0, 0, 0, 0, "previewId를 찾을 수 없습니다.");
        }

        try
        {
            ValidateBackupManifestIntegrity(package.ZipBytes);
            var conversationResult = _conversationStore.ImportConversations(package.Conversations, overwrite);
            var fileResult = ImportBackupFiles(package.ZipBytes, overwrite);
            _backupImportPreviews.TryRemove(normalizedPreviewId, out _);
            return new BackupImportApplyResult(
                true,
                conversationResult.Imported,
                conversationResult.Skipped,
                conversationResult.Overwritten,
                fileResult.Imported,
                fileResult.Skipped
            );
        }
        catch (Exception ex)
        {
            return new BackupImportApplyResult(false, 0, 0, 0, 0, 0, ex.Message);
        }
    }

    public bool ClearActiveSkill(string? conversationId)
    {
        if (_clearActiveSkill == null)
        {
            throw new InvalidOperationException(
                "ConversationApplicationService.ClearActiveSkill delegate가 주입되지 않았습니다. " +
                "Program.cs에서 ConfigureClearActiveSkillDelegate를 호출하세요."
            );
        }

        return _clearActiveSkill(conversationId);
    }

    // --- private helpers ---

    private string? TryResolveWorkspacePreviewPath(string rawPath, string? conversationId)
    {
        var workspaceRoot = ResolveWorkspaceRoot();
        var normalizedRawPath = (rawPath ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedRawPath))
        {
            return null;
        }

        if (TryResolveDirectWorkspacePreviewPath(workspaceRoot, normalizedRawPath, out var directPath))
        {
            return directPath;
        }

        var normalizedConversationId = (conversationId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedConversationId))
        {
            return null;
        }

        var conversation = _conversationStore.Get(normalizedConversationId);
        var latest = conversation?.LatestCodingResult;
        if (latest == null)
        {
            return null;
        }

        return TryResolveConversationPreviewPath(normalizedRawPath, latest, workspaceRoot);
    }

    private static bool TryResolveDirectWorkspacePreviewPath(string workspaceRoot, string rawPath, out string resolvedPath)
    {
        resolvedPath = string.Empty;
        try
        {
            var candidate = Path.IsPathRooted(rawPath)
                ? Path.GetFullPath(rawPath)
                : Path.GetFullPath(Path.Combine(workspaceRoot, rawPath));
            if (!IsPathUnderRoot(candidate, workspaceRoot) || !File.Exists(candidate))
            {
                return false;
            }

            resolvedPath = candidate;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string? TryResolveConversationPreviewPath(
        string rawPath,
        ConversationCodingResultSnapshot latest,
        string workspaceRoot
    )
    {
        var previewRoots = BuildConversationPreviewRoots(latest, workspaceRoot);
        var previewFiles = BuildConversationPreviewFiles(latest)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (Path.IsPathRooted(rawPath))
        {
            try
            {
                var fullRequested = Path.GetFullPath(rawPath);
                if (File.Exists(fullRequested)
                    && previewRoots.Any(root => IsPathUnderRoot(fullRequested, root)))
                {
                    return fullRequested;
                }
            }
            catch
            {
            }
        }

        var normalizedRequested = NormalizePreviewPath(rawPath);
        if (!string.IsNullOrWhiteSpace(normalizedRequested))
        {
            var suffixMatches = previewFiles
                .Where(File.Exists)
                .Where(path => PathMatchesPreviewRequest(path, normalizedRequested))
                .ToArray();
            if (suffixMatches.Length == 1)
            {
                return suffixMatches[0];
            }

            if (suffixMatches.Length > 1)
            {
                var exactRunDirMatch = suffixMatches.FirstOrDefault(path =>
                    string.Equals(
                        NormalizePreviewPath(path),
                        normalizedRequested,
                        StringComparison.OrdinalIgnoreCase
                    ));
                if (!string.IsNullOrWhiteSpace(exactRunDirMatch))
                {
                    return exactRunDirMatch;
                }
            }
        }

        if (!Path.IsPathRooted(rawPath))
        {
            foreach (var root in previewRoots)
            {
                try
                {
                    var candidate = Path.GetFullPath(Path.Combine(root, rawPath));
                    if (File.Exists(candidate) && IsPathUnderRoot(candidate, root))
                    {
                        return candidate;
                    }
                }
                catch
                {
                }
            }
        }

        var basename = Path.GetFileName(rawPath.Trim());
        if (!string.IsNullOrWhiteSpace(basename))
        {
            var basenameMatches = previewFiles
                .Where(File.Exists)
                .Where(path => string.Equals(Path.GetFileName(path), basename, StringComparison.OrdinalIgnoreCase))
                .ToArray();
            if (basenameMatches.Length == 1)
            {
                return basenameMatches[0];
            }
        }

        return null;
    }

    private static string[] BuildConversationPreviewRoots(
        ConversationCodingResultSnapshot latest,
        string workspaceRoot
    )
    {
        return EnumerateConversationPreviewRoots(latest, workspaceRoot)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Select(path => Path.GetFullPath(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static IEnumerable<string> EnumerateConversationPreviewRoots(
        ConversationCodingResultSnapshot latest,
        string workspaceRoot
    )
    {
        yield return workspaceRoot;

        var latestRunDirectory = (latest.Execution.RunDirectory ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(latestRunDirectory))
        {
            yield return latestRunDirectory;
        }

        foreach (var worker in latest.Workers ?? Array.Empty<CodingWorkerResultSnapshot>())
        {
            var workerRunDirectory = (worker.Execution.RunDirectory ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(workerRunDirectory))
            {
                yield return workerRunDirectory;
            }
        }
    }

    private static string[] BuildConversationPreviewFiles(ConversationCodingResultSnapshot latest)
    {
        var files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        AddConversationPreviewFileCandidates(files, latest.Execution, latest.ChangedFiles);
        foreach (var worker in latest.Workers ?? Array.Empty<CodingWorkerResultSnapshot>())
        {
            AddConversationPreviewFileCandidates(files, worker.Execution, worker.ChangedFiles);
        }

        return files.ToArray();
    }

    private static void AddConversationPreviewFileCandidates(
        ISet<string> files,
        CodeExecutionResult execution,
        IReadOnlyList<string> changedFiles
    )
    {
        foreach (var path in changedFiles ?? Array.Empty<string>())
        {
            if (TryNormalizeFullPreviewCandidate(path, out var fullPath))
            {
                files.Add(fullPath);
            }
        }

        var runDirectory = (execution.RunDirectory ?? string.Empty).Trim();
        var entryFile = (execution.EntryFile ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(runDirectory) || string.IsNullOrWhiteSpace(entryFile))
        {
            return;
        }

        try
        {
            var fullPath = Path.IsPathRooted(entryFile)
                ? Path.GetFullPath(entryFile)
                : Path.GetFullPath(Path.Combine(runDirectory, entryFile));
            files.Add(fullPath);
        }
        catch
        {
        }
    }

    private static bool TryNormalizeFullPreviewCandidate(string path, out string fullPath)
    {
        fullPath = string.Empty;
        var normalized = (path ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        try
        {
            fullPath = Path.GetFullPath(normalized);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool PathMatchesPreviewRequest(string candidatePath, string normalizedRequested)
    {
        var normalizedCandidate = NormalizePreviewPath(candidatePath);
        if (string.Equals(normalizedCandidate, normalizedRequested, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return normalizedCandidate.EndsWith("/" + normalizedRequested, StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizePreviewPath(string value)
    {
        return (value ?? string.Empty)
            .Trim()
            .Replace('\\', '/')
            .Trim('/');
    }

    private IReadOnlyList<ConversationSearchHit> BuildConversationSearchHits(
        string query,
        MemorySearchToolResult memoryResult,
        int maxResults
    )
    {
        if (memoryResult.Results.Count == 0)
        {
            return Array.Empty<ConversationSearchHit>();
        }

        var allConversations = _conversationStore.ListAllViews();
        var hits = new List<ConversationSearchHit>();
        foreach (var item in memoryResult.Results)
        {
            if (!item.Source.Equals("sessions", StringComparison.OrdinalIgnoreCase)
                || !item.Path.StartsWith("conversations/", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var conversation = allConversations.FirstOrDefault(candidate =>
                item.Path.Contains(candidate.Id, StringComparison.OrdinalIgnoreCase));
            if (conversation == null)
            {
                continue;
            }

            var message = FindBestConversationMessage(conversation, query, item.Snippet);
            hits.Add(new ConversationSearchHit(
                conversation.Id,
                conversation.Title,
                conversation.Scope,
                conversation.Mode,
                message?.Role ?? "-",
                NormalizeConversationSearchSnippet(item.Snippet),
                conversation.UpdatedUtc,
                message?.CreatedUtc ?? conversation.UpdatedUtc,
                item.Score
            ));
        }

        return hits
            .GroupBy(item => $"{item.ConversationId}:{item.Snippet}", StringComparer.Ordinal)
            .Select(group => group.OrderByDescending(item => item.Score).First())
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => item.UpdatedUtc)
            .Take(maxResults)
            .ToArray();
    }

    private IReadOnlyList<ConversationSearchHit> BuildInMemoryConversationSearchHits(string query, int maxResults)
    {
        var normalizedQuery = query.Trim();
        var loweredQuery = normalizedQuery.ToLowerInvariant();
        var hits = new List<ConversationSearchHit>();
        foreach (var conversation in _conversationStore.ListAllViews())
        {
            foreach (var message in conversation.Messages.OrderByDescending(item => item.CreatedUtc))
            {
                var text = message.Text ?? string.Empty;
                var index = text.ToLowerInvariant().IndexOf(loweredQuery, StringComparison.Ordinal);
                if (index < 0)
                {
                    continue;
                }

                hits.Add(new ConversationSearchHit(
                    conversation.Id,
                    conversation.Title,
                    conversation.Scope,
                    conversation.Mode,
                    message.Role,
                    BuildInlineSnippet(text, index, normalizedQuery.Length),
                    conversation.UpdatedUtc,
                    message.CreatedUtc,
                    0.5d
                ));
                break;
            }
        }

        return hits
            .OrderByDescending(item => item.MessageUtc)
            .Take(maxResults)
            .ToArray();
    }

    private static ConversationMessageView? FindBestConversationMessage(
        ConversationThreadView conversation,
        string query,
        string snippet
    )
    {
        var loweredQuery = (query ?? string.Empty).Trim().ToLowerInvariant();
        var loweredSnippet = (snippet ?? string.Empty).Trim().ToLowerInvariant();
        return conversation.Messages
            .OrderByDescending(message => message.CreatedUtc)
            .FirstOrDefault(message =>
            {
                var text = (message.Text ?? string.Empty).ToLowerInvariant();
                return (!string.IsNullOrWhiteSpace(loweredQuery) && text.Contains(loweredQuery, StringComparison.Ordinal))
                       || (!string.IsNullOrWhiteSpace(loweredSnippet) && text.Contains(loweredSnippet, StringComparison.Ordinal));
            })
            ?? conversation.Messages.OrderByDescending(message => message.CreatedUtc).FirstOrDefault();
    }

    private void TrySyncConversationIndexThrottled()
    {
        lock (_indexSyncLock)
        {
            if (DateTimeOffset.UtcNow - _lastIndexSyncUtc < _indexSyncThrottle)
            {
                return;
            }

            _lastIndexSyncUtc = DateTimeOffset.UtcNow;
        }

        try
        {
            var schema = new MemoryIndexSchemaBootstrap(_paths).EnsureInitialized();
            _ = new MemoryIndexDocumentSync(_paths, schema).SyncOnce();
        }
        catch (Exception ex)
        {
            _auditLogger.Log("web", "conversation_search_index_sync", "failed", ex.Message);
        }
    }

    private static string NormalizeConversationSearchSnippet(string snippet)
    {
        var normalized = Regex.Replace((snippet ?? string.Empty).Trim(), @"\s+", " ");
        if (normalized.Length <= 360)
        {
            return normalized;
        }

        return normalized[..357].TrimEnd() + "...";
    }

    private static string BuildInlineSnippet(string text, int index, int queryLength)
    {
        var start = Math.Max(0, index - 140);
        var end = Math.Min(text.Length, index + Math.Max(queryLength, 1) + 220);
        var snippet = text[start..end];
        if (start > 0)
        {
            snippet = "..." + snippet;
        }

        if (end < text.Length)
        {
            snippet += "...";
        }

        return NormalizeConversationSearchSnippet(snippet);
    }

    private IReadOnlyList<ConversationThreadView> ReadBackupConversations(byte[] zipBytes)
    {
        using var memory = new MemoryStream(zipBytes);
        using var archive = new ZipArchive(memory, ZipArchiveMode.Read, leaveOpen: false);
        var entry = archive.GetEntry("conversations.json");
        if (entry == null)
        {
            return Array.Empty<ConversationThreadView>();
        }

        using var stream = entry.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        var json = reader.ReadToEnd();
        var state = JsonSerializer.Deserialize(json, OmniJsonContext.Default.ConversationState);
        if (state?.Conversations == null)
        {
            return Array.Empty<ConversationThreadView>();
        }

        return state.Conversations
            .Where(item => !string.IsNullOrWhiteSpace(item.Id))
            .Select(item => new ConversationThreadView(
                item.Id.Trim(),
                item.Scope,
                item.Mode,
                item.Title,
                item.Project,
                item.Category,
                item.Tags.ToArray(),
                item.CreatedUtc,
                item.UpdatedUtc,
                item.Messages
                    .Select(message => new ConversationMessageView(
                        message.Role,
                        message.Text,
                        message.Meta,
                        message.CreatedUtc,
                        message.TokenUsage
                    ))
                    .ToArray(),
                item.LinkedMemoryNotes.ToArray(),
                item.LatestCodingResult
            ))
            .ToArray();
    }

    private static int CountBackupFiles(byte[] zipBytes)
    {
        using var memory = new MemoryStream(zipBytes);
        using var archive = new ZipArchive(memory, ZipArchiveMode.Read, leaveOpen: false);
        return archive.Entries.Count(entry => !string.IsNullOrWhiteSpace(entry.Name));
    }

    private BackupFileImportResult ImportBackupFiles(byte[] zipBytes, bool overwrite)
    {
        var imported = 0;
        var skipped = 0;
        using var memory = new MemoryStream(zipBytes);
        using var archive = new ZipArchive(memory, ZipArchiveMode.Read, leaveOpen: false);
        foreach (var entry in archive.Entries)
        {
            if (string.IsNullOrWhiteSpace(entry.Name)
                || IsBackupMetadataEntry(entry.FullName)
                || entry.FullName.Equals("conversations.json", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var targetPath = ResolveBackupImportTargetPath(entry.FullName);
            if (string.IsNullOrWhiteSpace(targetPath))
            {
                skipped += 1;
                continue;
            }

            if (File.Exists(targetPath) && !overwrite)
            {
                skipped += 1;
                continue;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(targetPath) ?? ResolveStateRootDir());
            using var input = entry.Open();
            using var output = new FileStream(targetPath, FileMode.Create, FileAccess.Write, FileShare.None);
            input.CopyTo(output);
            imported += 1;
        }

        return new BackupFileImportResult(imported, skipped);
    }

    private string[] BuildBackupFileConflicts(byte[] zipBytes)
    {
        using var memory = new MemoryStream(zipBytes);
        using var archive = new ZipArchive(memory, ZipArchiveMode.Read, leaveOpen: false);
        return archive.Entries
            .Where(entry => !string.IsNullOrWhiteSpace(entry.Name))
            .Where(entry => !IsBackupMetadataEntry(entry.FullName))
            .Where(entry => !entry.FullName.Equals("conversations.json", StringComparison.OrdinalIgnoreCase))
            .Select(entry => new
            {
                EntryName = NormalizeBackupEntryName(entry.FullName),
                TargetPath = ResolveBackupImportTargetPath(entry.FullName)
            })
            .Where(item => !string.IsNullOrWhiteSpace(item.TargetPath) && File.Exists(item.TargetPath))
            .Select(item => item.EntryName)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(item => item, StringComparer.Ordinal)
            .Take(50)
            .ToArray();
    }

    private string? ResolveBackupImportTargetPath(string entryName)
    {
        var normalized = entryName.Replace('\\', '/').Trim('/');
        if (string.IsNullOrWhiteSpace(normalized)
            || normalized.StartsWith("/", StringComparison.Ordinal)
            || normalized.Split('/').Any(part => part == ".."))
        {
            return null;
        }

        var stateRoot = ResolveStateRootDir();
        return normalized switch
        {
            _ when IsBackupMetadataEntry(normalized) => null,
            "routines.json" => _paths.RoutineStatePath,
            "routing-policy.json" => ResolveStateFilePath("routing-policy.json"),
            _ when normalized.StartsWith("memory-notes/", StringComparison.OrdinalIgnoreCase) =>
                Path.Combine(stateRoot, normalized),
            _ when normalized.StartsWith("plans/", StringComparison.OrdinalIgnoreCase) =>
                Path.Combine(stateRoot, normalized),
            _ when normalized.StartsWith("tasks/", StringComparison.OrdinalIgnoreCase) =>
                Path.Combine(stateRoot, normalized),
            _ when normalized.StartsWith("notebooks/", StringComparison.OrdinalIgnoreCase) =>
                Path.Combine(stateRoot, normalized),
            _ when normalized.StartsWith("skills/global/", StringComparison.OrdinalIgnoreCase) =>
                Path.Combine(stateRoot, "skills", normalized["skills/global/".Length..]),
            _ when normalized.StartsWith("commands/global/", StringComparison.OrdinalIgnoreCase) =>
                Path.Combine(stateRoot, "commands", normalized["commands/global/".Length..]),
            _ when normalized.StartsWith("skills/project/", StringComparison.OrdinalIgnoreCase) =>
                Path.Combine(_paths.WorkspaceRootDir, ".omni", "skills", normalized["skills/project/".Length..]),
            _ when normalized.StartsWith("commands/project/", StringComparison.OrdinalIgnoreCase) =>
                Path.Combine(_paths.WorkspaceRootDir, ".omni", "commands", normalized["commands/project/".Length..]),
            _ => null
        };
    }

    private void AddBackupManifest(
        ZipArchive archive,
        List<string> included,
        IReadOnlyList<string> excluded,
        IReadOnlyDictionary<string, string> fileSha256ByEntry,
        IReadOnlyList<string> selectedScopes
    )
    {
        var manifest = new BackupPackageManifest(
            SchemaVersion: "omnux-portable-package.v1",
            Kind: "local-first-portability",
            ExportedUtc: DateTimeOffset.UtcNow,
            StateRoot: "~/.omnux",
            WorkspaceRoot: "workspace/",
            Includes: BuildBackupManifestIncludes(selectedScopes),
            Excludes: excluded.ToArray(),
            FileSha256: fileSha256ByEntry
                .OrderBy(item => item.Key, StringComparer.Ordinal)
                .ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal),
            SyncPolicy: BuildBackupSyncPolicy(selectedScopes)
        );
        var json = JsonSerializer.Serialize(manifest, OmniJsonContext.Default.BackupPackageManifest);
        var entry = archive.CreateEntry(BackupManifestEntryName, CompressionLevel.Fastest);
        using var writer = new StreamWriter(entry.Open(), Encoding.UTF8);
        writer.Write(json);
        included.Add(BackupManifestEntryName);
    }

    private static IReadOnlyList<string> NormalizeBackupExportScopes(IReadOnlyList<string>? includeScopes)
    {
        if (includeScopes == null || includeScopes.Count == 0)
        {
            return BackupAllScopes;
        }

        var normalized = new List<string>();
        foreach (var raw in includeScopes)
        {
            var scope = NormalizeBackupScope(raw);
            if (string.IsNullOrWhiteSpace(scope))
            {
                continue;
            }

            if (string.Equals(scope, "all", StringComparison.Ordinal))
            {
                return BackupAllScopes;
            }

            if (!BackupAllScopeSet.Contains(scope))
            {
                throw new InvalidOperationException($"알 수 없는 백업 내보내기 범위입니다: {raw}");
            }

            if (!normalized.Contains(scope, StringComparer.Ordinal))
            {
                normalized.Add(scope);
            }
        }

        if (normalized.Count == 0)
        {
            throw new InvalidOperationException("백업 내보내기 범위를 하나 이상 선택하세요.");
        }

        return normalized.ToArray();
    }

    private static string NormalizeBackupScope(string? raw)
    {
        return (raw ?? string.Empty)
            .Trim()
            .Replace('_', '-')
            .ToLowerInvariant();
    }

    private static bool IsBackupScopeIncluded(IReadOnlyList<string> selectedScopes, string scope)
        => selectedScopes.Contains(scope, StringComparer.Ordinal);

    private static IReadOnlyList<string> BuildBackupManifestIncludes(IReadOnlyList<string> selectedScopes)
    {
        var includes = new List<string>();
        if (IsBackupScopeIncluded(selectedScopes, "conversations")) includes.Add("conversations.json");
        if (IsBackupScopeIncluded(selectedScopes, "routines")) includes.Add("routines.json");
        if (IsBackupScopeIncluded(selectedScopes, "routing-policy")) includes.Add("routing-policy.json");
        if (IsBackupScopeIncluded(selectedScopes, "memory-notes")) includes.Add("memory-notes/");
        if (IsBackupScopeIncluded(selectedScopes, "plans")) includes.Add("plans/");
        if (IsBackupScopeIncluded(selectedScopes, "tasks")) includes.Add("tasks/");
        if (IsBackupScopeIncluded(selectedScopes, "notebooks")) includes.Add("notebooks/");
        if (IsBackupScopeIncluded(selectedScopes, "skills/global")) includes.Add("skills/global/");
        if (IsBackupScopeIncluded(selectedScopes, "commands/global")) includes.Add("commands/global/");
        if (IsBackupScopeIncluded(selectedScopes, "skills/project")) includes.Add("skills/project/");
        if (IsBackupScopeIncluded(selectedScopes, "commands/project")) includes.Add("commands/project/");
        return includes;
    }

    private void AddFileToBackup(
        ZipArchive archive,
        string filePath,
        string entryName,
        List<string> included,
        IDictionary<string, string> fileSha256ByEntry
    )
    {
        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            return;
        }

        var entry = archive.CreateEntry(entryName, CompressionLevel.Fastest);
        using var entryStream = entry.Open();
        using var fileStream = File.OpenRead(filePath);
        fileSha256ByEntry[NormalizeBackupEntryName(entryName)] = CopyToAndComputeSha256Hex(fileStream, entryStream);
        included.Add(entryName);
    }

    private void AddDirectoryToBackup(
        ZipArchive archive,
        string directoryPath,
        string entryRoot,
        List<string> included,
        IDictionary<string, string> fileSha256ByEntry
    )
    {
        if (string.IsNullOrWhiteSpace(directoryPath) || !Directory.Exists(directoryPath))
        {
            return;
        }

        var root = Path.GetFullPath(directoryPath);
        foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
            if (ShouldSkipBackupFile(relative))
            {
                continue;
            }

            var entryName = $"{entryRoot.TrimEnd('/')}/{relative}";
            var entry = archive.CreateEntry(entryName, CompressionLevel.Fastest);
            using var entryStream = entry.Open();
            using var fileStream = File.OpenRead(file);
            fileSha256ByEntry[NormalizeBackupEntryName(entryName)] = CopyToAndComputeSha256Hex(fileStream, entryStream);
            included.Add(entryName);
        }
    }

    private static void ValidateBackupManifestIntegrity(byte[] zipBytes)
    {
        using var memory = new MemoryStream(zipBytes);
        using var archive = new ZipArchive(memory, ZipArchiveMode.Read, leaveOpen: false);
        var manifest = ReadBackupManifest(archive);
        if (manifest == null)
        {
            return;
        }

        if (manifest.FileSha256 == null || manifest.FileSha256.Count == 0)
        {
            throw new InvalidOperationException("백업 패키지 무결성 검증 실패: manifest SHA-256 항목이 없습니다.");
        }

        var expected = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var item in manifest.FileSha256)
        {
            var entryName = NormalizeBackupEntryName(item.Key);
            if (string.IsNullOrWhiteSpace(entryName) || !IsSha256Hex(item.Value))
            {
                throw new InvalidOperationException("백업 패키지 무결성 검증 실패: manifest SHA-256 항목이 올바르지 않습니다.");
            }

            if (!expected.TryAdd(entryName, item.Value.ToLowerInvariant()))
            {
                throw new InvalidOperationException($"백업 패키지 무결성 검증 실패: 중복 항목 '{entryName}'.");
            }
        }

        var actual = new Dictionary<string, ZipArchiveEntry>(StringComparer.Ordinal);
        foreach (var entry in archive.Entries)
        {
            if (string.IsNullOrWhiteSpace(entry.Name) || IsBackupMetadataEntry(entry.FullName))
            {
                continue;
            }

            var entryName = NormalizeBackupEntryName(entry.FullName);
            if (string.IsNullOrWhiteSpace(entryName))
            {
                continue;
            }

            if (!actual.TryAdd(entryName, entry))
            {
                throw new InvalidOperationException($"백업 패키지 무결성 검증 실패: ZIP 중복 항목 '{entryName}'.");
            }
        }

        var missing = expected.Keys
            .Where(entryName => !actual.ContainsKey(entryName))
            .OrderBy(entryName => entryName, StringComparer.Ordinal)
            .FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(missing))
        {
            throw new InvalidOperationException($"백업 패키지 무결성 검증 실패: 누락된 항목 '{missing}'.");
        }

        var extra = actual.Keys
            .Where(entryName => !expected.ContainsKey(entryName))
            .OrderBy(entryName => entryName, StringComparer.Ordinal)
            .FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(extra))
        {
            throw new InvalidOperationException($"백업 패키지 무결성 검증 실패: manifest에 없는 항목 '{extra}'.");
        }

        foreach (var item in expected.OrderBy(item => item.Key, StringComparer.Ordinal))
        {
            using var stream = actual[item.Key].Open();
            var actualHash = ComputeSha256Hex(stream);
            if (!string.Equals(actualHash, item.Value, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"백업 패키지 무결성 검증 실패: SHA-256 불일치 '{item.Key}'.");
            }
        }
    }

    private static BackupPackageManifest? ReadBackupManifest(ZipArchive archive)
    {
        var entry = archive.GetEntry(BackupManifestEntryName);
        if (entry == null)
        {
            return null;
        }

        using var stream = entry.Open();
        return JsonSerializer.Deserialize(stream, OmniJsonContext.Default.BackupPackageManifest);
    }

    private static BackupPackageManifest? ReadBackupManifest(byte[] zipBytes)
    {
        using var memory = new MemoryStream(zipBytes);
        using var archive = new ZipArchive(memory, ZipArchiveMode.Read, leaveOpen: false);
        return ReadBackupManifest(archive);
    }

    private BackupSyncPolicy BuildBackupSyncPolicy(IReadOnlyList<string> selectedScopes)
    {
        var config = _syncConfigStore.Read();
        var cloudBridge = !string.IsNullOrWhiteSpace(config.GistId)
            ? "enabled_via_github_gist"
            : "not_enabled_until_explicit_sync_provider_is_configured";
        return new BackupSyncPolicy(
            Mode: "portable-package-only",
            ConflictPolicy: "preview_conflicts_then_skip_without_overwrite_or_replace_with_overwrite",
            Scope: selectedScopes.ToArray(),
            CloudBridge: cloudBridge,
            SecretsPolicy: "never_export_api_keys_telegram_tokens_auth_sessions_or_runtime_logs"
        );
    }

    private static string ResolveBackupSyncMode(BackupPackageManifest? manifest)
    {
        return string.IsNullOrWhiteSpace(manifest?.SyncPolicy?.Mode)
            ? "portable-package-only"
            : manifest!.SyncPolicy!.Mode.Trim();
    }

    private static string ResolveBackupConflictPolicy(BackupPackageManifest? manifest)
    {
        return string.IsNullOrWhiteSpace(manifest?.SyncPolicy?.ConflictPolicy)
            ? "preview_conflicts_then_skip_without_overwrite_or_replace_with_overwrite"
            : manifest!.SyncPolicy!.ConflictPolicy.Trim();
    }

    private static string CopyToAndComputeSha256Hex(Stream input, Stream output)
    {
        using var sha256 = SHA256.Create();
        var buffer = new byte[81920];
        int read;
        while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
        {
            output.Write(buffer, 0, read);
            sha256.TransformBlock(buffer, 0, read, null, 0);
        }

        sha256.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
        return Convert.ToHexString(sha256.Hash ?? Array.Empty<byte>()).ToLowerInvariant();
    }

    private static string ComputeSha256Hex(Stream input)
        => Convert.ToHexString(SHA256.HashData(input)).ToLowerInvariant();

    private static bool IsSha256Hex(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length != 64)
        {
            return false;
        }

        return value.All(character =>
            (character >= '0' && character <= '9')
            || (character >= 'a' && character <= 'f')
            || (character >= 'A' && character <= 'F'));
    }

    private static bool ShouldSkipBackupFile(string relativePath)
    {
        var normalized = relativePath.Replace('\\', '/');
        var lower = normalized.ToLowerInvariant();
        return lower.Contains("/cache/", StringComparison.Ordinal)
               || lower.Contains("/lock", StringComparison.Ordinal)
               || lower.EndsWith(".lock", StringComparison.Ordinal)
               || lower.EndsWith(".log", StringComparison.Ordinal)
               || lower.Contains("/runtime/", StringComparison.Ordinal)
               || lower.Contains("/outbox", StringComparison.Ordinal);
    }

    private static bool IsBackupMetadataEntry(string entryName)
    {
        var normalized = NormalizeBackupEntryName(entryName);
        return normalized.Equals(BackupManifestEntryName, StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeBackupEntryName(string? entryName)
        => (entryName ?? string.Empty).Replace('\\', '/').Trim('/');

    private string ResolveStateRootDir()
    {
        return Path.GetDirectoryName(Path.GetFullPath(_paths.ConversationStatePath))
               ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".omnux");
    }

    private string ResolveStateFilePath(string fileName) => Path.Combine(ResolveStateRootDir(), fileName);

    private string ResolveStateDirectoryPath(string directoryName) => Path.Combine(ResolveStateRootDir(), directoryName);

    private void CleanupExpiredBackupPreviews()
    {
        var cutoff = DateTimeOffset.UtcNow.AddMinutes(-30);
        foreach (var item in _backupImportPreviews)
        {
            if (item.Value.CreatedUtc < cutoff)
            {
                _backupImportPreviews.TryRemove(item.Key, out _);
            }
        }
    }

    private string ResolveWorkspaceRoot()
    {
        var configured = string.IsNullOrWhiteSpace(_paths.WorkspaceRootDir)
            ? Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."))
            : _paths.WorkspaceRootDir;
        var fullPath = Path.GetFullPath(configured);
        try
        {
            Directory.CreateDirectory(fullPath);
        }
        catch
        {
        }

        return fullPath;
    }

    private static bool IsPathUnderRoot(string candidatePath, string rootPath)
    {
        var fullRoot = Path.GetFullPath(rootPath)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var fullCandidate = Path.GetFullPath(candidatePath)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        if (string.Equals(fullCandidate, fullRoot, comparison))
        {
            return true;
        }

        var rootWithSlash = fullRoot + Path.DirectorySeparatorChar;
        return fullCandidate.StartsWith(rootWithSlash, comparison);
    }

    private static string NormalizeAuditToken(string? token, string fallback)
    {
        var normalized = (token ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized.ToLowerInvariant();
    }

    private sealed record BackupImportPackage(
        byte[] ZipBytes,
        IReadOnlyList<ConversationThreadView> Conversations,
        DateTimeOffset CreatedUtc
    );

    private sealed record BackupFileImportResult(int Imported, int Skipped);
}

public sealed record BackupPackageManifest(
    string SchemaVersion,
    string Kind,
    DateTimeOffset ExportedUtc,
    string StateRoot,
    string WorkspaceRoot,
    IReadOnlyList<string> Includes,
    IReadOnlyList<string> Excludes,
    Dictionary<string, string> FileSha256,
    BackupSyncPolicy? SyncPolicy
);

public sealed record BackupSyncPolicy(
    string Mode,
    string ConflictPolicy,
    IReadOnlyList<string> Scope,
    string CloudBridge,
    string SecretsPolicy
);

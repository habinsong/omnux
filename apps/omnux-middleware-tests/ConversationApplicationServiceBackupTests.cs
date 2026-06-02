using System.IO.Compression;
using System.Collections;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ConversationApplicationServiceBackupTests
{
    [Fact]
    public void ExportBackupIncludesPortableManifestAndExpectedState()
    {
        var root = CreateTempDirectory();
        var service = BuildService(root);

        var exported = service.ExportBackup();

        Assert.True(exported.Ok);
        Assert.Contains("omnux-package.json", exported.Included);
        Assert.Contains("conversations.json", exported.Included);
        Assert.Contains("routines.json", exported.Included);
        Assert.Contains("routing-policy.json", exported.Included);
        Assert.Contains("skills/global/", string.Join('\n', exported.Included));
        Assert.Contains("commands/project/", string.Join('\n', exported.Included));
        Assert.Contains("API 키", exported.Excluded);
        Assert.Contains("runtime logs", exported.Excluded);

        using var archive = OpenArchive(exported.ContentBase64);
        var manifest = ReadManifest(archive);

        Assert.Equal("omnux-portable-package.v1", manifest.GetProperty("SchemaVersion").GetString());
        Assert.Equal("local-first-portability", manifest.GetProperty("Kind").GetString());
        Assert.Equal("~/.omnux", manifest.GetProperty("StateRoot").GetString());
        Assert.Equal("workspace/", manifest.GetProperty("WorkspaceRoot").GetString());
        Assert.Contains("conversations.json", manifest.GetProperty("Includes").EnumerateArray().Select(item => item.GetString()).ToArray());
        Assert.Contains("API 키", manifest.GetProperty("Excludes").EnumerateArray().Select(item => item.GetString()).ToArray());

        var fileSha256 = manifest.GetProperty("FileSha256");
        Assert.True(fileSha256.TryGetProperty("conversations.json", out var conversationSha256));
        Assert.Equal(64, conversationSha256.GetString()?.Length);
        Assert.Equal(ComputeArchiveEntrySha256(archive, "conversations.json"), conversationSha256.GetString());
    }

    [Fact]
    public void ImportBackupSkipsPortableManifestAsMetadata()
    {
        var root = CreateTempDirectory();
        var service = BuildService(root);

        var exported = service.ExportBackup();
        var preview = service.PreviewBackupImport(exported.FileName, exported.ContentBase64);

        Assert.True(preview.Ok);
        Assert.True(preview.FileCount >= preview.ConversationCount);
        Assert.True(preview.FileCount > 0);

        var applied = service.ApplyBackupImport(preview.PreviewId, overwrite: true);

        Assert.True(applied.Ok);
        var manifestPath = Path.Combine(root, ".state", "omnux-package.json");
        Assert.False(File.Exists(manifestPath));
    }

    [Fact]
    public void PreviewBackupImportRejectsTamperedPortableManifestPayload()
    {
        var root = CreateTempDirectory();
        var service = BuildService(root);

        var exported = service.ExportBackup();
        var tamperedContentBase64 = ReplaceZipEntryContent(
            exported.ContentBase64,
            "conversations.json",
            "{\"conversations\":[]}"
        );

        var preview = service.PreviewBackupImport(exported.FileName, tamperedContentBase64);

        Assert.False(preview.Ok);
        Assert.Contains("SHA-256", preview.Error);
    }

    [Fact]
    public void ApplyBackupImportRevalidatesPortableManifestPayload()
    {
        var root = CreateTempDirectory();
        var service = BuildService(root);

        var exported = service.ExportBackup();
        var preview = service.PreviewBackupImport(exported.FileName, exported.ContentBase64);
        Assert.True(preview.Ok);

        var tamperedContentBase64 = ReplaceZipEntryContent(
            exported.ContentBase64,
            "conversations.json",
            "{\"conversations\":[]}"
        );
        ReplaceCachedBackupPackageBytes(service, preview.PreviewId, Convert.FromBase64String(tamperedContentBase64));

        var applied = service.ApplyBackupImport(preview.PreviewId, overwrite: true);

        Assert.False(applied.Ok);
        Assert.Contains("SHA-256", applied.Error);
    }

    private static ConversationApplicationService BuildService(string root)
    {
        var stateRoot = Path.Combine(root, ".state");
        var workspaceRoot = Path.Combine(root, "workspace");
        var paths = new PathOptions(
            Path.Combine(root, "index.html"),
            Path.Combine(stateRoot, "llm_usage.json"),
            Path.Combine(stateRoot, "copilot_usage.json"),
            Path.Combine(stateRoot, "conversations.json"),
            Path.Combine(stateRoot, "auth_sessions.json"),
            Path.Combine(stateRoot, "memory-notes"),
            Path.Combine(workspaceRoot, "code-runs"),
            Path.Combine(workspaceRoot, "routines"),
            workspaceRoot,
            Path.Combine(stateRoot, "routines.json"),
            Path.Combine(workspaceRoot, "_routine_prompts"),
            Path.Combine(stateRoot, "audit.log"),
            Path.Combine(stateRoot, "guard_retry_timeline.json"),
            Path.Combine(stateRoot, "gateway_health.json"),
            Path.Combine(stateRoot, "gateway_startup_probe.json"),
            Path.Combine(stateRoot, "dashboard_access.json"),
            Path.Combine(root, "executor.py")
        );

        Directory.CreateDirectory(stateRoot);
        Directory.CreateDirectory(workspaceRoot);
        Directory.CreateDirectory(paths.MemoryNotesRootDir);
        Directory.CreateDirectory(Path.Combine(stateRoot, "plans"));
        Directory.CreateDirectory(Path.Combine(stateRoot, "tasks"));
        Directory.CreateDirectory(Path.Combine(stateRoot, "notebooks"));
        Directory.CreateDirectory(Path.Combine(stateRoot, "skills"));
        Directory.CreateDirectory(Path.Combine(stateRoot, "commands"));
        Directory.CreateDirectory(Path.Combine(workspaceRoot, ".omni", "skills"));
        Directory.CreateDirectory(Path.Combine(workspaceRoot, ".omni", "commands"));

        File.WriteAllText(paths.ConversationStatePath, BuildConversationStateJson(), Encoding.UTF8);
        File.WriteAllText(paths.RoutineStatePath, "{\"routines\":[]}", Encoding.UTF8);
        File.WriteAllText(Path.Combine(stateRoot, "routing-policy.json"), "{\"version\":1}", Encoding.UTF8);
        File.WriteAllText(Path.Combine(paths.MemoryNotesRootDir, "note.md"), "# note", Encoding.UTF8);
        File.WriteAllText(Path.Combine(stateRoot, "plans", "plan.json"), "{\"plan\":1}", Encoding.UTF8);
        File.WriteAllText(Path.Combine(stateRoot, "tasks", "task.json"), "{\"task\":1}", Encoding.UTF8);
        File.WriteAllText(Path.Combine(stateRoot, "notebooks", "handoff.md"), "# handoff", Encoding.UTF8);
        File.WriteAllText(Path.Combine(stateRoot, "skills", "global-skill.md"), "# skill", Encoding.UTF8);
        File.WriteAllText(Path.Combine(stateRoot, "commands", "global-command.md"), "# command", Encoding.UTF8);
        File.WriteAllText(Path.Combine(workspaceRoot, ".omni", "skills", "project-skill.md"), "# project skill", Encoding.UTF8);
        File.WriteAllText(Path.Combine(workspaceRoot, ".omni", "commands", "project-command.md"), "# project command", Encoding.UTF8);

        return new ConversationApplicationService(
            new ConversationStore(paths.ConversationStatePath),
            new MemoryNoteStore(paths.MemoryNotesRootDir),
            new AuditLogger(Path.Combine(stateRoot, "audit.log")),
            paths,
            new MemorySearchTool(paths)
        );
    }

    private static string BuildConversationStateJson()
    {
        var state = new ConversationState
        {
            Conversations = new List<ConversationThread>
            {
                new()
                {
                    Id = "conv-1",
                    Scope = "chat",
                    Mode = "single",
                    Title = "테스트 대화",
                    Project = "기본",
                    Category = "일반",
                    Tags = new List<string> { "portable" },
                    CreatedUtc = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
                    UpdatedUtc = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
                    Messages = new List<ConversationMessage>
                    {
                        new()
                        {
                            Role = "user",
                            Text = "백업 테스트",
                            Meta = "",
                            CreatedUtc = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero)
                        }
                    },
                    LinkedMemoryNotes = new List<string> { "note.md" }
                }
            }
        };

        return JsonSerializer.Serialize(state, OmniJsonContext.Default.ConversationState);
    }

    private static ZipArchive OpenArchive(string contentBase64)
    {
        var bytes = Convert.FromBase64String(contentBase64);
        return new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read, leaveOpen: false);
    }

    private static JsonElement ReadManifest(ZipArchive archive)
    {
        var entry = archive.GetEntry("omnux-package.json");
        Assert.NotNull(entry);

        using var stream = entry!.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        var text = reader.ReadToEnd();
        using var doc = JsonDocument.Parse(text);
        return doc.RootElement.Clone();
    }

    private static string ComputeArchiveEntrySha256(ZipArchive archive, string entryName)
    {
        var entry = archive.GetEntry(entryName);
        Assert.NotNull(entry);

        using var stream = entry!.Open();
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    private static string ReplaceZipEntryContent(string contentBase64, string targetEntryName, string replacementContent)
    {
        var replaced = false;
        var sourceBytes = Convert.FromBase64String(contentBase64);
        using var sourceMemory = new MemoryStream(sourceBytes);
        using var sourceArchive = new ZipArchive(sourceMemory, ZipArchiveMode.Read, leaveOpen: false);
        using var outputMemory = new MemoryStream();
        using (var outputArchive = new ZipArchive(outputMemory, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var sourceEntry in sourceArchive.Entries)
            {
                var outputEntry = outputArchive.CreateEntry(sourceEntry.FullName, CompressionLevel.Fastest);
                if (string.IsNullOrWhiteSpace(sourceEntry.Name))
                {
                    continue;
                }

                using var outputStream = outputEntry.Open();
                if (string.Equals(sourceEntry.FullName, targetEntryName, StringComparison.Ordinal))
                {
                    var bytes = Encoding.UTF8.GetBytes(replacementContent);
                    outputStream.Write(bytes, 0, bytes.Length);
                    replaced = true;
                    continue;
                }

                using var inputStream = sourceEntry.Open();
                inputStream.CopyTo(outputStream);
            }
        }

        Assert.True(replaced);
        return Convert.ToBase64String(outputMemory.ToArray());
    }

    private static void ReplaceCachedBackupPackageBytes(
        ConversationApplicationService service,
        string previewId,
        byte[] zipBytes
    )
    {
        var field = typeof(ConversationApplicationService).GetField(
            "_backupImportPreviews",
            System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic
        );
        Assert.NotNull(field);

        var store = field!.GetValue(service);
        Assert.NotNull(store);

        var package = FindCachedBackupPackage(store!, previewId);
        var packageType = package.GetType();
        var conversations = packageType.GetProperty("Conversations")!.GetValue(package);
        var createdUtc = packageType.GetProperty("CreatedUtc")!.GetValue(package);
        var constructor = packageType
            .GetConstructors(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic)
            .Single(item => item.GetParameters().Length == 3);
        var replacement = constructor.Invoke(new[] { zipBytes, conversations, createdUtc });
        store!.GetType().GetProperty("Item")!.SetValue(store, replacement, new object[] { previewId });
    }

    private static object FindCachedBackupPackage(object store, string previewId)
    {
        foreach (var item in (IEnumerable)store)
        {
            var itemType = item.GetType();
            var key = itemType.GetProperty("Key")!.GetValue(item) as string;
            if (!string.Equals(key, previewId, StringComparison.Ordinal))
            {
                continue;
            }

            return itemType.GetProperty("Value")!.GetValue(item)!;
        }

        throw new InvalidOperationException("backup preview package not found");
    }

    private static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), "omnux-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }
}

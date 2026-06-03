using System.ComponentModel;
using System.Diagnostics;

namespace Omnux.Middleware;

internal sealed class SemanticSearchIndexProbe
{
    private const string DefaultIndexFileName = "main.sqlite";
    private const int SqliteCommandTimeoutMs = 15000;

    private readonly string _dbPath;
    private readonly Func<string, bool> _fileExists;
    private readonly Func<string, bool> _commandAvailable;
    private readonly Func<string, string, SemanticSearchSqliteResult> _sqliteRunner;

    public SemanticSearchIndexProbe(
        string conversationStatePath,
        Func<string, bool>? fileExists = null,
        Func<string, bool>? commandAvailable = null,
        Func<string, string, SemanticSearchSqliteResult>? sqliteRunner = null
    )
    {
        _dbPath = Path.Combine(ResolveStateRoot(conversationStatePath), "memory-index", DefaultIndexFileName);
        _fileExists = fileExists ?? File.Exists;
        _commandAvailable = commandAvailable ?? IsCommandAvailable;
        _sqliteRunner = sqliteRunner ?? ExecuteSqlite;
    }

    public string DbPath => _dbPath;

    public SemanticSearchIndexSnapshot GetSnapshot(
        ICollection<SemanticSearchReadinessCheck> checks,
        ICollection<string> warnings
    )
    {
        var dbExists = _fileExists(_dbPath);
        checks.Add(new SemanticSearchReadinessCheck(
            "memory_index_db",
            dbExists ? "ok" : "failed",
            dbExists ? "memory index database exists" : "memory index database does not exist"
        ));

        var sqliteCliAvailable = _commandAvailable("sqlite3");
        checks.Add(new SemanticSearchReadinessCheck(
            "sqlite_cli",
            sqliteCliAvailable ? "ok" : "failed",
            sqliteCliAvailable ? "sqlite3 command is resolvable" : "sqlite3 command is not resolvable"
        ));

        if (!dbExists || !sqliteCliAvailable)
        {
            checks.Add(new SemanticSearchReadinessCheck(
                "fts_bm25",
                "skipped",
                "FTS readiness was not queried because the DB or sqlite3 CLI is unavailable"
            ));
            checks.Add(new SemanticSearchReadinessCheck(
                "sqlite_vec",
                "skipped",
                "sqlite-vec readiness was not queried because the DB or sqlite3 CLI is unavailable"
            ));

            return new SemanticSearchIndexSnapshot(
                dbExists,
                sqliteCliAvailable,
                FtsAvailable: false,
                SqliteVecAvailable: false,
                FileCount: 0,
                ChunkCount: 0,
                EmbeddingCacheEntryCount: 0,
                ChunkSources: Array.Empty<SemanticSearchSourceCount>()
            );
        }

        var ftsAvailable = QueryInt(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'chunks_fts';",
            warnings
        ) > 0;
        var sqliteVecAvailable = QueryInt(
            "SELECT COUNT(*) FROM pragma_function_list WHERE name IN ('vec_version', 'vec_distance_cosine');",
            warnings
        ) > 0;

        checks.Add(new SemanticSearchReadinessCheck(
            "fts_bm25",
            ftsAvailable ? "ok" : "failed",
            ftsAvailable ? "chunks_fts table is available" : "chunks_fts table is not available"
        ));
        checks.Add(new SemanticSearchReadinessCheck(
            "sqlite_vec",
            sqliteVecAvailable ? "ok" : "skipped",
            sqliteVecAvailable ? "sqlite-vec functions are visible to sqlite3" : "sqlite-vec is not loaded; vector search remains disabled"
        ));

        return new SemanticSearchIndexSnapshot(
            dbExists,
            sqliteCliAvailable,
            ftsAvailable,
            sqliteVecAvailable,
            QueryInt("SELECT COUNT(*) FROM files;", warnings),
            QueryInt("SELECT COUNT(*) FROM chunks;", warnings),
            QueryInt("SELECT COUNT(*) FROM embedding_cache;", warnings),
            QuerySourceCounts(warnings)
        );
    }

    private IReadOnlyList<SemanticSearchSourceCount> QuerySourceCounts(ICollection<string> warnings)
    {
        var output = QueryValue(
            "SELECT source || '|' || COUNT(*) FROM chunks GROUP BY source ORDER BY source;",
            warnings
        );
        if (string.IsNullOrWhiteSpace(output))
        {
            return Array.Empty<SemanticSearchSourceCount>();
        }

        var counts = new List<SemanticSearchSourceCount>();
        foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var parts = line.Split('|', 2, StringSplitOptions.TrimEntries);
            if (parts.Length == 2 && int.TryParse(parts[1], out var count))
            {
                counts.Add(new SemanticSearchSourceCount(parts[0], count));
            }
        }

        return counts;
    }

    private int QueryInt(string sql, ICollection<string> warnings)
    {
        var output = QueryValue(sql, warnings);
        return int.TryParse(output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault(), out var value)
            ? value
            : 0;
    }

    private string QueryValue(string sql, ICollection<string> warnings)
    {
        try
        {
            var result = _sqliteRunner(_dbPath, sql);
            if (result.ExitCode == 0)
            {
                return (result.StdOut ?? string.Empty).Trim();
            }

            warnings.Add($"sqlite_query_failed:{TrimForError(result.StdErr)}");
            return string.Empty;
        }
        catch (Exception ex) when (ex is InvalidOperationException or TimeoutException or Win32Exception)
        {
            warnings.Add($"sqlite_query_failed:{TrimForError(ex.Message)}");
            return string.Empty;
        }
    }

    private static string ResolveStateRoot(string conversationStatePath)
    {
        var configured = Path.GetDirectoryName(conversationStatePath);
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Path.GetFullPath(configured);
        }

        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!string.IsNullOrWhiteSpace(home))
        {
            return Path.Combine(home, ".omnux");
        }

        return Path.GetTempPath();
    }

    private static bool IsCommandAvailable(string command)
    {
        var trimmed = (command ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return false;
        }

        if (Path.IsPathRooted(trimmed)
            || trimmed.Contains(Path.DirectorySeparatorChar)
            || trimmed.Contains(Path.AltDirectorySeparatorChar))
        {
            return File.Exists(trimmed);
        }

        return (Env.Get("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(directory => File.Exists(Path.Combine(directory, trimmed)));
    }

    private static SemanticSearchSqliteResult ExecuteSqlite(string dbPath, string sql)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "sqlite3",
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add(dbPath);

        using var process = new Process { StartInfo = startInfo };
        try
        {
            process.Start();
        }
        catch (Win32Exception ex)
        {
            throw new InvalidOperationException("sqlite3 executable was not found.", ex);
        }

        process.StandardInput.Write(sql);
        process.StandardInput.Flush();
        process.StandardInput.Close();

        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();

        if (!process.WaitForExit(SqliteCommandTimeoutMs))
        {
            TryKill(process);
            throw new TimeoutException("sqlite3 command timed out.");
        }

        Task.WaitAll(stdoutTask, stderrTask);
        return new SemanticSearchSqliteResult(
            process.ExitCode,
            stdoutTask.Result ?? string.Empty,
            stderrTask.Result ?? string.Empty
        );
    }

    private static void TryKill(Process process)
    {
        try
        {
            process.Kill(entireProcessTree: true);
        }
        catch
        {
        }
    }

    private static string TrimForError(string value)
    {
        var text = (value ?? string.Empty).Trim();
        return text.Length <= 240 ? text : text[..240] + "...";
    }
}

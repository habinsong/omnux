namespace Omnux.Middleware;

internal static class ProjectChangeTransaction
{
    public static async Task ApplyAsync(ProjectChangeRecord record, CancellationToken token)
    {
        var changes = record.Preview.Files;
        var source = record.Preview.Project.Path;
        foreach (var change in changes)
        {
            var current = ProjectChangeFiles.Resolve(source, change.Path);
            var candidate = ProjectChangeFiles.Resolve(record.CandidateDirectory, change.Path);
            if (change.Conflict != null || Directory.Exists(current)
                || await ProjectChangeFiles.HashAsync(current, token) != change.BeforeHash
                || await ProjectChangeFiles.HashAsync(candidate, token) != change.AfterHash
                || await ProjectChangeFiles.HashAsync(ProjectChangeFiles.Resolve(record.BaselineDirectory, change.Path), token) != change.BeforeHash)
                throw new IOException("검토 이후 원본 또는 비교 결과가 바뀌었습니다. 변경 내용을 다시 확인해 주세요.");
        }
        var applied = new List<(ProjectFileChange Change, string? WrittenHash)>();
        try
        {
            foreach (var change in changes)
            {
                token.ThrowIfCancellationRequested();
                var target = ProjectChangeFiles.Resolve(source, change.Path);
                if (await ProjectChangeFiles.HashAsync(target, token) != change.BeforeHash) throw new IOException("반영 중 원본 파일이 바뀌었습니다.");
                string? written = null;
                if (change.AfterHash == null) File.Delete(target);
                else written = await ProjectChangeFiles.CopyAtomicAsync(ProjectChangeFiles.Resolve(record.CandidateDirectory, change.Path), target, token);
                applied.Add((change, written));
                if (written != change.AfterHash) throw new IOException("반영 중 비교 결과가 바뀌었습니다.");
            }
        }
        catch (Exception failure)
        {
            var rollbackErrors = new List<string>();
            foreach (var appliedFile in applied.AsEnumerable().Reverse())
            {
                var change = appliedFile.Change;
                try
                {
                    var target = ProjectChangeFiles.Resolve(source, change.Path);
                    if (await ProjectChangeFiles.HashAsync(target, CancellationToken.None) != appliedFile.WrittenHash)
                        throw new IOException("다른 변경이 있어 자동 복구하지 않았습니다.");
                    if (change.BeforeHash == null) File.Delete(target);
                    else await ProjectChangeFiles.CopyAtomicAsync(ProjectChangeFiles.Resolve(record.BaselineDirectory, change.Path), target, CancellationToken.None);
                }
                catch (Exception ex) { rollbackErrors.Add(change.Path + ": " + ex.Message); }
            }
            throw new IOException(rollbackErrors.Count == 0 ? "반영하지 못해 이전 파일로 복구했습니다. " + failure.Message
                : "일부 파일을 복구하지 못했습니다. " + string.Join(" / ", rollbackErrors), failure);
        }
    }
}

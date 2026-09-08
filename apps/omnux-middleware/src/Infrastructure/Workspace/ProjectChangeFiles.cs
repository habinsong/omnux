using System.Security.Cryptography;

namespace Omnux.Middleware;

internal static class ProjectChangeFiles
{
    public static string Resolve(string root, string relative)
    {
        if (Path.IsPathRooted(relative) || CodingWorkspaceFilePolicy.IsPrivate(relative)) throw new IOException("프로젝트에서 다룰 수 없는 파일 경로입니다.");
        var path = Path.GetFullPath(Path.Combine(root, relative));
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (!path.StartsWith(Path.TrimEndingDirectorySeparator(root) + Path.DirectorySeparatorChar, comparison)) throw new IOException("프로젝트 밖의 경로입니다.");
        for (var current = path; current != null && !current.Equals(root, comparison); current = Path.GetDirectoryName(current))
        {
            try { if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new IOException("링크를 통하는 파일 변경은 허용하지 않습니다."); }
            catch (FileNotFoundException) { }
            catch (DirectoryNotFoundException) { }
        }
        return path;
    }

    public static async Task<string?> HashAsync(string path, CancellationToken token)
    {
        if (!File.Exists(path)) return null;
        await using var stream = File.OpenRead(path);
        var content = Convert.ToHexString(await SHA256.HashDataAsync(stream, token));
        return OperatingSystem.IsWindows() ? content : content + ":" + (int)File.GetUnixFileMode(path);
    }

    public static async Task<(string Text, bool Truncated)> DiffAsync(string name, string before, string after, CancellationToken token)
    {
        var mime = CodingPreviewPolicy.ContentType(name);
        if (!mime.Contains("charset=utf-8", StringComparison.OrdinalIgnoreCase)) return ("바이너리 파일 변경", false);
        const int limit = 2_000_000;
        if ((File.Exists(before) && new FileInfo(before).Length > limit) || (File.Exists(after) && new FileInfo(after).Length > limit))
            return ("파일이 커서 차이 미리보기를 생략했습니다. 원본 파일을 확인해 주세요.", true);
        var left = File.Exists(before) ? await File.ReadAllTextAsync(before, token) : "";
        var right = File.Exists(after) ? await File.ReadAllTextAsync(after, token) : "";
        if (left == right && !OperatingSystem.IsWindows() && File.Exists(before) && File.Exists(after)
            && File.GetUnixFileMode(before) != File.GetUnixFileMode(after))
            return ($"파일 권한: {Convert.ToString((int)File.GetUnixFileMode(before), 8)} → {Convert.ToString((int)File.GetUnixFileMode(after), 8)}", false);
        var diff = UnifiedTextDiff.Build(name, left, right);
        return diff.Length > 60000 ? (diff[..60000] + "\n… 차이 일부만 표시했습니다.", true) : (diff, false);
    }

    public static async Task<string> CopyAtomicAsync(string source, string destination, CancellationToken token)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
        var temporary = Path.Combine(Path.GetDirectoryName(destination)!, ".omnux-apply-" + Guid.NewGuid().ToString("N"));
        try
        {
            await using (var input = File.OpenRead(source))
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                await input.CopyToAsync(output, token);
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(temporary, File.GetUnixFileMode(source));
            var writtenHash = await HashAsync(temporary, token) ?? throw new IOException("임시 파일을 읽지 못했습니다.");
            token.ThrowIfCancellationRequested();
            File.Move(temporary, destination, overwrite: true);
            return writtenHash;
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}

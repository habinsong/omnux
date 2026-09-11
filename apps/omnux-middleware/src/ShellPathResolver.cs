namespace Omnux.Middleware;

// 명령을 돌릴 셸. macOS 기본은 zsh 지만 Ubuntu 등 Linux 배포판에는 zsh 가 기본으로 없다.
internal static class ShellPathResolver
{
    private static readonly string[] PosixShellCandidates =
    {
        "/bin/zsh",
        "/usr/bin/zsh",
        "/bin/bash",
        "/usr/bin/bash",
        "/bin/sh"
    };

    public static string Resolve()
    {
        if (OperatingSystem.IsWindows())
        {
            return "cmd.exe";
        }

        foreach (var candidate in PosixShellCandidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return "/bin/sh";
    }
}

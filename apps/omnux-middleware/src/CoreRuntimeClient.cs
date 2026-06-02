using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;

namespace Omnux.Middleware;

public interface ICoreRuntimeClient
{
    Task<string> GetMetricsAsync(CancellationToken cancellationToken);
    Task<string> KillAsync(int pid, CancellationToken cancellationToken);
}

public sealed class DotNetCoreRuntimeClient : ICoreRuntimeClient
{
    public Task<string> GetMetricsAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var cpuUsage = ResolveCpuLoad1m();
        var memFreeMb = ResolveAvailableMemoryMb();
        return Task.FromResult(
            "status=ok "
            + $"cpu_usage={cpuUsage.ToString("0.00", CultureInfo.InvariantCulture)} "
            + $"mem_free_mb={memFreeMb.ToString(CultureInfo.InvariantCulture)}"
        );
    }

    public Task<string> KillAsync(int pid, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (pid <= 1)
        {
            return Task.FromResult("status=error message=invalid pid");
        }

        try
        {
            if (!OperatingSystem.IsWindows())
            {
                if (NativeMethods.kill(pid, NativeMethods.SigTerm) != 0)
                {
                    var errorCode = Marshal.GetLastPInvokeError();
                    return Task.FromResult($"status=error message=kill failed: {new System.ComponentModel.Win32Exception(errorCode).Message}");
                }

                return Task.FromResult($"status=ok killed_pid={pid.ToString(CultureInfo.InvariantCulture)}");
            }

            using var process = Process.GetProcessById(pid);
            process.Kill(entireProcessTree: false);
            return Task.FromResult($"status=ok killed_pid={pid.ToString(CultureInfo.InvariantCulture)}");
        }
        catch (ArgumentException ex)
        {
            return Task.FromResult($"status=error message=kill failed: {ex.Message}");
        }
        catch (InvalidOperationException ex)
        {
            return Task.FromResult($"status=error message=kill failed: {ex.Message}");
        }
        catch (System.ComponentModel.Win32Exception ex)
        {
            return Task.FromResult($"status=error message=kill failed: {ex.Message}");
        }
        catch (UnauthorizedAccessException ex)
        {
            return Task.FromResult($"status=error message=kill failed: {ex.Message}");
        }
        catch (NotSupportedException ex)
        {
            return Task.FromResult($"status=error message=kill failed: {ex.Message}");
        }
    }

    private static double ResolveCpuLoad1m()
    {
        try
        {
            return !OperatingSystem.IsWindows() && NativeMethods.getloadavg(out var load1, 1) == 1
                ? load1
                : -1.0d;
        }
        catch
        {
            return -1.0d;
        }
    }

    private static long ResolveAvailableMemoryMb()
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                var status = new NativeMethods.MemoryStatusEx();
                status.dwLength = (uint)Marshal.SizeOf<NativeMethods.MemoryStatusEx>();
                return NativeMethods.GlobalMemoryStatusEx(ref status)
                    ? (long)(status.ullAvailPhys / (1024UL * 1024UL))
                    : -1;
            }

            var pages = OperatingSystem.IsLinux()
                ? NativeMethods.sysconf(NativeMethods.LinuxScAvailPhysPages)
                : OperatingSystem.IsMacOS()
                    ? NativeMethods.sysconf(NativeMethods.MacScPhysPages)
                    : -1;
            var pageSize = Environment.SystemPageSize;
            if (pages <= 0 || pageSize <= 0)
            {
                return -1;
            }

            return (long)(((double)pages * pageSize) / (1024.0d * 1024.0d));
        }
        catch
        {
            return -1;
        }
    }

    private static class NativeMethods
    {
        public const int SigTerm = 15;
        public const int LinuxScAvailPhysPages = 86;
        public const int MacScPhysPages = 200;

        [DllImport("libc", SetLastError = false)]
        public static extern int getloadavg(out double loadavg, int nelem);

        [DllImport("libc", SetLastError = false)]
        public static extern long sysconf(int name);

        [DllImport("libc", SetLastError = true)]
        public static extern int kill(int pid, int sig);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx lpBuffer);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public struct MemoryStatusEx
        {
            public uint dwLength;
            public uint dwMemoryLoad;
            public ulong ullTotalPhys;
            public ulong ullAvailPhys;
            public ulong ullTotalPageFile;
            public ulong ullAvailPageFile;
            public ulong ullTotalVirtual;
            public ulong ullAvailVirtual;
            public ulong ullAvailExtendedVirtual;
        }
    }
}

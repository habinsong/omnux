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
    private static readonly object WindowsCpuLock = new();
    private static ulong _previousWindowsIdle;
    private static ulong _previousWindowsKernel;
    private static ulong _previousWindowsUser;

    public Task<string> GetMetricsAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var cpuUsage = ResolveCpuUsagePercent();
        var memory = ResolveMemory();
        return Task.FromResult(
            "status=ok "
            + $"cpu_usage={cpuUsage.ToString("0.00", CultureInfo.InvariantCulture)} "
            + $"mem_used_mb={memory.UsedMb.ToString(CultureInfo.InvariantCulture)} "
            + $"mem_total_mb={memory.TotalMb.ToString(CultureInfo.InvariantCulture)} "
            + $"mem_free_mb={memory.AvailableMb.ToString(CultureInfo.InvariantCulture)} "
            + $"mem_usage={memory.UsagePercent.ToString("0.00", CultureInfo.InvariantCulture)}"
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

    private static double ResolveCpuUsagePercent()
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                return ResolveWindowsCpuUsagePercent();
            }

            var output = RunTextCommand("ps", "-A", "-o", "%cpu=");
            var total = output
                .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(value => double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0.0d)
                .Sum();
            return Math.Clamp(total / Math.Max(1, Environment.ProcessorCount), 0.0d, 100.0d);
        }
        catch
        {
            return -1.0d;
        }
    }

    private static double ResolveWindowsCpuUsagePercent()
    {
        if (!NativeMethods.GetSystemTimes(out var idleTime, out var kernelTime, out var userTime))
        {
            return -1.0d;
        }

        var idle = idleTime.ToUInt64();
        var kernel = kernelTime.ToUInt64();
        var user = userTime.ToUInt64();
        lock (WindowsCpuLock)
        {
            var idleDelta = idle - _previousWindowsIdle;
            var kernelDelta = kernel - _previousWindowsKernel;
            var userDelta = user - _previousWindowsUser;
            _previousWindowsIdle = idle;
            _previousWindowsKernel = kernel;
            _previousWindowsUser = user;
            var total = kernelDelta + userDelta;
            if (total == 0 || idleDelta > total)
            {
                return 0.0d;
            }
            return Math.Clamp((total - idleDelta) * 100.0d / total, 0.0d, 100.0d);
        }
    }

    private static MemorySnapshot ResolveMemory()
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                var status = new NativeMethods.MemoryStatusEx
                {
                    dwLength = (uint)Marshal.SizeOf<NativeMethods.MemoryStatusEx>()
                };
                if (!NativeMethods.GlobalMemoryStatusEx(ref status))
                {
                    return MemorySnapshot.Unavailable;
                }
                var totalBytes = status.ullTotalPhys > long.MaxValue ? long.MaxValue : (long)status.ullTotalPhys;
                var availableBytes = status.ullAvailPhys > long.MaxValue ? long.MaxValue : (long)status.ullAvailPhys;
                return MemorySnapshot.FromBytes(totalBytes, availableBytes);
            }

            if (OperatingSystem.IsLinux())
            {
                var values = File.ReadLines("/proc/meminfo")
                    .Select(line => line.Split(':', 2))
                    .Where(parts => parts.Length == 2)
                    .ToDictionary(
                        parts => parts[0],
                        parts => ParseLeadingLong(parts[1]) * 1024L,
                        StringComparer.Ordinal
                    );
                var total = values.GetValueOrDefault("MemTotal", -1);
                var available = values.GetValueOrDefault("MemAvailable", values.GetValueOrDefault("MemFree", -1));
                return MemorySnapshot.FromBytes(total, available);
            }

            if (OperatingSystem.IsMacOS())
            {
                var total = ParseLeadingLong(RunTextCommand("sysctl", "-n", "hw.memsize"));
                var vmStat = RunTextCommand("vm_stat");
                return MemorySnapshot.FromBytes(total, ResolveMacAvailableBytes(vmStat));
            }
        }
        catch
        {
            return MemorySnapshot.Unavailable;
        }

        return MemorySnapshot.Unavailable;
    }

    private static long ResolveMacAvailableBytes(string vmStat)
    {
        var pageSize = 4096L;
        var availablePages = 0L;
        foreach (var line in vmStat.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (line.Contains("page size of", StringComparison.OrdinalIgnoreCase))
            {
                var marker = line.IndexOf("page size of", StringComparison.OrdinalIgnoreCase);
                pageSize = ParseLeadingLong(line[(marker + "page size of".Length)..]);
                continue;
            }

            var parts = line.Split(':', 2);
            if (parts.Length != 2)
            {
                continue;
            }
            if (parts[0] is "Pages free" or "Pages inactive" or "Pages speculative" or "Pages purgeable")
            {
                availablePages += ParseLeadingLong(parts[1]);
            }
        }
        return availablePages * Math.Max(1, pageSize);
    }

    private static long ParseLeadingLong(string value)
    {
        var digits = new string(value.Trim().TakeWhile(char.IsDigit).ToArray());
        return long.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : -1;
    }

    private static string RunTextCommand(string fileName, params string[] arguments)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo(fileName)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };
        foreach (var argument in arguments)
        {
            process.StartInfo.ArgumentList.Add(argument);
        }
        process.Start();
        var output = process.StandardOutput.ReadToEnd();
        if (!process.WaitForExit(2000))
        {
            process.Kill(entireProcessTree: true);
            return string.Empty;
        }
        return process.ExitCode == 0 ? output : string.Empty;
    }

    private readonly record struct MemorySnapshot(long UsedMb, long TotalMb, long AvailableMb, double UsagePercent)
    {
        public static MemorySnapshot Unavailable => new(-1, -1, -1, -1.0d);

        public static MemorySnapshot FromBytes(long totalBytes, long availableBytes)
        {
            if (totalBytes <= 0 || availableBytes < 0)
            {
                return Unavailable;
            }
            var boundedAvailable = Math.Min(totalBytes, availableBytes);
            var usedBytes = totalBytes - boundedAvailable;
            const long bytesPerMb = 1024L * 1024L;
            return new(
                usedBytes / bytesPerMb,
                totalBytes / bytesPerMb,
                boundedAvailable / bytesPerMb,
                usedBytes * 100.0d / totalBytes
            );
        }
    }

    private static class NativeMethods
    {
        public const int SigTerm = 15;

        [DllImport("libc", SetLastError = true)]
        public static extern int kill(int pid, int sig);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx lpBuffer);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetSystemTimes(out FileTime idleTime, out FileTime kernelTime, out FileTime userTime);

        [StructLayout(LayoutKind.Sequential)]
        public struct FileTime
        {
            public uint Low;
            public uint High;

            public readonly ulong ToUInt64() => ((ulong)High << 32) | Low;
        }

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

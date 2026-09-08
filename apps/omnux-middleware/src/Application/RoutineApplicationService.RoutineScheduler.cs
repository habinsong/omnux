namespace Omnux.Middleware;

public sealed partial class RoutineApplicationService
{
    private readonly HashSet<string> _queuedRoutineIds = new(StringComparer.OrdinalIgnoreCase);

    private async Task RoutineSchedulerLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            QueueDueRoutineRuns(cancellationToken);
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(20), cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    internal IReadOnlyList<Task> QueueDueRoutineRuns(CancellationToken cancellationToken)
    {
        var dueIds = _routineRegistry.ReadAll(routines =>
        {
            var now = DateTimeOffset.UtcNow;
            return routines
                .Where(routine => routine.Enabled && !routine.Running && routine.NextRunUtc <= now)
                .Where(routine => _queuedRoutineIds.Add(routine.Id))
                .Select(routine => routine.Id)
                .ToArray();
        });
        return dueIds.Select(id => Task.Run(async () =>
        {
            var entered = false;
            try
            {
                await _routineSchedulerDispatchGate.WaitAsync(cancellationToken).ConfigureAwait(false);
                entered = true;
                cancellationToken.ThrowIfCancellationRequested();
                // 대기 중 예약이 꺼지거나 변경될 수 있으므로 실행 진입에서 다시 확인한다.
                var dispatchedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                var result = await RunRoutineNowAsync(id, "scheduler", cancellationToken).ConfigureAwait(false);
                if (!result.Ok && result.Routine?.Runs.FirstOrDefault()?.Ts >= dispatchedAt)
                {
                    _routineSchedulerLastError = $"scheduler run failed ({id}): {result.Message}";
                    Console.Error.WriteLine($"[routine] {_routineSchedulerLastError}");
                }
                else
                {
                    _routineSchedulerLastError = null;
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
            }
            catch (Exception ex)
            {
                _routineSchedulerLastError = $"scheduler run failed ({id}): {ex.Message}";
                Console.Error.WriteLine($"[routine] {_routineSchedulerLastError}");
            }
            finally
            {
                if (entered) _routineSchedulerDispatchGate.Release();
                lock (_routineRegistry.SyncRoot) _queuedRoutineIds.Remove(id);
            }
        }, CancellationToken.None)).ToArray();
    }
}

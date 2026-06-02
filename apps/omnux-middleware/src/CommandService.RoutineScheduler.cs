namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task RoutineSchedulerLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var dueIds = _routineRegistry.ReadAll(routines =>
            {
                var now = DateTimeOffset.UtcNow;
                return routines
                    .Where(x => x.Enabled && !x.Running && x.NextRunUtc <= now)
                    .Select(x => x.Id)
                    .ToList();
            });

            foreach (var id in dueIds)
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _routineSchedulerDispatchGate.WaitAsync(CancellationToken.None).ConfigureAwait(false);
                        var result = await RunRoutineNowAsync(id, "scheduler", CancellationToken.None);
                        if (!result.Ok)
                        {
                            _routineSchedulerLastError = $"scheduler run skipped ({id}): {result.Message}";
                            Console.Error.WriteLine($"[routine] {_routineSchedulerLastError}");
                        }
                        else
                        {
                            _routineSchedulerLastError = null;
                        }
                    }
                    catch (Exception ex)
                    {
                        _routineSchedulerLastError = $"scheduler run failed ({id}): {ex.Message}";
                        Console.Error.WriteLine($"[routine] {_routineSchedulerLastError}");
                    }
                    finally
                    {
                        try
                        {
                            _routineSchedulerDispatchGate.Release();
                        }
                        catch
                        {
                        }
                    }
                }, CancellationToken.None);
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(20), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    internal IRoutineLogicGraphRunner CreateRoutineLogicGraphRunner()
    {
        return new RoutineLogicGraphRunnerAdapter(this);
    }

    private sealed class RoutineLogicGraphRunnerAdapter : IRoutineLogicGraphRunner
    {
        private CommandService Owner { get; }

        public RoutineLogicGraphRunnerAdapter(CommandService owner)
        {
            Owner = owner;
        }

        Task<LogicRunSnapshot> IRoutineLogicGraphRunner.ExecuteLogicGraphRunCoreAsync(
            string graphId,
            string runId,
            string source,
            string runInput,
            Action<LogicRunEvent>? eventCallback,
            CancellationToken cancellationToken
        )
        {
            return Owner.ExecuteLogicGraphRunCoreAsync(
                graphId,
                runId,
                source,
                runInput,
                eventCallback,
                cancellationToken
            );
        }
    }
}

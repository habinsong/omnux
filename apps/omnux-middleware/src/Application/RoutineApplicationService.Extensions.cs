namespace Omnux.Middleware;

/// <summary>
/// 자동화 실행과 확장 훅의 연결부. 게이트를 만들어 넘기는 일만 한다.
/// 훅 판정·실행·저장 로직은 Application/Extensions 의 타입에 있으며 여기로 옮기지 않는다.
/// </summary>
public sealed partial class RoutineApplicationService
{
    private static readonly object RoutineHookGateLock = new();
    private static IRoutineHookGate? _routineHookGate;

    /// <summary>
    /// 자동화용 훅 게이트. 확장 설정을 읽지 못하면 훅 없이 진행한다.
    /// 확장 계층 오류로 예약 실행 전체를 멈추지 않기 위한 경계다.
    /// </summary>
    private static IRoutineHookGate ResolveRoutineHookGate()
    {
        lock (RoutineHookGateLock)
        {
            if (_routineHookGate != null)
            {
                return _routineHookGate;
            }

            try
            {
                _routineHookGate = new ExtensionRoutineHookGate(
                    new HookDispatcher(SharedExtensionServices.Service),
                    SharedExtensionServices.Approvals
                );
            }
            catch (Exception)
            {
                _routineHookGate = NullRoutineHookGate.Instance;
            }

            return _routineHookGate;
        }
    }
}

namespace Omnux.Middleware;

public sealed record CodingInteractiveRunPlan(
    bool Ok,
    string Message,
    string Command,
    string WorkingDirectory,
    string Language,
    string Provider,
    string Model,
    string PreviewUrl,
    bool Gui,
    IReadOnlyDictionary<string, string> Environment
);

public sealed partial class CodingApplicationService
{
    /// <summary>
    /// "실행" 버튼이 실제로 프로그램을 띄우기 위해 필요한 모든 것을 한 번에 계산한다.
    /// 의존성 설치는 여기서 먼저 끝내고, 프로그램 자체는 호출측이 PTY 세션으로 띄운다.
    /// HTML 결과물은 실행 대신 브라우저 프리뷰 URL 을 돌려준다.
    /// </summary>
    public async Task<CodingInteractiveRunPlan> BuildInteractiveRunPlanAsync(
        string conversationId,
        string? preferredTarget,
        CancellationToken cancellationToken
    )
    {
        var normalizedConversationId = (conversationId ?? string.Empty).Trim();
        if (normalizedConversationId.Length == 0)
        {
            return Failed("conversationId가 필요합니다.");
        }

        var conversation = _conversationStore.Get(normalizedConversationId);
        if (conversation == null)
        {
            return Failed("대화를 찾을 수 없습니다.");
        }

        var latest = conversation.LatestCodingResult;
        if (latest == null)
        {
            return Failed("최근 코딩 결과가 없습니다.");
        }

        var target = ResolveLatestCodingExecutionTarget(latest, preferredTarget);
        if (target == null)
        {
            return Failed("실행할 대상 파일이나 명령을 찾지 못했습니다.");
        }

        if (!IsDynamicCodeExecutionEnabled())
        {
            return Failed(BuildDynamicCodeDisabledMessage());
        }

        var normalizedLanguage = CodingLanguagePolicy.NormalizeLanguageForCode(target.Language);
        if (string.Equals(normalizedLanguage, "html", StringComparison.OrdinalIgnoreCase))
        {
            var previewEntry = ResolveHtmlPreviewEntryPath(target.Execution, target.ChangedFiles, target.RunDirectory);
            if (string.IsNullOrWhiteSpace(previewEntry))
            {
                return Failed("브라우저로 열 HTML 진입 파일을 찾지 못했습니다.");
            }

            return new CodingInteractiveRunPlan(
                true,
                "브라우저 프리뷰를 준비했습니다.",
                string.Empty,
                target.RunDirectory,
                normalizedLanguage,
                target.Provider,
                target.Model,
                BuildCodingPreviewUrl(normalizedConversationId, target.TargetSegment, previewEntry),
                false,
                new Dictionary<string, string>(StringComparer.Ordinal)
            );
        }

        var commandPlan = ResolveLatestCodingExecutionCommandPlan(target);
        if (string.IsNullOrWhiteSpace(commandPlan.ActualCommand))
        {
            return Failed("실행할 명령을 구성하지 못했습니다.");
        }

        if (CodingExecutionSafetyPolicy.IsDangerousGeneratedRunCommand(commandPlan.ActualCommand))
        {
            return Failed("안전하지 않은 실행 명령이라 실행하지 않았습니다.");
        }

        // 실행 직전에 의존성을 맞춰 둔다. 사용자가 pip/npm 을 직접 칠 일이 없어야 한다.
        var installLog = await PrepareInteractiveRunDependenciesAsync(
            commandPlan.ActualCommand,
            target.RunDirectory,
            cancellationToken
        ).ConfigureAwait(false);

        var signals = CodingTaskSignalResolver.TryGet(latest.Summary) ?? CodingTaskSignalResolver.TryGet(target.Execution.Command);
        var gui = signals?.Gui ?? false;
        var environment = BuildInteractiveRunEnvironment(gui);

        var message = installLog.Length == 0
            ? "실행을 준비했습니다."
            : $"의존성을 준비했습니다.\n{installLog}";
        return new CodingInteractiveRunPlan(
            true,
            message,
            commandPlan.ActualCommand,
            target.RunDirectory,
            normalizedLanguage,
            target.Provider,
            target.Model,
            string.Empty,
            gui,
            environment
        );
    }

    /// <summary>
    /// 실제 실행용 환경변수. 헤드리스 스모크 테스트에서만 쓰는 더미 드라이버가 새어 들어오면
    /// 창이 안 떠서 "게임이 실행 안 된다"가 된다. 여기서는 반드시 지운다.
    /// </summary>
    private static Dictionary<string, string> BuildInteractiveRunEnvironment(bool gui)
    {
        var environment = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["SDL_VIDEODRIVER"] = string.Empty,
            ["OMNI_HEADLESS_TEST"] = string.Empty,
            ["PYTHONUNBUFFERED"] = "1"
        };
        if (!gui)
        {
            return environment;
        }

        // GUI 프로그램은 사용자 데스크탑 세션의 디스플레이를 그대로 물려받아야 창이 뜬다.
        foreach (var name in new[] { "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS" })
        {
            var value = Environment.GetEnvironmentVariable(name);
            if (!string.IsNullOrWhiteSpace(value))
            {
                environment[name] = value;
            }
        }

        return environment;
    }

    private async Task<string> PrepareInteractiveRunDependenciesAsync(
        string command,
        string workDir,
        CancellationToken cancellationToken
    )
    {
        if (!_execution.EnableAutoInstall)
        {
            return string.Empty;
        }

        var logs = new List<string>();
        var errors = new List<string>();
        try
        {
            await EnsureWorkspaceDependenciesAsync(command, workDir, logs, errors, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            errors.Add(ex.Message);
        }

        var lines = logs.Concat(errors).Where(line => !string.IsNullOrWhiteSpace(line)).ToArray();
        return lines.Length == 0 ? string.Empty : string.Join("\n", lines);
    }

    private static CodingInteractiveRunPlan Failed(string message)
    {
        return new CodingInteractiveRunPlan(
            false,
            message,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            false,
            new Dictionary<string, string>(StringComparer.Ordinal)
        );
    }
}

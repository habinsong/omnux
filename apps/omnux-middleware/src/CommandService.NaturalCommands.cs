namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleNaturalCommandByLlmAsync(
        string source,
        string text,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        CancellationToken cancellationToken
    )
    {
        var normalized = (text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized) || normalized.StartsWith("/", StringComparison.Ordinal))
        {
            return null;
        }

        if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase)
            && !source.Equals("web", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!NaturalCommandValidationPolicy.ShouldAttemptNaturalCommandInterpretation(normalized))
        {
            return null;
        }

        if (NaturalCommandValidationPolicy.LooksLikeNaturalKillIntent(normalized))
        {
            return "보안 정책상 자연어 종료 요청은 허용되지 않습니다. /kill <pid> 형식으로만 실행할 수 있습니다.";
        }

        // 복합 토글 fast-path: "추론모드와 스킬 꺼" 같이 한 문장에 두 개 이상의 토글 대상이
        // 들어 있으면 각각의 슬래시 명령을 순차 실행하고 결과를 모은다.
        var compoundCommands = NaturalCommandDeterministicPolicy.TryResolveCompoundOffToggle(normalized);
        if (compoundCommands != null && compoundCommands.Count > 0)
        {
            return await ExecuteNaturalCompoundCommandsAsync(
                source,
                compoundCommands,
                cancellationToken,
                attachments,
                webUrls,
                webSearchEnabled
            );
        }

        // LLM 해석기 우회 fast-path: 스킬 별명 등록/제거/목록·think/web/history 같은
        // 한정된 한국어 패턴은 regex 로 즉시 슬래시 명령으로 변환해 안정성 확보.
        var deterministic = NaturalCommandDeterministicPolicy.TryResolveDeterministicNaturalCommand(normalized);
        if (!string.IsNullOrWhiteSpace(deterministic))
        {
            return await ExecuteNaturalDeterministicCommandAsync(
                source,
                deterministic!,
                cancellationToken,
                attachments,
                webUrls,
                webSearchEnabled
            );
        }

        var interpretation = await ResolveNaturalCommandInterpretationAsync(source, normalized, cancellationToken);
        if (interpretation == null)
        {
            return null;
        }

        var decision = NaturalCommandDispatchPolicy.Resolve(source, interpretation, normalized);
        if (decision.IsChat)
        {
            return null;
        }

        if (!decision.ShouldExecute)
        {
            if (decision.Code == "natural_kill_disallowed")
            {
                return decision.Message;
            }

            return null;
        }

        return await ExecuteNaturalResolvedCommandAsync(
            source,
            decision.SlashCommand!,
            interpretation,
            cancellationToken,
            attachments,
            webUrls,
            webSearchEnabled
        );
    }

    private async Task<NaturalCommandInterpretation?> ResolveNaturalCommandInterpretationAsync(
        string source,
        string input,
        CancellationToken cancellationToken
    )
    {
        var candidates = await BuildNaturalInterpretCandidatesAsync(source, input, cancellationToken);
        var prompt = NaturalCommandCandidatePolicy.BuildNaturalCommandResolverPrompt(input);
        return await NaturalCommandResolutionPolicy.ResolveAsync(
            candidates,
            prompt,
            async (candidate, resolverPrompt, token) =>
            {
                var generated = await GenerateByProviderSafeAsync(
                    candidate.Provider,
                    candidate.Model,
                    resolverPrompt,
                    token,
                    NaturalCommandResolutionPolicy.DefaultInterpretMaxTokens,
                    useRawCodexPrompt: true
                );
                return generated.Text;
            },
            cancellationToken,
            NaturalCommandResolutionPolicy.DefaultMinConfidence
        );
    }

    private async Task<IReadOnlyList<NaturalCommandInterpretCandidate>> BuildNaturalInterpretCandidatesAsync(
        string source,
        string input,
        CancellationToken cancellationToken
    )
    {
        var availabilityByProvider = await GetProviderAvailabilityMapAsync(cancellationToken);
        NaturalCommandLlmPreferenceSnapshot snapshot;
        if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            lock (_telegramLlmLock)
            {
                snapshot = NaturalCommandCandidatePolicy.FromTelegramPreferences(_telegramLlmPreferences.Clone());
            }
        }
        else
        {
            lock (_webLlmLock)
            {
                snapshot = NaturalCommandCandidatePolicy.FromWebPreferences(_webLlmPreferences.Clone());
            }
        }

        return NaturalCommandCandidatePolicy.BuildNaturalInterpretCandidates(
            availabilityByProvider,
            snapshot,
            input,
            NormalizeProvider,
            NormalizeModelSelection,
            ResolveGroqModelForInput,
            ResolveModel
        );
    }

}

namespace Omnux.Middleware;

internal sealed record NaturalCommandLlmPreferenceSnapshot(
    string Mode,
    string SingleProvider,
    string SingleModel,
    string OrchestrationProvider,
    string OrchestrationModel,
    string MultiSummaryProvider,
    string MultiGroqModel,
    string MultiGeminiModel,
    string MultiCopilotModel,
    string MultiCerebrasModel,
    string MultiNvidiaModel,
    string MultiCodexModel
);

internal sealed record NaturalCommandInterpretCandidate(string Provider, string Model);

internal static class NaturalCommandCandidatePolicy
{
    private static readonly string[] FallbackProviders =
    {
        "gemini",
        "groq",
        "nvidia",
        "codex",
        "copilot",
        "cerebras"
    };

    public static NaturalCommandLlmPreferenceSnapshot FromTelegramPreferences(TelegramLlmPreferences preferences)
    {
        return new NaturalCommandLlmPreferenceSnapshot(
            preferences.Mode,
            preferences.SingleProvider,
            preferences.SingleModel,
            preferences.OrchestrationProvider,
            preferences.OrchestrationModel,
            preferences.MultiSummaryProvider,
            preferences.MultiGroqModel,
            preferences.MultiGeminiModel,
            preferences.MultiCopilotModel,
            preferences.MultiCerebrasModel,
            preferences.MultiNvidiaModel,
            preferences.MultiCodexModel
        );
    }

    public static NaturalCommandLlmPreferenceSnapshot FromWebPreferences(WebLlmPreferences preferences)
    {
        return new NaturalCommandLlmPreferenceSnapshot(
            preferences.Mode,
            preferences.SingleProvider,
            preferences.SingleModel,
            preferences.OrchestrationProvider,
            preferences.OrchestrationModel,
            preferences.MultiSummaryProvider,
            preferences.MultiGroqModel,
            preferences.MultiGeminiModel,
            preferences.MultiCopilotModel,
            preferences.MultiCerebrasModel,
            preferences.MultiNvidiaModel,
            preferences.MultiCodexModel
        );
    }

    public static IReadOnlyList<NaturalCommandInterpretCandidate> BuildNaturalInterpretCandidates(
        IReadOnlyDictionary<string, ProviderAvailability> availabilityByProvider,
        NaturalCommandLlmPreferenceSnapshot preferences,
        string input,
        Func<string?, bool, string> normalizeProvider,
        Func<string?, string?> normalizeModelSelection,
        Func<string, string?, string> resolveGroqModelForInput,
        Func<string, string?, string> resolveModel
    )
    {
        var normalizedMode = (preferences.Mode ?? string.Empty).Trim().ToLowerInvariant();
        var preferredProviders = BuildPreferredProviders(preferences, normalizedMode, normalizeProvider);
        var candidates = new List<NaturalCommandInterpretCandidate>();

        foreach (var provider in preferredProviders)
        {
            if (!availabilityByProvider.TryGetValue(provider, out var availability) || !availability.Available)
            {
                continue;
            }

            var model = ResolveNaturalInterpretModelForProvider(
                provider,
                normalizedMode,
                preferences,
                input,
                normalizeProvider,
                normalizeModelSelection,
                resolveGroqModelForInput,
                resolveModel
            );
            if (!string.IsNullOrWhiteSpace(model))
            {
                candidates.Add(new NaturalCommandInterpretCandidate(provider, model));
            }
        }

        return candidates.Take(3).ToArray();
    }

    public static string BuildNaturalCommandResolverPrompt(string input)
    {
        var user = (input ?? string.Empty).Trim();
        return """
               당신은 omnux 명령 해석기입니다.
               반드시 JSON 객체 하나만 출력하세요. 코드블록/설명/주석 금지.

               스키마:
               {
                 "kind": "command|chat",
                 "command": "mode.set|provider.set|model.set|profile.set|memory.clear|memory.create|doctor.run|plan.list|plan.get|plan.create|plan.review|plan.approve|plan.run|task.list|task.create|task.status|task.run|task.cancel|task.output|notebook.show|notebook.append|handoff.create|routine.list|routine.create|routine.update|routine.run|routine.runs|routine.detail|routine.resend|routine.on|routine.off|routine.delete|coding.status|coding.run|coding.result|coding.files|coding.file|coding.download|coding.mode.set|coding.language.set|coding.provider.set|coding.model.set|coding.worker.set|refactor.status|refactor.read|refactor.apply|metrics.get|llm.status|llm.usage|llm.models|help.show|kill.request|skill.list|skill.status|skill.use|skill.off|skill.get|skill.quick.add|skill.quick.list|skill.quick.remove|think.on|think.off|think.status|web.on|web.off|web.status|history.show",
                 "args": {"k":"v"},
                 "confidence": 0.0,
                 "reason": "짧은 근거"
               }

               규칙:
               - 설정/제어 의도가 명확하면 kind=command.
               - 일반 질문/대화면 kind=chat.
               - pid 종료 의도는 command=kill.request 로만 표기.
               - args는 문자열 값만 사용.
               - profile.set args: profile=talk|code, thinking=low|high(선택)
               - mode.set args: mode=single|orchestration|multi
               - provider.set args: slot=single|orchestration|summary, provider=groq|gemini|copilot|cerebras|nvidia|codex|auto
               - model.set args: slot=single|orchestration|multi.groq|multi.gemini|multi.copilot|multi.cerebras|multi.nvidia|multi.codex, model=<id>
               - memory.create args: compact=true|false(선택)
               - doctor.run args: latest=true|false(선택), format=text|json(선택)
               - plan.get/review/approve/run args: plan_id=<id>
               - plan.create args: request=<원문>
               - task.create args: plan_id=<id>
               - task.status/run args: graph_id=<id>
               - task.cancel/output args: graph_id=<id>, task_id=<id>
               - notebook.show args: project_key=<선택>
               - notebook.append args: kind=learning|decision|verification, content=<내용>
               - handoff.create args: project_key=<선택>
               - help.show args: topic=llm|routine|coding|refactor|doctor|plan|task|notebook|memory|natural (선택)
               - llm.models args: target=all|groq|gemini|copilot|cerebras|nvidia|codex(선택)
               - routine.create args: request=<원문>
               - routine.update args: routine_id=<id>, request=<원문>
               - routine.run/runs/on/off/delete args: routine_id=<id>
               - routine.detail/resend args: routine_id=<id>, ts=<실행시각 숫자>
               - coding.status/result/files args 없음
               - coding.file args: query=<번호 또는 경로>
               - coding.run args: mode=single|orchestration|multi(선택), request=<요구사항>
               - coding.mode.set args: mode=single|orchestration|multi
               - coding.language.set args: mode=single|orchestration|multi(선택), language=<language|auto>
               - coding.provider.set args: mode=single|orchestration|multi, provider=auto|groq|gemini|copilot|cerebras|nvidia|codex
               - coding.model.set args: mode=single|orchestration|multi, model=<id>
               - coding.worker.set args: mode=orchestration|multi, provider=groq|gemini|copilot|cerebras|nvidia|codex, model=<id|none>
               - refactor.status args 없음
               - refactor.read args: path=<상대경로 또는 절대경로>, start=<선택>, end=<선택>
               - refactor.apply args: preview_id=<선택>
               - coding.download args: query=<번호 또는 경로>
               - skill.list / skill.status / skill.off args 없음
               - skill.use args: name=<스킬이름>, scope=project|global(선택)
               - skill.get args: name=<스킬이름>, scope=project|global(선택)
               - skill.quick.add args: alias=<별명>, name=<스킬이름>
               - skill.quick.list args 없음
               - skill.quick.remove args: alias=<별명>
               - think.on / think.off / think.status / web.on / web.off / web.status args 없음
               - history.show args: count=<숫자, 1~20, 선택, 기본 5>
               - "추론 모드/Think+/웹검색 모드/웹 컨텍스트" 토글 요청은 think.* / web.* 명령으로 매핑.
               - "최근 대화/히스토리/지난 대화 N개 보여줘"는 history.show 로 매핑.
               - "<X> 스킬 별명/단축으로 등록/지정해줘" → skill.quick.add 로 매핑 (alias=<별명>, name=<X>).
                 예시:
                   "casual-chat 스킬을 c 라는 별명으로 등록해줘" → command=skill.quick.add, args={alias:"c", name:"casual-chat"}
                   "eli5 단축키 e로 만들어" → command=skill.quick.add, args={alias:"e", name:"eli5"}
                   "review 스킬 alias r 추가" → command=skill.quick.add, args={alias:"r", name:"review"}
                   "별명 c로 casual-chat 스킬 등록" → command=skill.quick.add, args={alias:"c", name:"casual-chat"}
               - "스킬 별명/단축 목록 보여줘" → skill.quick.list.
               - "스킬 별명/단축 <X> 지워/삭제/제거" → skill.quick.remove (alias=<X>).
                 예시: "별명 e 지워" → command=skill.quick.remove, args={alias:"e"}
               - "스킬 상태/현재 스킬/활성 스킬" → skill.status.
               - "스킬 종료/해제/그만/꺼" → skill.off.
               - "<X> 스킬 사용/적용/켜" 형식이면 skill.use(name=X). 만약 추가 지시문(예: "사용해서 …설명해줘")이 함께 있으면 kind=chat 으로 두어 LLM 본흐름이 직접 처리하게 한다.
               - "코딩 파일 <N>번 다운/내려/첨부" → coding.download(query=N). "/coding files" 시각화 요청은 coding.files.
               - confidence는 0~1

               사용자 입력:
               """
               + user;
    }

    private static IReadOnlyList<string> BuildPreferredProviders(
        NaturalCommandLlmPreferenceSnapshot preferences,
        string normalizedMode,
        Func<string?, bool, string> normalizeProvider
    )
    {
        var preferredProviders = new List<string>();
        if (normalizedMode == "orchestration")
        {
            var provider = normalizeProvider(preferences.OrchestrationProvider, true);
            if (provider is "auto" or "none")
            {
                provider = "gemini";
            }
            preferredProviders.Add(provider);
        }
        else if (normalizedMode == "multi")
        {
            var provider = normalizeProvider(preferences.MultiSummaryProvider, true);
            if (provider is "auto" or "none")
            {
                provider = "gemini";
            }
            preferredProviders.Add(provider);
        }
        else
        {
            var single = normalizeProvider(preferences.SingleProvider, true);
            if (single is "auto" or "none")
            {
                single = "gemini";
            }
            preferredProviders.Add(single);
        }

        foreach (var provider in FallbackProviders)
        {
            if (!preferredProviders.Contains(provider, StringComparer.OrdinalIgnoreCase))
            {
                preferredProviders.Add(provider);
            }
        }

        return preferredProviders;
    }

    private static string ResolveNaturalInterpretModelForProvider(
        string provider,
        string normalizedMode,
        NaturalCommandLlmPreferenceSnapshot preferences,
        string input,
        Func<string?, bool, string> normalizeProvider,
        Func<string?, string?> normalizeModelSelection,
        Func<string, string?, string> resolveGroqModelForInput,
        Func<string, string?, string> resolveModel
    )
    {
        if (provider == "groq")
        {
            if (normalizedMode == "multi")
            {
                return normalizeModelSelection(preferences.MultiGroqModel)
                       ?? resolveGroqModelForInput(input, null);
            }

            if (normalizedMode == "orchestration"
                && normalizeProvider(preferences.OrchestrationProvider, true) == "groq")
            {
                return resolveGroqModelForInput(input, preferences.OrchestrationModel);
            }

            if (normalizeProvider(preferences.SingleProvider, true) == "groq")
            {
                return resolveGroqModelForInput(input, preferences.SingleModel);
            }

            return resolveGroqModelForInput(input, null);
        }

        if (normalizedMode == "multi")
        {
            return provider switch
            {
                "gemini" => resolveModel("gemini", preferences.MultiGeminiModel),
                "copilot" => resolveModel("copilot", preferences.MultiCopilotModel),
                "cerebras" => resolveModel("cerebras", preferences.MultiCerebrasModel),
                "nvidia" => resolveModel("nvidia", preferences.MultiNvidiaModel),
                "codex" => resolveModel("codex", preferences.MultiCodexModel),
                _ => resolveModel(provider, null)
            };
        }

        if (normalizedMode == "orchestration"
            && normalizeProvider(preferences.OrchestrationProvider, true) == provider)
        {
            return resolveModel(provider, preferences.OrchestrationModel);
        }

        if (normalizeProvider(preferences.SingleProvider, true) == provider)
        {
            return resolveModel(provider, preferences.SingleModel);
        }

        return resolveModel(provider, null);
    }
}

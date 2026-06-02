using System.Globalization;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal static class NaturalCommandValidationPolicy
{
    private const double NaturalCommandMinConfidence = 0.72d;

    public static NaturalCommandValidationResult ValidateNaturalCommandInterpretation(
        string source,
        NaturalCommandInterpretation interpretation,
        string rawInput
    )
    {
        if (interpretation == null)
        {
            return new NaturalCommandValidationResult(false, true, null, "empty", "empty interpretation");
        }

        if (interpretation.Kind == "chat")
        {
            return new NaturalCommandValidationResult(false, true, null, "chat", "chat intent");
        }

        if (interpretation.Confidence < NaturalCommandMinConfidence)
        {
            return new NaturalCommandValidationResult(false, false, null, "low_confidence", "confidence too low");
        }

        var command = NormalizeNaturalCommandKey(interpretation.Command);
        var args = interpretation.Args ?? new Dictionary<string, string>();

        if (command.StartsWith("routine.", StringComparison.Ordinal)
            && !ContainsExplicitRoutineKeyword(rawInput))
        {
            return new NaturalCommandValidationResult(false, false, null, "routine_keyword_required", "루틴 키워드가 필요합니다.");
        }

        string GetArg(params string[] keys)
        {
            foreach (var key in keys)
            {
                if (args.TryGetValue(key, out var found) && !string.IsNullOrWhiteSpace(found))
                {
                    return found.Trim();
                }
            }

            return string.Empty;
        }

        switch (command)
        {
            case "profile.set":
            {
                if (!ContainsExplicitProfileControlIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "profile_keyword_required", "프로필 키워드가 필요합니다.");
                }

                var profile = GetArg("profile", "name", "value").ToLowerInvariant();
                if (profile is not ("talk" or "code"))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_profile", "invalid profile");
                }

                var thinking = GetArg("thinking", "level").ToLowerInvariant();
                if (thinking is "low" or "high")
                {
                    return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/profile {profile} {thinking}"), "ok", string.Empty);
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/profile {profile}"), "ok", string.Empty);
            }
            case "mode.set":
            {
                if (!ContainsExplicitModeControlIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "mode_keyword_required", "모드 변경 키워드가 필요합니다.");
                }

                var mode = GetArg("mode", "value").ToLowerInvariant();
                if (mode is not ("single" or "orchestration" or "multi"))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_mode", "invalid mode");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/mode {mode}"), "ok", string.Empty);
            }
            case "provider.set":
            {
                var slot = GetArg("slot", "target").ToLowerInvariant();
                var provider = GetArg("provider", "value").ToLowerInvariant();
                if (!ContainsExplicitProviderControlIntent(rawInput, slot))
                {
                    return new NaturalCommandValidationResult(false, false, null, "provider_keyword_required", "제공자 변경 키워드가 필요합니다.");
                }

                if (slot is not ("single" or "orchestration" or "summary"))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_provider_slot", "invalid provider slot");
                }

                if (provider is not ("groq" or "gemini" or "copilot" or "cerebras" or "nvidia" or "codex" or "auto"))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_provider", "invalid provider");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/provider {slot} {provider}"), "ok", string.Empty);
            }
            case "model.set":
            {
                if (!ContainsExplicitModelControlIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "model_keyword_required", "모델 변경 키워드가 필요합니다.");
                }

                var slot = GetArg("slot", "target").ToLowerInvariant();
                var model = GetArg("model", "value");
                if (slot is not ("single" or "orchestration" or "multi.groq" or "multi.gemini" or "multi.copilot" or "multi.cerebras" or "multi.nvidia" or "multi.codex"))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_model_slot", "invalid model slot");
                }

                if (string.IsNullOrWhiteSpace(model))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_model", "model is required");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/model {slot} {model}"), "ok", string.Empty);
            }
            case "memory.clear":
                if (!ContainsExplicitMemoryKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "memory_keyword_required", "메모리 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/memory clear"), "ok", string.Empty);
            case "memory.create":
            {
                if (!ContainsExplicitMemoryKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "memory_keyword_required", "메모리 키워드가 필요합니다.");
                }

                var compact = GetArg("compact", "mode", "style").ToLowerInvariant();
                return compact is "true" or "compact" or "yes"
                    ? new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/memory create compact"), "ok", string.Empty)
                    : new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/memory create"), "ok", string.Empty);
            }
            case "doctor.run":
            {
                if (!ContainsExplicitDoctorIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "doctor_keyword_required", "진단 키워드가 필요합니다.");
                }

                var latest = GetArg("latest", "last").ToLowerInvariant();
                var format = GetArg("format", "output").ToLowerInvariant();
                var parts = new List<string> { "/doctor" };
                if (latest is "true" or "last" or "latest")
                {
                    parts.Add("last");
                }

                if (format == "json")
                {
                    parts.Add("json");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, string.Join(' ', parts)), "ok", string.Empty);
            }
            case "plan.list":
                if (!ContainsExplicitPlanKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "plan_keyword_required", "계획 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/plan list"), "ok", string.Empty);
            case "plan.get":
            case "plan.review":
            case "plan.approve":
            case "plan.run":
            {
                if (!ContainsExplicitPlanKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "plan_keyword_required", "계획 키워드가 필요합니다.");
                }

                var planId = GetArg("plan_id", "id", "value");
                if (string.IsNullOrWhiteSpace(planId))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_plan_id", "plan id is required");
                }

                var action = command.Split('.')[1];
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/plan {action} {planId}"), "ok", string.Empty);
            }
            case "plan.create":
            {
                if (!ContainsExplicitPlanKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "plan_keyword_required", "계획 키워드가 필요합니다.");
                }

                var request = GetArg("request", "objective", "text", "value");
                if (string.IsNullOrWhiteSpace(request))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_request", "plan request is required");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/plan create {request}"), "ok", string.Empty);
            }
            case "task.list":
                if (!ContainsExplicitTaskKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "task_keyword_required", "작업 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/task list"), "ok", string.Empty);
            case "task.create":
            {
                if (!ContainsExplicitTaskKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "task_keyword_required", "작업 키워드가 필요합니다.");
                }

                var planId = GetArg("plan_id", "id", "value");
                if (string.IsNullOrWhiteSpace(planId))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_plan_id", "plan id is required");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/task create {planId}"), "ok", string.Empty);
            }
            case "task.status":
            case "task.run":
            {
                if (!ContainsExplicitTaskKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "task_keyword_required", "작업 키워드가 필요합니다.");
                }

                var graphId = GetArg("graph_id", "id", "value");
                if (string.IsNullOrWhiteSpace(graphId))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_graph_id", "graph id is required");
                }

                var action = command == "task.status" ? "status" : "run";
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/task {action} {graphId}"), "ok", string.Empty);
            }
            case "task.cancel":
            case "task.output":
            {
                if (!ContainsExplicitTaskKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "task_keyword_required", "작업 키워드가 필요합니다.");
                }

                var graphId = GetArg("graph_id", "graph", "id");
                var taskId = GetArg("task_id", "task", "value");
                if (string.IsNullOrWhiteSpace(graphId) || string.IsNullOrWhiteSpace(taskId))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_task_target", "graph id와 task id가 필요합니다.");
                }

                var action = command == "task.cancel" ? "cancel" : "output";
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/task {action} {graphId} {taskId}"), "ok", string.Empty);
            }
            case "notebook.show":
            {
                if (!ContainsExplicitNotebookKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "notebook_keyword_required", "노트북 키워드가 필요합니다.");
                }

                var projectKey = GetArg("project_key", "project", "value");
                return string.IsNullOrWhiteSpace(projectKey)
                    ? new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/notebook show"), "ok", string.Empty)
                    : new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/notebook show {projectKey}"), "ok", string.Empty);
            }
            case "notebook.append":
            {
                if (!ContainsExplicitNotebookKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "notebook_keyword_required", "노트북 키워드가 필요합니다.");
                }

                var kind = GetArg("kind", "type").ToLowerInvariant();
                var content = GetArg("content", "text", "value");
                if (kind is not ("learning" or "decision" or "verification"))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_notebook_kind", "invalid notebook kind");
                }

                if (string.IsNullOrWhiteSpace(content))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_notebook_content", "notebook content is required");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/notebook append {kind} {content}"), "ok", string.Empty);
            }
            case "handoff.create":
            {
                if (!ContainsExplicitHandoffKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "handoff_keyword_required", "handoff 키워드가 필요합니다.");
                }

                var projectKey = GetArg("project_key", "project", "value");
                return string.IsNullOrWhiteSpace(projectKey)
                    ? new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/handoff"), "ok", string.Empty)
                    : new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/handoff {projectKey}"), "ok", string.Empty);
            }
            case "routine.list":
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/routine list"), "ok", string.Empty);
            case "routine.create":
            {
                var request = GetArg("request", "text", "value");
                if (string.IsNullOrWhiteSpace(request))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_request", "routine request is required");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/routine create {request}"), "ok", string.Empty);
            }
            case "routine.update":
            {
                var id = GetArg("routine_id", "id", "value");
                var request = GetArg("request", "text", "value");
                if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(request))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_routine_update_target", "routine id와 요청이 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/routine update {id} {request}"), "ok", string.Empty);
            }
            case "routine.run":
            case "routine.runs":
            case "routine.on":
            case "routine.off":
            case "routine.delete":
            {
                var id = GetArg("routine_id", "id", "value");
                if (string.IsNullOrWhiteSpace(id))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_routine_id", "routine id is required");
                }

                var action = command.Split('.')[1];
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/routine {action} {id}"), "ok", string.Empty);
            }
            case "routine.detail":
            case "routine.resend":
            {
                var id = GetArg("routine_id", "id", "value");
                var ts = GetArg("ts", "run_ts", "timestamp", "value");
                if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(ts))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_routine_run_target", "routine id와 ts가 필요합니다.");
                }

                if (!long.TryParse(ts, NumberStyles.Integer, CultureInfo.InvariantCulture, out _))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_routine_ts", "routine ts는 숫자여야 합니다.");
                }

                var action = command.Split('.')[1];
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/routine {action} {id} {ts}"), "ok", string.Empty);
            }
            case "coding.status":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "coding 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitCodingKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "coding_keyword_required", "코딩 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/coding status"), "ok", string.Empty);
            }
            case "coding.run":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "coding 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitCodingRunIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "coding_run_keyword_required", "코딩 실행 키워드가 필요합니다.");
                }

                var mode = NormalizeCodingNaturalMode(GetArg("mode", "target", "slot", "value"));
                var request = GetArg("request", "text", "input", "value");
                if (string.IsNullOrWhiteSpace(request) && mode != "orchestration")
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_coding_request", "코딩 요구사항이 필요합니다.");
                }

                var slash = string.IsNullOrWhiteSpace(mode)
                    ? string.IsNullOrWhiteSpace(request)
                        ? "/coding run"
                        : $"/coding run {request}"
                    : string.IsNullOrWhiteSpace(request)
                        ? $"/coding {mode} run"
                        : $"/coding {mode} run {request}";
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, slash), "ok", string.Empty);
            }
            case "coding.result":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "coding 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitCodingResultIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "coding_result_keyword_required", "최근 코딩 결과 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/coding last"), "ok", string.Empty);
            }
            case "coding.files":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "coding 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitCodingFilesIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "coding_files_keyword_required", "코딩 파일 목록 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/coding files"), "ok", string.Empty);
            }
            case "coding.file":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "coding 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitCodingFileIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "coding_file_keyword_required", "코딩 파일 키워드가 필요합니다.");
                }

                var query = GetArg("query", "path", "file", "index", "value");
                if (string.IsNullOrWhiteSpace(query))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_coding_file_query", "파일 번호나 경로가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/coding file {query}"), "ok", string.Empty);
            }
            case "coding.mode.set":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "coding 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitCodingModeControlIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "coding_mode_keyword_required", "코딩 모드 변경 키워드가 필요합니다.");
                }

                var mode = NormalizeCodingNaturalMode(GetArg("mode", "value"));
                if (string.IsNullOrWhiteSpace(mode))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_coding_mode", "invalid coding mode");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/coding mode {mode}"), "ok", string.Empty);
            }
            case "coding.language.set":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "coding 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitCodingLanguageIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "coding_language_keyword_required", "코딩 언어 변경 키워드가 필요합니다.");
                }

                var mode = NormalizeCodingNaturalMode(GetArg("mode", "target", "slot"));
                var language = GetArg("language", "value");
                if (string.IsNullOrWhiteSpace(language))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_coding_language", "language is required");
                }

                var slash = string.IsNullOrWhiteSpace(mode)
                    ? $"/coding language {language}"
                    : $"/coding language {mode} {language}";
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, slash), "ok", string.Empty);
            }
            case "coding.provider.set":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "coding 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitCodingProviderControlIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "coding_provider_keyword_required", "코딩 제공자 변경 키워드가 필요합니다.");
                }

                var mode = NormalizeCodingNaturalMode(GetArg("mode", "target", "slot", "value"));
                var provider = NormalizeProvider(GetArg("provider", "value"), allowAuto: true);
                if (string.IsNullOrWhiteSpace(mode))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_coding_mode", "invalid coding mode");
                }

                if (provider is not ("auto" or "groq" or "gemini" or "copilot" or "cerebras" or "nvidia" or "codex"))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_provider", "invalid provider");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/coding {mode} provider {provider}"), "ok", string.Empty);
            }
            case "coding.model.set":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "coding 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitCodingModelControlIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "coding_model_keyword_required", "코딩 모델 변경 키워드가 필요합니다.");
                }

                var mode = NormalizeCodingNaturalMode(GetArg("mode", "target", "slot", "value"));
                var model = GetArg("model", "value");
                if (string.IsNullOrWhiteSpace(mode))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_coding_mode", "invalid coding mode");
                }

                if (string.IsNullOrWhiteSpace(model))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_model", "model is required");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/coding {mode} model {model}"), "ok", string.Empty);
            }
            case "coding.worker.set":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "coding 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitCodingWorkerControlIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "coding_worker_keyword_required", "코딩 워커 변경 키워드가 필요합니다.");
                }

                var mode = NormalizeCodingNaturalMode(GetArg("mode", "target", "slot", "value"));
                var provider = NormalizeProvider(GetArg("provider", "value"), allowAuto: false);
                var model = GetArg("model", "value");
                if (mode is not ("orchestration" or "multi"))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_coding_worker_mode", "worker는 orchestration 또는 multi 모드만 지원합니다.");
                }

                if (provider is not ("groq" or "gemini" or "copilot" or "cerebras" or "nvidia" or "codex"))
                {
                    return new NaturalCommandValidationResult(false, false, null, "invalid_provider", "invalid provider");
                }

                if (string.IsNullOrWhiteSpace(model))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_model", "model is required");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/coding {mode} worker {provider} {model}"), "ok", string.Empty);
            }
            case "refactor.status":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "refactor 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitRefactorKeyword(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "refactor_keyword_required", "리팩터 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/refactor status"), "ok", string.Empty);
            }
            case "refactor.read":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "refactor 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitRefactorReadIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "refactor_read_keyword_required", "리팩터 읽기 키워드가 필요합니다.");
                }

                var path = GetArg("path", "file", "value");
                var start = GetArg("start", "line_start", "from");
                var end = GetArg("end", "line_end", "to");
                if (string.IsNullOrWhiteSpace(path))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_refactor_path", "path is required");
                }

                var parts = new List<string> { "/refactor", "read", path };
                if (!string.IsNullOrWhiteSpace(start))
                {
                    parts.Add(start);
                }

                if (!string.IsNullOrWhiteSpace(end))
                {
                    parts.Add(end);
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, string.Join(' ', parts)), "ok", string.Empty);
            }
            case "refactor.apply":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "refactor 제어는 현재 텔레그램에서만 자연어 명령으로 직접 지원합니다.");
                }

                if (!ContainsExplicitRefactorApplyIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "refactor_apply_keyword_required", "리팩터 적용 키워드가 필요합니다.");
                }

                var previewId = GetArg("preview_id", "preview", "id", "value");
                return string.IsNullOrWhiteSpace(previewId)
                    ? new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/refactor apply"), "ok", string.Empty)
                    : new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/refactor apply {previewId}"), "ok", string.Empty);
            }
            case "metrics.get":
                if (!ContainsExplicitMetricsIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "metrics_keyword_required", "메트릭 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/metrics"), "ok", string.Empty);
            case "llm.status":
                if (!ContainsExplicitLlmStatusIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "llm_status_keyword_required", "LLM 상태 확인 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/llm status"), "ok", string.Empty);
            case "llm.usage":
                if (!ContainsExplicitLlmUsageIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "llm_usage_keyword_required", "LLM 사용량 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/llm usage"), "ok", string.Empty);
            case "llm.models":
            {
                if (!ContainsExplicitLlmModelsIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "llm_models_keyword_required", "모델 목록 키워드가 필요합니다.");
                }

                var target = GetArg("target", "provider", "value").ToLowerInvariant();
                if (target is "groq" or "gemini" or "copilot" or "cerebras" or "codex")
                {
                    return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/llm models {target}"), "ok", string.Empty);
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/llm models"), "ok", string.Empty);
            }
            case "help.show":
            {
                if (!ContainsExplicitHelpIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "help_keyword_required", "도움말 키워드가 필요합니다.");
                }

                var topic = GetArg("topic", "value").ToLowerInvariant();
                if (string.IsNullOrWhiteSpace(topic))
                {
                    return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/help"), "ok", string.Empty);
                }

                if (topic is "llm" or "routine" or "coding" or "refactor" or "doctor" or "plan" or "task" or "notebook" or "memory" or "natural")
                {
                    return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/help {topic}"), "ok", string.Empty);
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/help"), "ok", string.Empty);
            }
            case "coding.download":
            {
                if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    return new NaturalCommandValidationResult(false, false, null, "telegram_only", "coding 다운로드는 텔레그램에서만 지원합니다.");
                }

                if (!ContainsExplicitCodingDownloadIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "coding_download_keyword_required", "다운로드 키워드가 필요합니다.");
                }

                var query = GetArg("query", "path", "file", "index", "value");
                if (string.IsNullOrWhiteSpace(query))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_coding_download_query", "파일 번호나 경로가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/coding download {query}"), "ok", string.Empty);
            }
            case "skill.list":
            {
                if (!ContainsExplicitSkillIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "skill_keyword_required", "스킬 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/skill list"), "ok", string.Empty);
            }
            case "skill.status":
            {
                if (!ContainsExplicitSkillIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "skill_keyword_required", "스킬 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/skill status"), "ok", string.Empty);
            }
            case "skill.off":
            {
                if (!ContainsExplicitSkillOffIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "skill_off_keyword_required", "스킬 종료 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/skill off"), "ok", string.Empty);
            }
            case "skill.use":
            {
                if (!ContainsExplicitSkillIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "skill_keyword_required", "스킬 키워드가 필요합니다.");
                }

                var name = GetArg("name", "skill", "value");
                if (string.IsNullOrWhiteSpace(name))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_skill_name", "스킬 이름이 필요합니다.");
                }

                var scope = GetArg("scope").ToLowerInvariant();
                var slash = scope is "project" or "global"
                    ? $"/skill use {name} {scope}"
                    : $"/skill use {name}";
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, slash), "ok", string.Empty);
            }
            case "skill.get":
            {
                if (!ContainsExplicitSkillIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "skill_keyword_required", "스킬 키워드가 필요합니다.");
                }

                var name = GetArg("name", "skill", "value");
                if (string.IsNullOrWhiteSpace(name))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_skill_name", "스킬 이름이 필요합니다.");
                }

                var scope = GetArg("scope").ToLowerInvariant();
                var slash = scope is "project" or "global"
                    ? $"/skill get {name} {scope}"
                    : $"/skill get {name}";
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, slash), "ok", string.Empty);
            }
            case "skill.quick.add":
            {
                if (!ContainsExplicitSkillIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "skill_keyword_required", "스킬 키워드가 필요합니다.");
                }

                var alias = GetArg("alias", "shortcut").TrimStart('/');
                var name = GetArg("name", "skill", "value");
                if (string.IsNullOrWhiteSpace(alias) || string.IsNullOrWhiteSpace(name))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_skill_alias_args", "alias 와 스킬 이름이 모두 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/skill quick {alias} {name}"), "ok", string.Empty);
            }
            case "skill.quick.list":
            {
                if (!ContainsExplicitSkillIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "skill_keyword_required", "스킬 키워드가 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/skill quick list"), "ok", string.Empty);
            }
            case "skill.quick.remove":
            {
                if (!ContainsExplicitSkillIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "skill_keyword_required", "스킬 키워드가 필요합니다.");
                }

                var alias = GetArg("alias", "shortcut", "value").TrimStart('/');
                if (string.IsNullOrWhiteSpace(alias))
                {
                    return new NaturalCommandValidationResult(false, false, null, "missing_skill_alias", "별명이 필요합니다.");
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/skill quick remove {alias}"), "ok", string.Empty);
            }
            case "think.on":
            case "think.off":
            case "think.status":
            {
                if (!ContainsExplicitThinkIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "think_keyword_required", "추론 모드 키워드가 필요합니다.");
                }

                var arg = command.Substring(command.IndexOf('.') + 1);
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/think {arg}"), "ok", string.Empty);
            }
            case "web.on":
            case "web.off":
            case "web.status":
            {
                if (!ContainsExplicitWebIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "web_keyword_required", "웹검색 컨텍스트 키워드가 필요합니다.");
                }

                var arg = command.Substring(command.IndexOf('.') + 1);
                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/web {arg}"), "ok", string.Empty);
            }
            case "history.show":
            {
                if (!ContainsExplicitHistoryIntent(rawInput))
                {
                    return new NaturalCommandValidationResult(false, false, null, "history_keyword_required", "대화 이력 키워드가 필요합니다.");
                }

                var countArg = GetArg("count", "n", "value");
                if (!string.IsNullOrWhiteSpace(countArg)
                    && int.TryParse(countArg, out var n)
                    && n >= 1 && n <= 20)
                {
                    return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, $"/history {n}"), "ok", string.Empty);
                }

                return new NaturalCommandValidationResult(true, false, new CanonicalCommand(command, "/history"), "ok", string.Empty);
            }
            case "kill.request":
                return new NaturalCommandValidationResult(
                    false,
                    false,
                    null,
                    "natural_kill_disallowed",
                    "보안 정책상 자연어 종료 요청은 허용되지 않습니다. /kill <pid> 형식으로만 실행할 수 있습니다."
                );
            default:
                return new NaturalCommandValidationResult(false, false, null, "unknown_command", "unknown command");
        }
    }

    public static string NormalizeNaturalCommandKey(string command)
    {
        var normalized = (command ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "mode" => "mode.set",
            "provider" => "provider.set",
            "model" => "model.set",
            "profile" => "profile.set",
            "memory" => "memory.clear",
            "doctor" => "doctor.run",
            "plan" => "plan.list",
            "task" => "task.list",
            "notebook" => "notebook.show",
            "handoff" => "handoff.create",
            "routine" => "routine.list",
            "coding" => "coding.status",
            "refactor" => "refactor.status",
            "metrics" => "metrics.get",
            "status" => "llm.status",
            "usage" => "llm.usage",
            "models" => "llm.models",
            "help" => "help.show",
            "kill" => "kill.request",
            _ => normalized
        };
    }

    public static bool LooksLikeNaturalKillIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        return Regex.IsMatch(
            normalized,
            @"(?:pid|프로세스|process)\s*([0-9]{2,}).*(?:종료|kill|중지)|(?:종료|kill|중지).*(?:pid|프로세스|process)\s*([0-9]{2,})",
            RegexOptions.CultureInvariant
        );
    }

    public static bool ShouldAttemptNaturalCommandInterpretation(string text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (normalized.Length == 0 || normalized.StartsWith("/", StringComparison.Ordinal))
        {
            return false;
        }

        return LooksLikeNaturalKillIntent(normalized)
            || ContainsExplicitMemoryKeyword(normalized)
            || ContainsExplicitDoctorIntent(normalized)
            || ContainsExplicitPlanKeyword(normalized)
            || ContainsExplicitTaskKeyword(normalized)
            || ContainsExplicitNotebookKeyword(normalized)
            || ContainsExplicitHandoffKeyword(normalized)
            || ContainsExplicitProfileControlIntent(normalized)
            || ContainsExplicitModeControlIntent(normalized)
            || ContainsExplicitProviderControlIntent(normalized, "single")
            || ContainsExplicitProviderControlIntent(normalized, "summary")
            || ContainsExplicitModelControlIntent(normalized)
            || ContainsExplicitRoutineKeyword(normalized)
            || ContainsExplicitCodingRunIntent(normalized)
            || ContainsExplicitCodingResultIntent(normalized)
            || ContainsExplicitCodingFilesIntent(normalized)
            || ContainsExplicitCodingFileIntent(normalized)
            || ContainsExplicitCodingDownloadIntent(normalized)
            || ContainsExplicitCodingModeControlIntent(normalized)
            || ContainsExplicitCodingLanguageIntent(normalized)
            || ContainsExplicitCodingProviderControlIntent(normalized)
            || ContainsExplicitCodingModelControlIntent(normalized)
            || ContainsExplicitCodingWorkerControlIntent(normalized)
            || ContainsExplicitRefactorKeyword(normalized)
            || ContainsExplicitMetricsIntent(normalized)
            || ContainsExplicitLlmStatusIntent(normalized)
            || ContainsExplicitLlmUsageIntent(normalized)
            || ContainsExplicitLlmModelsIntent(normalized)
            || ContainsExplicitHelpIntent(normalized)
            || ContainsExplicitSkillIntent(normalized)
            || ContainsExplicitThinkIntent(normalized)
            || ContainsExplicitWebIntent(normalized)
            || ContainsExplicitHistoryIntent(normalized);
    }

    public static bool ContainsExplicitMemoryKeyword(string text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return false;
        }

        return normalized.Contains("메모리", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("memory", StringComparison.OrdinalIgnoreCase);
    }

    public static bool ContainsExplicitDoctorIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(normalized, "doctor", "진단", "점검", "상태 점검", "health check");
    }

    public static bool ContainsExplicitPlanKeyword(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(normalized, "plan", "planning", "계획", "기획");
    }

    public static bool ContainsExplicitTaskKeyword(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(normalized, "task", "tasks", "task graph", "작업", "태스크", "그래프");
    }

    public static bool ContainsExplicitNotebookKeyword(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(
            normalized,
            "notebook",
            "노트북",
            "learning",
            "decision",
            "verification",
            "학습 기록",
            "결정 기록",
            "검증 기록"
        );
    }

    public static bool ContainsExplicitHandoffKeyword(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(normalized, "handoff", "인수인계");
    }

    public static bool ContainsExplicitProfileControlIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        var hasProfileKeyword = ContainsAny(normalized, "프로필", "profile", "talk", "code");
        return hasProfileKeyword && ContainsNaturalSettingVerb(normalized);
    }

    public static bool ContainsExplicitModeControlIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        var hasModeKeyword = ContainsAny(
            normalized,
            "모드",
            "mode",
            "단일모드",
            "멀티모드",
            "오케스트레이션",
            "orchestration",
            "single mode",
            "multi mode"
        );
        return hasModeKeyword && ContainsNaturalSettingVerb(normalized);
    }

    public static bool ContainsExplicitProviderControlIntent(string text, string slot)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        var hasProviderKeyword = ContainsAny(normalized, "provider", "제공자", "공급자");
        var hasLlmContext = ContainsAny(normalized, "llm", "모델", "model", "채팅", "single", "단일", "multi", "다중", "orchestration", "오케스트레이션", "codex", "코덱스");
        var providerNameCount = CountProviderNameMentions(normalized);
        var hasSummaryKeyword = ContainsAny(normalized, "summary", "요약");
        if (string.Equals(slot, "summary", StringComparison.OrdinalIgnoreCase) && !hasSummaryKeyword)
        {
            return false;
        }

        if (hasProviderKeyword && (hasLlmContext || hasSummaryKeyword || providerNameCount > 0))
        {
            return true;
        }

        return ContainsNaturalSettingVerb(normalized)
            && providerNameCount > 0
            && (hasLlmContext || providerNameCount >= 2 || hasSummaryKeyword);
    }

    public static bool ContainsExplicitModelControlIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(normalized, "모델", "model", "llm")
            && ContainsNaturalSettingVerb(normalized);
    }

    public static bool ContainsExplicitCodingKeyword(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(normalized, "코딩", "coding", "code run", "코드 생성");
    }

    public static bool ContainsExplicitCodingRunIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitCodingKeyword(normalized)
            && ContainsAny(normalized, "실행", "run", "만들", "구현", "개발", "작성", "생성");
    }

    public static bool ContainsExplicitCodingResultIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitCodingKeyword(normalized)
            && ContainsAny(normalized, "최근", "마지막", "결과", "요약", "last", "result");
    }

    public static bool ContainsExplicitCodingFilesIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitCodingKeyword(normalized)
            && ContainsAny(normalized, "파일", "목록", "리스트", "files", "list");
    }

    public static bool ContainsExplicitCodingFileIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitCodingKeyword(normalized)
            && ContainsAny(normalized, "파일", "열어", "보여", "미리보기", "preview", "file");
    }

    public static bool ContainsExplicitCodingModeControlIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitCodingKeyword(normalized)
            && ContainsAny(normalized, "모드", "mode", "단일", "single", "오케스트레이션", "orchestration", "다중", "multi")
            && ContainsNaturalSettingVerb(normalized);
    }

    public static bool ContainsExplicitCodingLanguageIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitCodingKeyword(normalized)
            && ContainsAny(normalized, "언어", "language")
            && ContainsNaturalSettingVerb(normalized);
    }

    public static bool ContainsExplicitCodingProviderControlIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitCodingKeyword(normalized)
            && ContainsAny(normalized, "제공자", "provider", "요약 담당", "summary")
            && ContainsNaturalSettingVerb(normalized);
    }

    public static bool ContainsExplicitCodingModelControlIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitCodingKeyword(normalized)
            && ContainsAny(normalized, "모델", "model")
            && ContainsNaturalSettingVerb(normalized);
    }

    public static bool ContainsExplicitCodingWorkerControlIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitCodingKeyword(normalized)
            && ContainsAny(normalized, "워커", "worker")
            && ContainsNaturalSettingVerb(normalized);
    }

    public static bool ContainsExplicitRefactorKeyword(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(normalized, "safe refactor", "refactor", "리팩터");
    }

    public static bool ContainsExplicitRefactorReadIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitRefactorKeyword(normalized)
            && ContainsAny(normalized, "읽기", "read", "보기", "확인");
    }

    public static bool ContainsExplicitRefactorApplyIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitRefactorKeyword(normalized)
            && ContainsAny(normalized, "적용", "apply");
    }

    public static bool ContainsExplicitMetricsIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(normalized, "metrics", "metric", "메트릭", "지표");
    }

    public static bool ContainsExplicitLlmStatusIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        var hasLlmKeyword = ContainsAny(normalized, "llm", "모델", "model", "provider", "제공자");
        var hasStatusKeyword = ContainsAny(normalized, "상태", "status", "뭐", "무엇", "어떤", "현재", "지금", "사용", "쓰고");
        return hasLlmKeyword && hasStatusKeyword;
    }

    public static bool ContainsExplicitLlmUsageIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(normalized, "quota", "usage", "limit", "사용량", "한도", "쿼터", "잔여");
    }

    public static bool ContainsExplicitLlmModelsIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(
            normalized,
            "모델 목록",
            "모델 리스트",
            "지원 모델",
            "available models",
            "model list",
            "models"
        );
    }

    public static bool ContainsExplicitHelpIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(normalized, "help", "도움말", "명령어", "사용법", "가이드", "뭐 할 수", "뭘 할 수", "할수있는", "할 수 있는");
    }

    public static bool ContainsExplicitRoutineKeyword(string text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return false;
        }

        return normalized.Contains("루틴", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("routine", StringComparison.OrdinalIgnoreCase);
    }

    public static bool ContainsExplicitCodingDownloadIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsExplicitCodingKeyword(normalized)
            && ContainsAny(normalized, "다운", "다운로드", "내려", "내려받", "받아", "첨부", "전송", "보내", "save", "download", "export");
    }

    public static bool ContainsExplicitSkillIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return normalized.Contains("스킬", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("skill", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("별명", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("alias", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("단축", StringComparison.OrdinalIgnoreCase);
    }

    public static bool ContainsExplicitSkillOffIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        if (!ContainsExplicitSkillIntent(normalized))
        {
            return false;
        }

        return ContainsAny(normalized, "해제", "꺼", "끄", "그만", "중지", "종료", "off", "stop", "disable", "deactivate");
    }

    public static bool ContainsExplicitThinkIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return normalized.Contains("추론", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("think", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("심층", StringComparison.OrdinalIgnoreCase);
    }

    public static bool ContainsExplicitWebIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return normalized.Contains("웹검색", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("웹 검색", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("웹 컨텍스트", StringComparison.OrdinalIgnoreCase)
            || normalized.Contains("웹컨텍스트", StringComparison.OrdinalIgnoreCase)
            || (normalized.Contains("웹", StringComparison.OrdinalIgnoreCase)
                && ContainsAny(normalized, "켜", "꺼", "끄", "on", "off", "활성", "비활성", "상태"));
    }

    public static bool ContainsExplicitHistoryIntent(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(
            normalized,
            "최근 대화",
            "지난 대화",
            "이전 대화",
            "대화 이력",
            "대화 기록",
            "대화 히스토리",
            "히스토리",
            "history",
            "log");
    }

    public static string NormalizeCodingNaturalMode(string? mode)
    {
        return (mode ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "single" => "single",
            "단일" => "single",
            "orchestration" => "orchestration",
            "오케스트레이션" => "orchestration",
            "multi" => "multi",
            "다중" => "multi",
            _ => string.Empty
        };
    }

    private static string NormalizeProvider(string? provider, bool allowAuto)
    {
        var value = (provider ?? string.Empty).Trim().ToLowerInvariant();
        if (value == "nvidia-nim" || value == "nvidia_nim" || value == "nim")
        {
            value = "nvidia";
        }

        if (value == "gemini" || value == "groq" || value == "cerebras" || value == "nvidia" || value == "copilot" || value == "codex")
        {
            return value;
        }

        if (allowAuto && (value == "auto" || string.IsNullOrWhiteSpace(value)))
        {
            return "auto";
        }

        return "groq";
    }

    private static int CountProviderNameMentions(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return 0;
        }

        var count = 0;
        if (ContainsAny(normalized, "groq", "그록"))
        {
            count += 1;
        }

        if (ContainsAny(normalized, "gemini", "제미니"))
        {
            count += 1;
        }

        if (ContainsAny(normalized, "copilot", "코파일럿"))
        {
            count += 1;
        }

        if (ContainsAny(normalized, "cerebras", "세레브라스", "세레브라"))
        {
            count += 1;
        }

        if (ContainsAny(normalized, "codex", "코덱스"))
        {
            count += 1;
        }

        if (ContainsAny(normalized, "auto", "자동"))
        {
            count += 1;
        }

        return count;
    }

    private static bool ContainsNaturalSettingVerb(string text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(
            normalized,
            "변경",
            "바꿔",
            "바꿔줘",
            "설정",
            "전환",
            "set",
            "switch",
            "맞춰",
            "해줘",
            "선택",
            "켜줘",
            "보여줘",
            "만들어줘"
        );
    }

    private static bool ContainsAny(string text, params string[] patterns)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        foreach (var pattern in patterns)
        {
            if (!string.IsNullOrWhiteSpace(pattern)
                && text.Contains(pattern, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}

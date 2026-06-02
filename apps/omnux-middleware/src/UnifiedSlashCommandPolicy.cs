namespace Omnux.Middleware;

internal enum UnifiedSlashCommandKind
{
    StaticMessage,
    ApplyProfile,
    SetMode,
    SetProvider,
    SetModel,
    BuildStatus,
    MemoryClear,
    MemoryCreate,
    MemoryHelp,
    Doctor,
    Plan,
    Task,
    Notebook,
    Handoff,
    LlmHelp,
    LlmUsage,
    LlmModels,
    LlmSetGroqModel,
    LlmSetCopilotModel,
    LlmSetProviderThenModel
}

internal sealed record UnifiedSlashCommand(
    UnifiedSlashCommandKind Kind,
    IReadOnlyList<string> Tokens,
    string Primary = "",
    string Secondary = "",
    string Message = "",
    bool Json = false,
    bool LatestOnly = false,
    bool CompactConversation = false
);

internal static class UnifiedSlashCommandPolicy
{
    private const string ProfileUsage = "usage: /profile <talk|code> [low|high]";
    private const string ProfileInvalid = "invalid profile. use talk|code";
    private const string ModeUsage = "usage: /mode <single|orchestration|multi>";
    private const string ProviderUsage = "사용법: /provider <single|orchestration|summary> <groq|gemini|copilot|cerebras|nvidia|codex|auto>";
    private const string ModelUsage = "사용법: /model <single|orchestration|multi.groq|multi.gemini|multi.copilot|multi.cerebras|multi.nvidia|multi.codex> <model-id>";
    private const string StatusUsage = "usage: /status model";
    private const string LlmModeUsage = "사용법: /llm mode <single|orchestration|multi>";
    private const string LlmSingleUsage = "사용법: /llm single provider <groq|gemini|copilot|cerebras|nvidia|codex> | /llm single model <model-id>";
    private const string LlmOrchestrationUsage = "사용법: /llm orchestration provider <auto|groq|gemini|copilot|cerebras|nvidia|codex> | /llm orchestration model <model-id>";
    private const string LlmMultiUsage = "사용법: /llm multi <groq|gemini|copilot|cerebras|nvidia|codex> <model-id> | /llm multi summary <auto|groq|gemini|copilot|cerebras|nvidia|codex>";
    private const string LlmSetUsage = "사용법: /llm set <groq|copilot|nvidia|codex> <model-id>";
    private const string LlmUnknown = "알 수 없는 /llm 명령입니다. /llm help 또는 자연어 요청을 사용하세요.";

    public static UnifiedSlashCommand? Parse(string? text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized) || !normalized.StartsWith("/", StringComparison.Ordinal))
        {
            return null;
        }

        var tokens = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length == 0)
        {
            return null;
        }

        var head = tokens[0].Trim().ToLowerInvariant();
        return head switch
        {
            "/talk" => BuildProfileCommand(tokens, "talk"),
            "/code" => BuildProfileCommand(tokens, "code"),
            "/profile" => ParseProfile(tokens),
            "/mode" => ParseMode(tokens),
            "/provider" => ParseProvider(tokens),
            "/model" => ParseModel(tokens),
            "/status" => ParseStatus(tokens),
            "/memory" => ParseMemory(tokens),
            "/doctor" => ParseDoctor(tokens),
            "/plan" => new UnifiedSlashCommand(UnifiedSlashCommandKind.Plan, tokens),
            "/task" => new UnifiedSlashCommand(UnifiedSlashCommandKind.Task, tokens),
            "/notebook" => new UnifiedSlashCommand(UnifiedSlashCommandKind.Notebook, tokens),
            "/handoff" => new UnifiedSlashCommand(UnifiedSlashCommandKind.Handoff, tokens),
            "/llm" => ParseLlm(tokens),
            _ => null
        };
    }

    private static UnifiedSlashCommand BuildProfileCommand(IReadOnlyList<string> tokens, string profile)
    {
        var thinking = tokens.Count >= 2
            ? TelegramLlmPreferencePolicy.NormalizeThinkingLevel(tokens[1], "auto")
            : "auto";
        return new UnifiedSlashCommand(UnifiedSlashCommandKind.ApplyProfile, tokens, profile, thinking);
    }

    private static UnifiedSlashCommand ParseProfile(IReadOnlyList<string> tokens)
    {
        if (tokens.Count < 2)
        {
            return Message(tokens, ProfileUsage);
        }

        var profile = tokens[1].Trim().ToLowerInvariant();
        if (profile is not ("talk" or "code"))
        {
            return Message(tokens, ProfileInvalid);
        }

        var thinking = tokens.Count >= 3
            ? TelegramLlmPreferencePolicy.NormalizeThinkingLevel(tokens[2], "auto")
            : "auto";
        return new UnifiedSlashCommand(UnifiedSlashCommandKind.ApplyProfile, tokens, profile, thinking);
    }

    private static UnifiedSlashCommand ParseMode(IReadOnlyList<string> tokens)
    {
        return tokens.Count < 2
            ? Message(tokens, ModeUsage)
            : new UnifiedSlashCommand(UnifiedSlashCommandKind.SetMode, tokens, tokens[1].Trim().ToLowerInvariant());
    }

    private static UnifiedSlashCommand ParseProvider(IReadOnlyList<string> tokens)
    {
        if (tokens.Count < 3)
        {
            return Message(tokens, ProviderUsage);
        }

        return new UnifiedSlashCommand(
            UnifiedSlashCommandKind.SetProvider,
            tokens,
            tokens[1].Trim().ToLowerInvariant(),
            tokens[2].Trim().ToLowerInvariant()
        );
    }

    private static UnifiedSlashCommand ParseModel(IReadOnlyList<string> tokens)
    {
        if (tokens.Count == 2)
        {
            var quickProvider = NormalizeProviderAlias(tokens[1]);
            if (IsConcreteProvider(quickProvider))
            {
                return new UnifiedSlashCommand(UnifiedSlashCommandKind.SetProvider, tokens, "single", quickProvider);
            }
        }

        if (tokens.Count < 3)
        {
            return Message(tokens, ModelUsage);
        }

        return new UnifiedSlashCommand(
            UnifiedSlashCommandKind.SetModel,
            tokens,
            tokens[1].Trim().ToLowerInvariant(),
            string.Join(' ', tokens.Skip(2)).Trim()
        );
    }

    private static UnifiedSlashCommand ParseStatus(IReadOnlyList<string> tokens)
    {
        return tokens.Count >= 2 && tokens[1].Trim().Equals("model", StringComparison.OrdinalIgnoreCase)
            ? new UnifiedSlashCommand(UnifiedSlashCommandKind.BuildStatus, tokens)
            : Message(tokens, StatusUsage);
    }

    private static UnifiedSlashCommand ParseMemory(IReadOnlyList<string> tokens)
    {
        if (tokens.Count >= 2 && tokens[1].Equals("clear", StringComparison.OrdinalIgnoreCase))
        {
            return new UnifiedSlashCommand(UnifiedSlashCommandKind.MemoryClear, tokens);
        }

        if (tokens.Count >= 2 && tokens[1].Equals("create", StringComparison.OrdinalIgnoreCase))
        {
            var compactConversation = tokens.Count >= 3
                && tokens[2].Equals("compact", StringComparison.OrdinalIgnoreCase);
            return new UnifiedSlashCommand(
                UnifiedSlashCommandKind.MemoryCreate,
                tokens,
                CompactConversation: compactConversation
            );
        }

        return new UnifiedSlashCommand(UnifiedSlashCommandKind.MemoryHelp, tokens);
    }

    private static UnifiedSlashCommand ParseDoctor(IReadOnlyList<string> tokens)
    {
        var latestOnly = tokens.Skip(1).Any(token => token.Equals("last", StringComparison.OrdinalIgnoreCase));
        var json = tokens.Skip(1).Any(token => token.Equals("json", StringComparison.OrdinalIgnoreCase));
        return new UnifiedSlashCommand(UnifiedSlashCommandKind.Doctor, tokens, Json: json, LatestOnly: latestOnly);
    }

    private static UnifiedSlashCommand ParseLlm(IReadOnlyList<string> tokens)
    {
        if (tokens.Count <= 1 || tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
        {
            return new UnifiedSlashCommand(UnifiedSlashCommandKind.LlmHelp, tokens);
        }

        var sub = tokens[1].Trim().ToLowerInvariant();
        return sub switch
        {
            "status" => new UnifiedSlashCommand(UnifiedSlashCommandKind.BuildStatus, tokens),
            "usage" or "limits" or "quota" => new UnifiedSlashCommand(UnifiedSlashCommandKind.LlmUsage, tokens),
            "mode" => ParseLlmMode(tokens),
            "single" => ParseLlmSlot(tokens, "single", LlmSingleUsage),
            "orchestration" => ParseLlmSlot(tokens, "orchestration", LlmOrchestrationUsage),
            "multi" => ParseLlmMulti(tokens),
            "models" => new UnifiedSlashCommand(
                UnifiedSlashCommandKind.LlmModels,
                tokens,
                tokens.Count >= 3 ? tokens[2].Trim().ToLowerInvariant() : "all"
            ),
            "set" => ParseLlmSet(tokens),
            _ => Message(tokens, LlmUnknown)
        };
    }

    private static UnifiedSlashCommand ParseLlmMode(IReadOnlyList<string> tokens)
    {
        return tokens.Count < 3
            ? Message(tokens, LlmModeUsage)
            : new UnifiedSlashCommand(UnifiedSlashCommandKind.SetMode, tokens, tokens[2].Trim().ToLowerInvariant());
    }

    private static UnifiedSlashCommand ParseLlmSlot(
        IReadOnlyList<string> tokens,
        string slot,
        string usage
    )
    {
        if (tokens.Count < 4)
        {
            return Message(tokens, usage);
        }

        if (tokens[2].Equals("provider", StringComparison.OrdinalIgnoreCase))
        {
            return new UnifiedSlashCommand(
                UnifiedSlashCommandKind.SetProvider,
                tokens,
                slot,
                tokens[3].Trim().ToLowerInvariant()
            );
        }

        if (tokens[2].Equals("model", StringComparison.OrdinalIgnoreCase))
        {
            return new UnifiedSlashCommand(
                UnifiedSlashCommandKind.SetModel,
                tokens,
                slot,
                string.Join(' ', tokens.Skip(3)).Trim()
            );
        }

        return Message(tokens, usage);
    }

    private static UnifiedSlashCommand ParseLlmMulti(IReadOnlyList<string> tokens)
    {
        if (tokens.Count < 4)
        {
            return Message(tokens, LlmMultiUsage);
        }

        var slot = tokens[2].Trim().ToLowerInvariant();
        if (slot == "summary")
        {
            return new UnifiedSlashCommand(
                UnifiedSlashCommandKind.SetProvider,
                tokens,
                "summary",
                tokens[3].Trim().ToLowerInvariant()
            );
        }

        var canonicalSlot = slot switch
        {
            "groq" => "multi.groq",
            "gemini" => "multi.gemini",
            "copilot" => "multi.copilot",
            "cerebras" => "multi.cerebras",
            "nvidia" or "nvidia-nim" or "nvidia_nim" or "nim" => "multi.nvidia",
            "codex" => "multi.codex",
            _ => string.Empty
        };

        return string.IsNullOrWhiteSpace(canonicalSlot)
            ? Message(tokens, LlmMultiUsage)
            : new UnifiedSlashCommand(
                UnifiedSlashCommandKind.SetModel,
                tokens,
                canonicalSlot,
                string.Join(' ', tokens.Skip(3)).Trim()
            );
    }

    private static UnifiedSlashCommand ParseLlmSet(IReadOnlyList<string> tokens)
    {
        if (tokens.Count < 4)
        {
            return Message(tokens, LlmSetUsage);
        }

        var provider = tokens[2].Trim().ToLowerInvariant();
        var model = string.Join(' ', tokens.Skip(3)).Trim();
        if (provider == "groq")
        {
            return new UnifiedSlashCommand(UnifiedSlashCommandKind.LlmSetGroqModel, tokens, model);
        }

        if (provider == "copilot")
        {
            return new UnifiedSlashCommand(UnifiedSlashCommandKind.LlmSetCopilotModel, tokens, model);
        }

        if (provider == "codex")
        {
            return new UnifiedSlashCommand(UnifiedSlashCommandKind.LlmSetProviderThenModel, tokens, "codex", model);
        }

        if (provider is "nvidia" or "nvidia-nim" or "nvidia_nim" or "nim")
        {
            return new UnifiedSlashCommand(UnifiedSlashCommandKind.LlmSetProviderThenModel, tokens, "nvidia", model);
        }

        return Message(tokens, LlmSetUsage);
    }

    private static string NormalizeProviderAlias(string value)
    {
        var provider = (value ?? string.Empty).Trim().ToLowerInvariant();
        return provider is "nvidia-nim" or "nvidia_nim" or "nim" ? "nvidia" : provider;
    }

    private static bool IsConcreteProvider(string provider)
    {
        return provider is "groq" or "gemini" or "copilot" or "cerebras" or "nvidia" or "codex";
    }

    private static UnifiedSlashCommand Message(IReadOnlyList<string> tokens, string message)
    {
        return new UnifiedSlashCommand(UnifiedSlashCommandKind.StaticMessage, tokens, Message: message);
    }
}

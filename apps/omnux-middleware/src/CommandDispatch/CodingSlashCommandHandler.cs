using System.Text;

namespace Omnux.Middleware;

/// <summary>
/// 웹 텍스트 경로의 <c>/coding</c> 실행 명령 핸들러.
/// 텔레그램 <c>/coding</c>은 파일 다운로드/최근 결과 UX가 있는 direct 경로가 먼저 처리한다.
/// </summary>
internal sealed class CodingSlashCommandHandler : ISlashCommandHandler
{
    private const string HelpText =
        """
        [코딩 명령]
        /coding run <요구사항>
        /coding single run <요구사항>
        /coding orchestration run <요구사항>
        /coding multi run <요구사항>

        옵션:
        --provider <auto|groq|gemini|copilot|cerebras|nvidia|codex>
        --model <model-id>
        --language <language|auto>
        """;

    private readonly ICodingApplicationService _codingService;

    public CodingSlashCommandHandler(ICodingApplicationService codingService)
    {
        _codingService = codingService;
    }

    public bool CanHandle(SlashCommandContext context)
    {
        var text = (context.Text ?? string.Empty).Trim();
        return text.Equals("/coding", StringComparison.OrdinalIgnoreCase)
            || text.StartsWith("/coding ", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken)
    {
        var tokens = (context.Text ?? string.Empty)
            .Trim()
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length <= 1 || tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
        {
            return HelpText;
        }

        if (!TryParseRunCommand(tokens, out var mode, out var input, out var provider, out var model, out var language, out var error))
        {
            return error;
        }

        var request = new CodingRunRequest(
            Input: input,
            Source: context.Source,
            Scope: "coding",
            Mode: mode,
            ConversationId: null,
            ConversationTitle: null,
            Project: null,
            Category: "코딩",
            Tags: new[] { "slash-coding" },
            Provider: provider,
            Model: model,
            Language: language,
            LinkedMemoryNotes: null
        );

        var result = mode switch
        {
            "orchestration" => await _codingService.RunCodingOrchestrationAsync(request, cancellationToken),
            "multi" => await _codingService.RunCodingMultiAsync(request, cancellationToken),
            _ => await _codingService.RunCodingSingleAsync(request, cancellationToken)
        };

        return FormatResult(result);
    }

    private static bool TryParseRunCommand(
        IReadOnlyList<string> tokens,
        out string mode,
        out string input,
        out string? provider,
        out string? model,
        out string language,
        out string error
    )
    {
        mode = "single";
        input = string.Empty;
        provider = null;
        model = null;
        language = "auto";
        error = "사용법: /coding [single|orchestration|multi] run [--provider <provider>] [--model <model-id>] [--language <language>] <요구사항>";

        var index = 1;
        if (index < tokens.Count && IsCodingMode(tokens[index]))
        {
            mode = NormalizeMode(tokens[index]);
            index += 1;
        }

        if (index >= tokens.Count || !tokens[index].Equals("run", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        index += 1;
        var inputTokens = new List<string>();
        while (index < tokens.Count)
        {
            var token = tokens[index];
            if (token.Equals("--provider", StringComparison.OrdinalIgnoreCase))
            {
                if (index + 1 >= tokens.Count)
                {
                    return false;
                }

                provider = tokens[index + 1].Trim();
                index += 2;
                continue;
            }

            if (token.Equals("--model", StringComparison.OrdinalIgnoreCase))
            {
                if (index + 1 >= tokens.Count)
                {
                    return false;
                }

                model = tokens[index + 1].Trim();
                index += 2;
                continue;
            }

            if (token.Equals("--language", StringComparison.OrdinalIgnoreCase)
                || token.Equals("--lang", StringComparison.OrdinalIgnoreCase))
            {
                if (index + 1 >= tokens.Count)
                {
                    return false;
                }

                language = tokens[index + 1].Trim();
                index += 2;
                continue;
            }

            inputTokens.Add(token);
            index += 1;
        }

        input = string.Join(' ', inputTokens).Trim();
        return !string.IsNullOrWhiteSpace(input);
    }

    private static bool IsCodingMode(string value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized is "single" or "orch" or "orchestrate" or "orchestration" or "multi" or "compare";
    }

    private static string NormalizeMode(string value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "orch" or "orchestrate" or "orchestration" => "orchestration",
            "multi" or "compare" => "multi",
            _ => "single"
        };
    }

    private static string FormatResult(CodingRunResult result)
    {
        var builder = new StringBuilder();
        builder.AppendLine("[코딩 실행 완료]");
        builder.AppendLine($"대화: {result.Conversation.Title}");
        builder.AppendLine($"모드: {result.Mode}");
        builder.AppendLine($"모델: {result.Provider}/{result.Model}");
        builder.AppendLine($"언어: {result.Language}");
        builder.AppendLine($"상태: {result.Execution.Status} (exit={result.Execution.ExitCode})");
        builder.AppendLine($"작업 폴더: {result.Execution.RunDirectory}");
        if (!string.IsNullOrWhiteSpace(result.Execution.Command)
            && result.Execution.Command != "-"
            && result.Execution.Command != "(none)")
        {
            builder.AppendLine($"실행 명령: {SlashCommandTextFormat.Trim(result.Execution.Command, 180)}");
        }

        builder.AppendLine($"변경 파일: {result.ChangedFiles.Count}개");
        foreach (var path in result.ChangedFiles.Take(8))
        {
            builder.AppendLine($"- {path}");
        }

        if (result.ChangedFiles.Count > 8)
        {
            builder.AppendLine($"- ...(추가 {result.ChangedFiles.Count - 8}개)");
        }

        var summary = SlashCommandTextFormat.Trim(ChatOutputSanitizerPolicy.RemoveCodeBlocksFromText(result.Summary), 1200);
        if (!string.IsNullOrWhiteSpace(summary))
        {
            builder.AppendLine();
            builder.AppendLine("요약:");
            builder.AppendLine(summary);
        }

        return builder.ToString().Trim();
    }
}

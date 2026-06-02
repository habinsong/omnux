using System.Globalization;
using System.Text;

namespace Omnux.Middleware;

public sealed partial class WebSocketGateway
{
    private static string BuildMultiChatResultJson(ConversationMultiResult result)
    {
        var retryDirective = ResolveRetryDirective(result.GuardFailure);
        return "{"
               + "\"type\":\"llm_chat_multi_result\","
               + $"\"conversationId\":\"{EscapeJson(result.ConversationId)}\","
               + $"\"groq\":\"{EscapeJson(result.GroqText)}\","
               + $"\"gemini\":\"{EscapeJson(result.GeminiText)}\","
               + $"\"cerebras\":\"{EscapeJson(result.CerebrasText)}\","
               + $"\"nvidia\":\"{EscapeJson(result.NvidiaText)}\","
               + $"\"copilot\":\"{EscapeJson(result.CopilotText)}\","
               + $"\"codex\":\"{EscapeJson(result.CodexText)}\","
               + $"\"summary\":\"{EscapeJson(result.Summary)}\","
               + $"\"commonSummary\":\"{EscapeJson(result.Summary)}\","
               + $"\"commonCore\":\"{EscapeJson(result.CommonCore)}\","
               + $"\"differences\":\"{EscapeJson(result.Differences)}\","
               + $"\"groqModel\":\"{EscapeJson(result.GroqModel)}\","
               + $"\"geminiModel\":\"{EscapeJson(result.GeminiModel)}\","
               + $"\"cerebrasModel\":\"{EscapeJson(result.CerebrasModel)}\","
               + $"\"nvidiaModel\":\"{EscapeJson(result.NvidiaModel)}\","
               + $"\"copilotModel\":\"{EscapeJson(result.CopilotModel)}\","
               + $"\"codexModel\":\"{EscapeJson(result.CodexModel)}\","
               + $"\"requestedSummaryProvider\":\"{EscapeJson(result.RequestedSummaryProvider)}\","
               + $"\"resolvedSummaryProvider\":\"{EscapeJson(result.ResolvedSummaryProvider)}\","
               + $"\"conversation\":{BuildConversationJson(result.Conversation)},"
               + $"\"autoMemoryNote\":{BuildMemoryNoteJson(result.AutoMemoryNote)},"
               + $"\"citations\":{BuildSearchCitationArrayJson(result.Citations)},"
               + $"\"citationMappings\":{BuildSearchCitationMappingArrayJson(result.CitationMappings)},"
               + $"\"citationValidation\":{BuildSearchCitationValidationJson(result.CitationValidation)},"
               + $"\"guardCategory\":\"{EscapeJson(NormalizeWebSearchGuardCategory(result.GuardFailure))}\","
               + $"\"guardReason\":\"{EscapeJson(NormalizeWebSearchGuardReason(result.GuardFailure))}\","
               + $"\"guardDetail\":\"{EscapeJson(NormalizeWebSearchGuardDetail(result.GuardFailure))}\","
               + $"\"retryRequired\":{(retryDirective.RetryRequired ? "true" : "false")},"
               + $"\"retryAction\":\"{EscapeJson(retryDirective.RetryAction)}\","
               + $"\"retryScope\":\"{EscapeJson(retryDirective.RetryScope)}\","
               + $"\"retryReason\":\"{EscapeJson(retryDirective.RetryReason)}\""
               + "}";
    }

    private static string BuildConversationJson(ConversationThreadView conversation)
    {
        var builder = new StringBuilder();
        builder.Append("{");
        builder.Append($"\"id\":\"{EscapeJson(conversation.Id)}\",");
        builder.Append($"\"scope\":\"{EscapeJson(conversation.Scope)}\",");
        builder.Append($"\"mode\":\"{EscapeJson(conversation.Mode)}\",");
        builder.Append($"\"title\":\"{EscapeJson(conversation.Title)}\",");
        builder.Append($"\"project\":\"{EscapeJson(conversation.Project)}\",");
        builder.Append($"\"category\":\"{EscapeJson(conversation.Category)}\",");
        builder.Append($"\"createdUtc\":\"{EscapeJson(conversation.CreatedUtc.ToString("O"))}\",");
        builder.Append($"\"updatedUtc\":\"{EscapeJson(conversation.UpdatedUtc.ToString("O"))}\",");
        builder.Append("\"tags\":[");
        for (var i = 0; i < conversation.Tags.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            builder.Append($"\"{EscapeJson(conversation.Tags[i])}\"");
        }

        builder.Append("],");
        builder.Append("\"linkedMemoryNotes\":[");
        for (var i = 0; i < conversation.LinkedMemoryNotes.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            builder.Append($"\"{EscapeJson(conversation.LinkedMemoryNotes[i])}\"");
        }

        builder.Append("],");
        builder.Append($"\"latestCodingResult\":{BuildConversationCodingResultJson(conversation.LatestCodingResult)},");
        builder.Append($"\"tokenUsageTotal\":{BuildTokenUsageJson(conversation.TokenUsageTotal)},");
        builder.Append("\"messages\":[");
        for (var i = 0; i < conversation.Messages.Count; i++)
        {
            var message = conversation.Messages[i];
            if (i > 0)
            {
                builder.Append(",");
            }

            builder.Append("{");
            builder.Append($"\"role\":\"{EscapeJson(message.Role)}\",");
            builder.Append($"\"text\":\"{EscapeJson(message.Text)}\",");
            builder.Append($"\"meta\":\"{EscapeJson(message.Meta)}\",");
            builder.Append($"\"createdUtc\":\"{EscapeJson(message.CreatedUtc.ToString("O"))}\",");
            builder.Append($"\"tokenUsage\":{BuildTokenUsageJson(message.TokenUsage)}");
            builder.Append("}");
        }

        builder.Append("]}");
        return builder.ToString();
    }

    private static string BuildTokenUsageJson(TokenUsage? usage)
    {
        if (usage == null)
        {
            return "null";
        }

        var normalized = TokenUsageEstimator.Normalize(usage);
        return "{"
            + $"\"promptTokens\":{Math.Max(0L, normalized.PromptTokens).ToString(CultureInfo.InvariantCulture)},"
            + $"\"completionTokens\":{Math.Max(0L, normalized.CompletionTokens).ToString(CultureInfo.InvariantCulture)},"
            + $"\"totalTokens\":{Math.Max(0L, normalized.TotalTokens).ToString(CultureInfo.InvariantCulture)},"
            + $"\"source\":\"{EscapeJson(normalized.Source)}\""
            + "}";
    }

    private static string BuildChatLatencyJson(ChatLatencyMetrics? latency)
    {
        if (latency == null)
        {
            return "null";
        }

        var serverTotalMs = Math.Max(
            0L,
            latency.DecisionMs
            + latency.PromptBuildMs
            + latency.FullResponseMs
            + latency.SanitizeMs
        );

        return "{"
            + $"\"decisionMs\":{Math.Max(0L, latency.DecisionMs).ToString(CultureInfo.InvariantCulture)},"
            + $"\"promptBuildMs\":{Math.Max(0L, latency.PromptBuildMs).ToString(CultureInfo.InvariantCulture)},"
            + $"\"firstChunkMs\":{Math.Max(0L, latency.FirstChunkMs).ToString(CultureInfo.InvariantCulture)},"
            + $"\"fullResponseMs\":{Math.Max(0L, latency.FullResponseMs).ToString(CultureInfo.InvariantCulture)},"
            + $"\"sanitizeMs\":{Math.Max(0L, latency.SanitizeMs).ToString(CultureInfo.InvariantCulture)},"
            + $"\"serverTotalMs\":{serverTotalMs.ToString(CultureInfo.InvariantCulture)},"
            + $"\"decisionPath\":\"{EscapeJson(latency.DecisionPath)}\""
            + "}";
    }

    private static string BuildMemoryNoteJson(MemoryNoteSaveResult? note)
    {
        if (note == null)
        {
            return "null";
        }

        return "{"
               + $"\"name\":\"{EscapeJson(note.Name)}\","
               + $"\"fullPath\":\"{EscapeJson(note.FullPath)}\","
               + $"\"excerpt\":\"{EscapeJson(note.Excerpt)}\""
               + "}";
    }

    private static string TrimTo(string value, int maxChars)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        if (value.Length <= maxChars)
        {
            return value;
        }

        return value[..maxChars] + "...";
    }

    private static string BuildExecutionJson(CodeExecutionResult result)
    {
        return "{"
               + $"\"language\":\"{EscapeJson(result.Language)}\","
               + $"\"runDirectory\":\"{EscapeJson(result.RunDirectory)}\","
               + $"\"entryFile\":\"{EscapeJson(result.EntryFile)}\","
               + $"\"command\":\"{EscapeJson(result.Command)}\","
               + $"\"exitCode\":{result.ExitCode},"
               + $"\"stdout\":\"{EscapeJson(result.StdOut)}\","
               + $"\"stderr\":\"{EscapeJson(result.StdErr)}\","
               + $"\"status\":\"{EscapeJson(result.Status)}\""
               + "}";
    }

    private static string BuildCodingWorkersJson(IReadOnlyList<CodingWorkerResult> workers)
    {
        var builder = new StringBuilder();
        builder.Append("[");
        for (var i = 0; i < workers.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            var worker = workers[i];
            builder.Append("{");
            builder.Append($"\"provider\":\"{EscapeJson(worker.Provider)}\",");
            builder.Append($"\"model\":\"{EscapeJson(worker.Model)}\",");
            builder.Append($"\"language\":\"{EscapeJson(worker.Language)}\",");
            builder.Append("\"code\":\"\",");
            builder.Append("\"rawResponse\":\"\",");
            builder.Append($"\"execution\":{BuildExecutionJson(worker.Execution)},");
            builder.Append($"\"changedFiles\":{BuildStringArrayJson(worker.ChangedFiles)},");
            builder.Append($"\"role\":\"{EscapeJson(worker.Role)}\",");
            builder.Append($"\"summary\":\"{EscapeJson(worker.Summary)}\"");
            builder.Append("}");
        }

        builder.Append("]");
        return builder.ToString();
    }

    private static string BuildConversationCodingResultJson(ConversationCodingResultSnapshot? result)
    {
        if (result == null)
        {
            return "null";
        }

        return "{"
               + "\"type\":\"coding_result\","
               + $"\"mode\":\"{EscapeJson(result.Mode)}\","
               + $"\"conversationId\":\"{EscapeJson(result.ConversationId)}\","
               + $"\"provider\":\"{EscapeJson(result.Provider)}\","
               + $"\"model\":\"{EscapeJson(result.Model)}\","
               + $"\"language\":\"{EscapeJson(result.Language)}\","
               + "\"code\":\"\","
               + $"\"summary\":\"{EscapeJson(result.Summary)}\","
               + $"\"commonSummary\":\"{EscapeJson(result.CommonSummary)}\","
               + $"\"commonPoints\":\"{EscapeJson(result.CommonPoints)}\","
               + $"\"differences\":\"{EscapeJson(result.Differences)}\","
               + $"\"recommendation\":\"{EscapeJson(result.Recommendation)}\","
               + $"\"execution\":{BuildExecutionJson(result.Execution)},"
               + $"\"workers\":{BuildCodingWorkerSnapshotsJson(result.Workers)},"
               + $"\"changedFiles\":{BuildStringArrayJson(result.ChangedFiles)},"
               + $"\"evidence\":{BuildCodingEvidenceJson(result.Evidence)}"
               + "}";
    }

    private static string BuildCodingExecutionResultJson(CodingResultExecutionResult result)
    {
        return "{"
               + "\"type\":\"coding_execute_result\","
               + $"\"ok\":{(result.Ok ? "true" : "false")},"
               + $"\"conversationId\":\"{EscapeJson(result.ConversationId)}\","
               + $"\"language\":\"{EscapeJson(result.Language)}\","
               + $"\"runMode\":\"{EscapeJson(result.RunMode)}\","
               + $"\"message\":\"{EscapeJson(result.Message)}\","
               + $"\"targetProvider\":\"{EscapeJson(result.TargetProvider)}\","
               + $"\"targetModel\":\"{EscapeJson(result.TargetModel)}\","
               + $"\"previewUrl\":\"{EscapeJson(result.PreviewUrl)}\","
               + $"\"previewEntry\":\"{EscapeJson(result.PreviewEntry)}\","
               + $"\"execution\":{(result.Execution == null ? "null" : BuildExecutionJson(result.Execution))},"
               + $"\"evidence\":{BuildCodingEvidenceJson(result.Evidence)}"
               + "}";
    }

    private static string BuildCodingEvidenceJson(CodingEvidencePack? evidence)
    {
        if (evidence == null)
        {
            return "null";
        }

        return "{"
               + $"\"runMode\":\"{EscapeJson(evidence.RunMode)}\","
               + $"\"command\":\"{EscapeJson(evidence.Command)}\","
               + $"\"exitCode\":{(evidence.ExitCode.HasValue ? evidence.ExitCode.Value.ToString(CultureInfo.InvariantCulture) : "null")},"
               + $"\"status\":\"{EscapeJson(evidence.Status)}\","
               + $"\"stdoutSummary\":\"{EscapeJson(evidence.StdoutSummary)}\","
               + $"\"stderrSummary\":\"{EscapeJson(evidence.StderrSummary)}\","
               + $"\"changedFiles\":{BuildStringArrayJson(evidence.ChangedFiles)},"
               + $"\"previewUrl\":\"{EscapeJson(evidence.PreviewUrl)}\","
               + $"\"previewEntry\":\"{EscapeJson(evidence.PreviewEntry)}\","
               + $"\"screenshotPath\":\"{EscapeJson(evidence.ScreenshotPath)}\","
               + $"\"consoleSummary\":\"{EscapeJson(evidence.ConsoleSummary)}\""
               + "}";
    }

    private static string BuildCodingWorkerSnapshotsJson(IReadOnlyList<CodingWorkerResultSnapshot> workers)
    {
        var builder = new StringBuilder();
        builder.Append("[");
        for (var i = 0; i < workers.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            var worker = workers[i];
            builder.Append("{");
            builder.Append($"\"provider\":\"{EscapeJson(worker.Provider)}\",");
            builder.Append($"\"model\":\"{EscapeJson(worker.Model)}\",");
            builder.Append($"\"language\":\"{EscapeJson(worker.Language)}\",");
            builder.Append("\"code\":\"\",");
            builder.Append("\"rawResponse\":\"\",");
            builder.Append($"\"execution\":{BuildExecutionJson(worker.Execution)},");
            builder.Append($"\"changedFiles\":{BuildStringArrayJson(worker.ChangedFiles)},");
            builder.Append($"\"role\":\"{EscapeJson(worker.Role)}\",");
            builder.Append($"\"summary\":\"{EscapeJson(worker.Summary)}\"");
            builder.Append("}");
        }

        builder.Append("]");
        return builder.ToString();
    }

    private static string BuildStringArrayJson(IReadOnlyList<string> values)
    {
        var builder = new StringBuilder();
        builder.Append("[");
        for (var i = 0; i < values.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            builder.Append($"\"{EscapeJson(values[i])}\"");
        }

        builder.Append("]");
        return builder.ToString();
    }

    private static string BuildSearchCitationArrayJson(IReadOnlyList<SearchCitationReference>? citations)
    {
        if (citations == null || citations.Count == 0)
        {
            return "[]";
        }

        var builder = new StringBuilder();
        builder.Append("[");
        for (var i = 0; i < citations.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            var citation = citations[i];
            builder.Append("{");
            builder.Append($"\"citationId\":\"{EscapeJson(citation.CitationId)}\",");
            builder.Append($"\"title\":\"{EscapeJson(citation.Title)}\",");
            builder.Append($"\"url\":\"{EscapeJson(citation.Url)}\",");
            builder.Append($"\"published\":\"{EscapeJson(citation.Published)}\",");
            builder.Append($"\"snippet\":\"{EscapeJson(citation.Snippet)}\",");
            builder.Append($"\"sourceType\":\"{EscapeJson(citation.SourceType)}\"");
            builder.Append("}");
        }

        builder.Append("]");
        return builder.ToString();
    }

    private static string BuildSearchCitationMappingArrayJson(IReadOnlyList<SearchCitationSentenceMapping>? mappings)
    {
        if (mappings == null || mappings.Count == 0)
        {
            return "[]";
        }

        var builder = new StringBuilder();
        builder.Append("[");
        for (var i = 0; i < mappings.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            var mapping = mappings[i];
            builder.Append("{");
            builder.Append($"\"segment\":\"{EscapeJson(mapping.Segment)}\",");
            builder.Append($"\"sentenceIndex\":{mapping.SentenceIndex},");
            builder.Append($"\"sentence\":\"{EscapeJson(mapping.Sentence)}\",");
            builder.Append($"\"citationIds\":{BuildStringArrayJson(mapping.CitationIds)},");
            builder.Append($"\"unknownCitationIds\":{BuildStringArrayJson(mapping.UnknownCitationIds)},");
            builder.Append($"\"missingCitation\":{(mapping.MissingCitation ? "true" : "false")}");
            builder.Append("}");
        }

        builder.Append("]");
        return builder.ToString();
    }

    private static string BuildSearchCitationValidationJson(SearchCitationValidationSummary? validation)
    {
        if (validation == null)
        {
            return "{\"totalSentences\":0,\"taggedSentences\":0,\"missingSentences\":0,\"unknownCitationSentences\":0,\"passed\":true}";
        }

        return "{"
               + $"\"totalSentences\":{validation.TotalSentences},"
               + $"\"taggedSentences\":{validation.TaggedSentences},"
               + $"\"missingSentences\":{validation.MissingSentences},"
               + $"\"unknownCitationSentences\":{validation.UnknownCitationSentences},"
               + $"\"passed\":{(validation.Passed ? "true" : "false")}"
               + "}";
    }
}

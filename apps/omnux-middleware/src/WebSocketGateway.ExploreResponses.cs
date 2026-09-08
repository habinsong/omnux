using System.Net.WebSockets;
using System.Text;
using System.Globalization;

namespace Omnux.Middleware;

public sealed partial class WebSocketGateway
{
    private async Task SendSessionsListResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        IReadOnlyList<string> kinds,
        int? limit,
        int? activeMinutes,
        int? messageLimit,
        string? search,
        string? scope,
        string? mode,
        SessionListToolResult result,
        CancellationToken cancellationToken,
        string? requestId = null
    )
    {
        var builder = new StringBuilder();
        builder.Append("{");
        builder.Append($"\"requestId\":\"{EscapeJson(requestId ?? string.Empty)}\",");
        builder.Append("\"type\":\"sessions_list_result\",");
        if (limit.HasValue)
        {
            builder.Append($"\"limit\":{limit.Value},");
        }

        if (activeMinutes.HasValue)
        {
            builder.Append($"\"activeMinutes\":{activeMinutes.Value},");
        }

        if (messageLimit.HasValue)
        {
            builder.Append($"\"messageLimit\":{messageLimit.Value},");
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            builder.Append($"\"search\":\"{EscapeJson(search.Trim())}\",");
        }

        if (!string.IsNullOrWhiteSpace(scope))
        {
            builder.Append($"\"scope\":\"{EscapeJson(scope.Trim())}\",");
        }

        if (!string.IsNullOrWhiteSpace(mode))
        {
            builder.Append($"\"mode\":\"{EscapeJson(mode.Trim())}\",");
        }

        builder.Append("\"kinds\":[");
        for (var i = 0; i < kinds.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            builder.Append($"\"{EscapeJson(kinds[i])}\"");
        }

        builder.Append("],");
        builder.Append($"\"count\":{result.Count},");
        builder.Append("\"sessions\":[");
        for (var i = 0; i < result.Sessions.Count; i++)
        {
            var item = result.Sessions[i];
            if (i > 0)
            {
                builder.Append(",");
            }

            builder.Append("{");
            builder.Append($"\"key\":\"{EscapeJson(item.Key)}\",");
            builder.Append($"\"kind\":\"{EscapeJson(item.Kind)}\",");
            builder.Append($"\"scope\":\"{EscapeJson(item.Scope)}\",");
            builder.Append($"\"mode\":\"{EscapeJson(item.Mode)}\",");
            builder.Append($"\"label\":\"{EscapeJson(item.Label)}\",");
            builder.Append($"\"displayName\":\"{EscapeJson(item.DisplayName)}\",");
            builder.Append($"\"project\":\"{EscapeJson(item.Project)}\",");
            builder.Append($"\"category\":\"{EscapeJson(item.Category)}\",");
            builder.Append($"\"updatedAt\":{item.UpdatedAt},");
            builder.Append($"\"messageCount\":{item.MessageCount},");
            builder.Append($"\"preview\":\"{EscapeJson(item.Preview)}\",");
            builder.Append("\"tags\":[");
            for (var j = 0; j < item.Tags.Count; j++)
            {
                if (j > 0)
                {
                    builder.Append(",");
                }

                builder.Append($"\"{EscapeJson(item.Tags[j])}\"");
            }

            builder.Append("],");
            builder.Append("\"linkedMemoryNotes\":[");
            for (var j = 0; j < item.LinkedMemoryNotes.Count; j++)
            {
                if (j > 0)
                {
                    builder.Append(",");
                }

                builder.Append($"\"{EscapeJson(item.LinkedMemoryNotes[j])}\"");
            }

            builder.Append("],");
            builder.Append("\"messages\":[");
            for (var j = 0; j < item.Messages.Count; j++)
            {
                var message = item.Messages[j];
                if (j > 0)
                {
                    builder.Append(",");
                }

                builder.Append("{");
                builder.Append($"\"role\":\"{EscapeJson(message.Role)}\",");
                builder.Append($"\"text\":\"{EscapeJson(message.Text)}\",");
                builder.Append($"\"createdUtc\":\"{EscapeJson(message.CreatedUtc)}\"");
                builder.Append("}");
            }

            builder.Append("]");
            builder.Append("}");
        }

        builder.Append("]");
        builder.Append("}");
        await SendTextAsync(socket, sendLock, builder.ToString(), cancellationToken);
    }

    private async Task SendSessionsHistoryResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string? requestedSessionKey,
        int? limit,
        bool? includeTools,
        SessionHistoryToolResult result,
        CancellationToken cancellationToken,
        string? requestId = null
    )
    {
        var builder = new StringBuilder();
        builder.Append("{");
        builder.Append($"\"requestId\":\"{EscapeJson(requestId ?? string.Empty)}\",");
        builder.Append("\"type\":\"sessions_history_result\",");
        builder.Append($"\"sessionKey\":\"{EscapeJson(result.SessionKey)}\",");
        builder.Append($"\"requestedSessionKey\":\"{EscapeJson((requestedSessionKey ?? string.Empty).Trim())}\",");
        if (limit.HasValue)
        {
            builder.Append($"\"limit\":{limit.Value},");
        }

        if (includeTools.HasValue)
        {
            builder.Append($"\"includeTools\":{(includeTools.Value ? "true" : "false")},");
        }

        builder.Append($"\"status\":\"{EscapeJson(result.Status)}\",");
        if (!string.IsNullOrWhiteSpace(result.Error))
        {
            builder.Append($"\"error\":\"{EscapeJson(result.Error)}\",");
        }

        builder.Append($"\"count\":{result.Count},");
        builder.Append($"\"truncated\":{(result.Truncated ? "true" : "false")},");
        builder.Append($"\"droppedMessages\":{(result.DroppedMessages ? "true" : "false")},");
        builder.Append($"\"contentTruncated\":{(result.ContentTruncated ? "true" : "false")},");
        builder.Append($"\"contentRedacted\":{(result.ContentRedacted ? "true" : "false")},");
        builder.Append($"\"bytes\":{result.Bytes},");
        builder.Append("\"messages\":[");
        for (var i = 0; i < result.Messages.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            var message = result.Messages[i];
            builder.Append("{");
            builder.Append($"\"role\":\"{EscapeJson(message.Role)}\",");
            builder.Append($"\"text\":\"{EscapeJson(message.Text)}\",");
            builder.Append($"\"createdUtc\":\"{EscapeJson(message.CreatedUtc)}\"");
            builder.Append("}");
        }

        builder.Append("]");
        builder.Append("}");
        await SendTextAsync(socket, sendLock, builder.ToString(), cancellationToken);
    }

    private async Task SendSessionsSendResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string? requestedSessionKey,
        int? timeoutSeconds,
        SessionSendToolResult result,
        CancellationToken cancellationToken,
        string? requestId = null
    )
    {
        var builder = new StringBuilder();
        builder.Append("{");
        builder.Append($"\"requestId\":\"{EscapeJson(requestId ?? string.Empty)}\",");
        builder.Append("\"type\":\"sessions_send_result\",");
        builder.Append($"\"sessionKey\":\"{EscapeJson(result.SessionKey)}\",");
        builder.Append($"\"requestedSessionKey\":\"{EscapeJson((requestedSessionKey ?? string.Empty).Trim())}\",");
        builder.Append($"\"timeoutSeconds\":{result.TimeoutSeconds},");
        if (timeoutSeconds.HasValue)
        {
            builder.Append($"\"requestedTimeoutSeconds\":{timeoutSeconds.Value},");
        }

        builder.Append($"\"status\":\"{EscapeJson(result.Status)}\",");
        builder.Append($"\"runId\":\"{EscapeJson(result.RunId)}\",");
        builder.Append($"\"messageTruncated\":{(result.MessageTruncated ? "true" : "false")}");
        if (!string.IsNullOrWhiteSpace(result.Reply))
        {
            builder.Append($",\"reply\":\"{EscapeJson(result.Reply)}\"");
        }

        if (!string.IsNullOrWhiteSpace(result.Error))
        {
            builder.Append($",\"error\":\"{EscapeJson(result.Error)}\"");
        }

        if (string.Equals(result.Status, "ok", StringComparison.OrdinalIgnoreCase)
            || string.Equals(result.Status, "accepted", StringComparison.OrdinalIgnoreCase))
        {
            builder.Append(",\"delivery\":{\"status\":\"pending\",\"mode\":\"announce\"}");
        }

        builder.Append("}");
        await SendTextAsync(socket, sendLock, builder.ToString(), cancellationToken);
    }

    private async Task SendSessionsSpawnResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string requestedTask,
        string? requestedLabel,
        string? requestedRuntime,
        int? requestedRunTimeoutSeconds,
        int? requestedTimeoutSeconds,
        bool? requestedThread,
        string? requestedMode,
        SessionSpawnToolResult result,
        CancellationToken cancellationToken,
        string? requestId = null
    )
    {
        var builder = new StringBuilder();
        builder.Append("{");
        builder.Append($"\"requestId\":\"{EscapeJson(requestId ?? string.Empty)}\",");
        builder.Append("\"type\":\"sessions_spawn_result\",");
        builder.Append($"\"task\":\"{EscapeJson(requestedTask)}\",");
        if (!string.IsNullOrWhiteSpace(requestedLabel))
        {
            builder.Append($"\"label\":\"{EscapeJson(requestedLabel.Trim())}\",");
        }

        if (!string.IsNullOrWhiteSpace(requestedRuntime))
        {
            builder.Append($"\"requestedRuntime\":\"{EscapeJson(requestedRuntime.Trim())}\",");
        }

        if (!string.IsNullOrWhiteSpace(requestedMode))
        {
            builder.Append($"\"requestedMode\":\"{EscapeJson(requestedMode.Trim())}\",");
        }

        if (requestedRunTimeoutSeconds.HasValue)
        {
            builder.Append($"\"requestedRunTimeoutSeconds\":{requestedRunTimeoutSeconds.Value},");
        }

        if (requestedTimeoutSeconds.HasValue)
        {
            builder.Append($"\"requestedTimeoutSeconds\":{requestedTimeoutSeconds.Value},");
        }

        if (requestedThread.HasValue)
        {
            builder.Append($"\"requestedThread\":{(requestedThread.Value ? "true" : "false")},");
        }

        builder.Append($"\"status\":\"{EscapeJson(result.Status)}\",");
        builder.Append($"\"runId\":\"{EscapeJson(result.RunId)}\",");
        builder.Append($"\"childSessionKey\":\"{EscapeJson(result.ChildSessionKey)}\",");
        builder.Append($"\"mode\":\"{EscapeJson(result.Mode)}\",");
        builder.Append($"\"runtime\":\"{EscapeJson(result.Runtime)}\",");
        builder.Append($"\"runTimeoutSeconds\":{result.RunTimeoutSeconds},");
        builder.Append($"\"thread\":{(result.Thread ? "true" : "false")},");
        builder.Append($"\"taskTruncated\":{(result.TaskTruncated ? "true" : "false")},");
        builder.Append($"\"followUpStatus\":\"{EscapeJson(result.FollowUpStatus)}\",");
        builder.Append($"\"followUpAction\":\"{EscapeJson(result.FollowUpAction)}\"");
        if (!string.IsNullOrWhiteSpace(result.BackendSessionId))
        {
            builder.Append($",\"backendSessionId\":\"{EscapeJson(result.BackendSessionId)}\"");
        }

        if (!string.IsNullOrWhiteSpace(result.ThreadBindingKey))
        {
            builder.Append($",\"threadBindingKey\":\"{EscapeJson(result.ThreadBindingKey)}\"");
        }

        if (!string.IsNullOrWhiteSpace(result.CommandPriority))
        {
            builder.Append($",\"commandPriority\":\"{EscapeJson(result.CommandPriority)}\"");
        }

        if (!string.IsNullOrWhiteSpace(result.Note))
        {
            builder.Append($",\"note\":\"{EscapeJson(result.Note)}\"");
        }

        if (!string.IsNullOrWhiteSpace(result.Error))
        {
            builder.Append($",\"error\":\"{EscapeJson(result.Error)}\"");
        }

        builder.Append("}");
        await SendTextAsync(socket, sendLock, builder.ToString(), cancellationToken);
    }

    private async Task SendSessionsSpawnStatusResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        SessionSpawnQueueStatus result,
        CancellationToken cancellationToken,
        string? requestId = null
    )
    {
        var builder = new StringBuilder();
        builder.Append("{");
        builder.Append($"\"requestId\":\"{EscapeJson(requestId ?? string.Empty)}\",");
        builder.Append("\"type\":\"sessions_spawn_result\",");
        builder.Append("\"action\":\"status\",");
        builder.Append($"\"breakerBlocked\":{(result.BreakerBlocked ? "true" : "false")},");
        builder.Append($"\"breakerReason\":\"{EscapeJson(result.BreakerReason)}\",");
        if (string.IsNullOrWhiteSpace(result.BreakerMessage))
        {
            builder.Append("\"breakerMessage\":null,");
        }
        else
        {
            builder.Append($"\"breakerMessage\":\"{EscapeJson(result.BreakerMessage)}\",");
        }

        builder.Append("\"queue\":");
        if (result.Queue == null)
        {
            builder.Append("null");
        }
        else
        {
            var queue = result.Queue;
            builder.Append("{");
            builder.Append($"\"total\":{queue.Total},");
            builder.Append($"\"ready\":{queue.Ready},");
            builder.Append("\"nextAttemptUtc\":");
            if (queue.NextAttemptUtc.HasValue)
            {
                builder.Append($"\"{EscapeJson(queue.NextAttemptUtc.Value.ToUniversalTime().ToString("O"))}\"");
            }
            else
            {
                builder.Append("null");
            }

            builder.Append(",");
            AppendNullableJsonString(builder, "nextEntryId", queue.NextEntryId);
            builder.Append(",");
            AppendNullableJsonString(builder, "nextReason", queue.NextReason);
            builder.Append(",");
            AppendNullableJsonString(builder, "nextError", queue.NextError);
            builder.Append($",\"nextAttemptCount\":{queue.NextAttemptCount}");
            builder.Append($",\"nearDeadLetterCount\":{queue.NearDeadLetterCount}");
            builder.Append("}");
        }

        builder.Append(",\"active\":");
        if (result.Active == null)
        {
            builder.Append("null");
        }
        else
        {
            var active = result.Active;
            builder.Append("{");
            builder.Append($"\"activeCount\":{active.ActiveCount},");
            AppendNullableJsonString(builder, "oldestRunId", active.OldestRunId);
            builder.Append(",");
            AppendNullableJsonString(builder, "oldestRuntime", active.OldestRuntime);
            builder.Append(",");
            AppendNullableJsonString(builder, "oldestMode", active.OldestMode);
            builder.Append(",");
            AppendNullableJsonString(builder, "oldestBackend", active.OldestBackend);
            builder.Append(",\"oldestStartedUtc\":");
            if (active.OldestStartedUtc.HasValue)
            {
                builder.Append($"\"{EscapeJson(active.OldestStartedUtc.Value.ToUniversalTime().ToString("O"))}\"");
            }
            else
            {
                builder.Append("null");
            }

            builder.Append($",\"oldestAgeSeconds\":{(active.OldestAgeSeconds.HasValue ? active.OldestAgeSeconds.Value.ToString(CultureInfo.InvariantCulture) : "null")}");
            builder.Append($",\"completedHistoryCount\":{active.CompletedHistoryCount}");
            builder.Append("}");
        }

        builder.Append(",\"watchdog\":");
        AgentSpawnWatchdogWsJson.Append(builder, result.Watchdog);
        builder.Append("}");
        await SendTextAsync(socket, sendLock, builder.ToString(), cancellationToken);
    }

    private async Task SendBrowserResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string requestedAction,
        string? requestedUrl,
        string? requestedProfile,
        string? requestedTargetId,
        int? requestedLimit,
        BrowserToolResult result,
        CancellationToken cancellationToken,
        string? requestId = null
    )
    {
        var builder = new StringBuilder();
        builder.Append("{");
        builder.Append($"\"requestId\":\"{EscapeJson(requestId ?? string.Empty)}\",");
        builder.Append("\"type\":\"browser_result\",");
        builder.Append($"\"requestedAction\":\"{EscapeJson(requestedAction)}\",");
        builder.Append($"\"action\":\"{EscapeJson(result.Action)}\",");
        builder.Append($"\"profile\":\"{EscapeJson(result.Profile)}\",");
        if (!string.IsNullOrWhiteSpace(requestedProfile))
        {
            builder.Append($"\"requestedProfile\":\"{EscapeJson(requestedProfile.Trim())}\",");
        }

        if (!string.IsNullOrWhiteSpace(requestedUrl))
        {
            builder.Append($"\"requestedUrl\":\"{EscapeJson(requestedUrl)}\",");
        }

        if (!string.IsNullOrWhiteSpace(requestedTargetId))
        {
            builder.Append($"\"requestedTargetId\":\"{EscapeJson(requestedTargetId.Trim())}\",");
        }

        if (requestedLimit.HasValue)
        {
            builder.Append($"\"limit\":{requestedLimit.Value},");
        }

        builder.Append($"\"ok\":{(result.Ok ? "true" : "false")},");
        builder.Append($"\"disabled\":{(result.Disabled ? "true" : "false")},");
        builder.Append($"\"adapter\":\"{EscapeJson(result.Adapter)}\",");
        builder.Append($"\"running\":{(result.Running ? "true" : "false")},");
        if (!string.IsNullOrWhiteSpace(result.ActiveTargetId))
        {
            builder.Append($"\"activeTargetId\":\"{EscapeJson(result.ActiveTargetId)}\",");
        }

        if (!string.IsNullOrWhiteSpace(result.ActiveUrl))
        {
            builder.Append($"\"activeUrl\":\"{EscapeJson(result.ActiveUrl)}\",");
        }

        builder.Append("\"tabs\":[");
        for (var i = 0; i < result.Tabs.Count; i++)
        {
            var tab = result.Tabs[i];
            if (i > 0)
            {
                builder.Append(",");
            }

            builder.Append("{");
            builder.Append($"\"targetId\":\"{EscapeJson(tab.TargetId)}\",");
            builder.Append($"\"url\":\"{EscapeJson(tab.Url)}\",");
            builder.Append($"\"title\":\"{EscapeJson(tab.Title)}\",");
            builder.Append($"\"active\":{(tab.Active ? "true" : "false")},");
            builder.Append($"\"updatedAtMs\":{tab.UpdatedAtMs}");
            builder.Append("}");
        }

        builder.Append("]");
        if (result.Snapshot is { } frame)
        {
            builder.Append(",\"snapshot\":{");
            builder.Append($"\"snapshotId\":\"{EscapeJson(frame.SnapshotId)}\",\"format\":\"{EscapeJson(frame.Format)}\",");
            builder.Append($"\"width\":{frame.Width},\"height\":{frame.Height},\"updatedAtMs\":{frame.UpdatedAtMs},");
            builder.Append($"\"dataUrl\":\"{EscapeJson(frame.DataUrl)}\"}}");
        }
        if (!string.IsNullOrWhiteSpace(result.Error))
        {
            builder.Append($",\"error\":\"{EscapeJson(result.Error)}\"");
        }

        builder.Append("}");
        await SendTextAsync(socket, sendLock, builder.ToString(), cancellationToken);
    }

    private async Task SendCanvasResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string requestedAction,
        string? requestedTarget,
        string? requestedUrl,
        string? requestedProfile,
        string? requestedOutputFormat,
        int? requestedMaxWidth,
        CanvasToolResult result,
        CancellationToken cancellationToken,
        string? requestId = null
    )
    {
        var builder = new StringBuilder();
        builder.Append("{");
        builder.Append($"\"requestId\":\"{EscapeJson(requestId ?? string.Empty)}\",");
        builder.Append("\"type\":\"canvas_result\",");
        builder.Append($"\"requestedAction\":\"{EscapeJson(requestedAction)}\",");
        builder.Append($"\"action\":\"{EscapeJson(result.Action)}\",");
        builder.Append($"\"profile\":\"{EscapeJson(result.Profile)}\",");
        if (!string.IsNullOrWhiteSpace(requestedProfile))
        {
            builder.Append($"\"requestedProfile\":\"{EscapeJson(requestedProfile.Trim())}\",");
        }

        if (!string.IsNullOrWhiteSpace(requestedTarget))
        {
            builder.Append($"\"requestedTarget\":\"{EscapeJson(requestedTarget)}\",");
        }

        if (!string.IsNullOrWhiteSpace(requestedUrl))
        {
            builder.Append($"\"requestedUrl\":\"{EscapeJson(requestedUrl)}\",");
        }

        if (!string.IsNullOrWhiteSpace(requestedOutputFormat))
        {
            builder.Append($"\"requestedOutputFormat\":\"{EscapeJson(requestedOutputFormat.Trim())}\",");
        }

        if (requestedMaxWidth.HasValue)
        {
            builder.Append($"\"requestedMaxWidth\":{requestedMaxWidth.Value},");
        }

        builder.Append($"\"ok\":{(result.Ok ? "true" : "false")},");
        builder.Append($"\"disabled\":{(result.Disabled ? "true" : "false")},");
        builder.Append($"\"adapter\":\"{EscapeJson(result.Adapter)}\",");
        builder.Append($"\"visible\":{(result.Visible ? "true" : "false")},");
        if (!string.IsNullOrWhiteSpace(result.Target))
        {
            builder.Append($"\"target\":\"{EscapeJson(result.Target)}\",");
        }

        if (!string.IsNullOrWhiteSpace(result.Url))
        {
            builder.Append($"\"url\":\"{EscapeJson(result.Url)}\",");
        }

        if (result.EvalResult is not null)
        {
            builder.Append($"\"evalResult\":\"{EscapeJson(result.EvalResult)}\",");
        }

        builder.Append($"\"a2uiRevision\":{result.A2UiRevision},");
        builder.Append($"\"updatedAtMs\":{result.UpdatedAtMs}");
        if (result.Snapshot is not null)
        {
            builder.Append(",\"snapshot\":{");
            builder.Append($"\"snapshotId\":\"{EscapeJson(result.Snapshot.SnapshotId)}\",");
            builder.Append($"\"format\":\"{EscapeJson(result.Snapshot.Format)}\",");
            builder.Append($"\"width\":{result.Snapshot.Width},");
            builder.Append($"\"height\":{result.Snapshot.Height},");
            builder.Append($"\"updatedAtMs\":{result.Snapshot.UpdatedAtMs}");
            if (result.Snapshot.DataUrl is { } dataUrl) builder.Append($",\"dataUrl\":\"{EscapeJson(dataUrl)}\"");
            builder.Append("}");
        }

        if (result.ActionEvents is { Count: > 0 } events)
        {
            builder.Append(",\"actionEvents\":[");
            builder.Append(string.Join(",", events.Select(item => item.GetRawText())));
            builder.Append("]");
        }

        if (!string.IsNullOrWhiteSpace(result.Error))
        {
            builder.Append($",\"error\":\"{EscapeJson(result.Error)}\"");
        }

        builder.Append("}");
        await SendTextAsync(socket, sendLock, builder.ToString(), cancellationToken);
    }

    private async Task SendWebSearchResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string query,
        int? count,
        string? freshness,
        WebSearchToolResult result,
        CancellationToken cancellationToken,
        string? requestId = null
    )
    {
        var builder = new StringBuilder();
        builder.Append("{");
        builder.Append($"\"requestId\":\"{EscapeJson(requestId ?? string.Empty)}\",");
        builder.Append("\"type\":\"web_search_result\",");
        builder.Append($"\"query\":\"{EscapeJson(query)}\",");
        builder.Append($"\"provider\":\"{EscapeJson(result.Provider)}\",");
        builder.Append($"\"disabled\":{(result.Disabled ? "true" : "false")},");
        if (count.HasValue)
        {
            builder.Append($"\"count\":{count.Value},");
        }

        if (!string.IsNullOrWhiteSpace(freshness))
        {
            builder.Append($"\"freshness\":\"{EscapeJson(freshness.Trim())}\",");
        }

        builder.Append("\"results\":[");
        for (var i = 0; i < result.Results.Count; i++)
        {
            var item = result.Results[i];
            if (i > 0)
            {
                builder.Append(",");
            }

            builder.Append("{");
            builder.Append($"\"title\":\"{EscapeJson(item.Title)}\",");
            builder.Append($"\"url\":\"{EscapeJson(item.Url)}\",");
            builder.Append($"\"description\":\"{EscapeJson(item.Description)}\",");
            builder.Append($"\"citationId\":\"{EscapeJson(NormalizeWebSearchCitationId(item.CitationId, i + 1))}\"");
            if (!string.IsNullOrWhiteSpace(item.Published))
            {
                builder.Append($",\"published\":\"{EscapeJson(item.Published)}\"");
            }

            builder.Append("}");
        }

        builder.Append("]");
        if (result.ExternalContent is not null)
        {
            builder.Append(",\"externalContent\":{");
            builder.Append($"\"untrusted\":{(result.ExternalContent.Untrusted ? "true" : "false")},");
            builder.Append($"\"source\":\"{EscapeJson(result.ExternalContent.Source)}\",");
            builder.Append($"\"provider\":\"{EscapeJson(result.ExternalContent.Provider)}\",");
            builder.Append($"\"wrapped\":{(result.ExternalContent.Wrapped ? "true" : "false")}");
            builder.Append("}");
        }

        if (!string.IsNullOrWhiteSpace(result.Error))
        {
            builder.Append($",\"error\":\"{EscapeJson(result.Error)}\"");
        }

        var guardCategory = NormalizeWebSearchGuardCategory(result.GuardFailure);
        var guardReason = NormalizeWebSearchGuardReason(result.GuardFailure);
        var guardDetail = NormalizeWebSearchGuardDetail(result.GuardFailure);
        builder.Append($",\"guardCategory\":\"{EscapeJson(guardCategory)}\"");
        builder.Append($",\"guardReason\":\"{EscapeJson(guardReason)}\"");
        builder.Append($",\"guardDetail\":\"{EscapeJson(guardDetail)}\"");
        builder.Append($",\"retryAttempt\":{Math.Max(0, result.RetryAttempt)}");
        builder.Append($",\"retryMaxAttempts\":{Math.Max(0, result.RetryMaxAttempts)}");
        builder.Append($",\"retryStopReason\":\"{EscapeJson(NormalizeWebSearchRetryStopReason(result.RetryStopReason))}\"");
        AppendRetryDirectiveJson(builder, result.GuardFailure);

        builder.Append("}");
        await SendTextAsync(socket, sendLock, builder.ToString(), cancellationToken);
    }

    private async Task SendWebFetchResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string requestedUrl,
        string? requestedExtractMode,
        int? requestedMaxChars,
        WebFetchToolResult result,
        CancellationToken cancellationToken,
        string? requestId = null
    )
    {
        var builder = new StringBuilder();
        builder.Append("{");
        builder.Append($"\"requestId\":\"{EscapeJson(requestId ?? string.Empty)}\",");
        builder.Append("\"type\":\"web_fetch_result\",");
        builder.Append($"\"url\":\"{EscapeJson(result.Url)}\",");
        builder.Append($"\"requestedUrl\":\"{EscapeJson(requestedUrl)}\",");
        builder.Append($"\"disabled\":{(result.Disabled ? "true" : "false")},");
        builder.Append($"\"extractMode\":\"{EscapeJson(result.ExtractMode)}\",");
        if (!string.IsNullOrWhiteSpace(requestedExtractMode))
        {
            builder.Append($"\"requestedExtractMode\":\"{EscapeJson(requestedExtractMode.Trim())}\",");
        }

        if (requestedMaxChars.HasValue)
        {
            builder.Append($"\"maxChars\":{requestedMaxChars.Value},");
        }

        if (!string.IsNullOrWhiteSpace(result.FinalUrl))
        {
            builder.Append($"\"finalUrl\":\"{EscapeJson(result.FinalUrl)}\",");
        }

        if (result.Status.HasValue)
        {
            builder.Append($"\"status\":{result.Status.Value},");
        }

        if (!string.IsNullOrWhiteSpace(result.ContentType))
        {
            builder.Append($"\"contentType\":\"{EscapeJson(result.ContentType)}\",");
        }

        builder.Append($"\"truncated\":{(result.Truncated ? "true" : "false")},");
        builder.Append($"\"length\":{result.Length},");
        builder.Append($"\"text\":\"{EscapeJson(result.Text)}\"");
        if (result.ExternalContent is not null)
        {
            builder.Append(",\"externalContent\":{");
            builder.Append($"\"untrusted\":{(result.ExternalContent.Untrusted ? "true" : "false")},");
            builder.Append($"\"source\":\"{EscapeJson(result.ExternalContent.Source)}\",");
            builder.Append($"\"provider\":\"{EscapeJson(result.ExternalContent.Provider)}\",");
            builder.Append($"\"wrapped\":{(result.ExternalContent.Wrapped ? "true" : "false")}");
            builder.Append("}");
        }

        if (!string.IsNullOrWhiteSpace(result.Error))
        {
            builder.Append($",\"error\":\"{EscapeJson(result.Error)}\"");
        }

        builder.Append("}");
        await SendTextAsync(socket, sendLock, builder.ToString(), cancellationToken);
    }

}

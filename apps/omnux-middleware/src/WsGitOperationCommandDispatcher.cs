using System.Net.WebSockets;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class WsGitOperationCommandDispatcher
{
    private readonly GitOperationPreviewService _previewService;
    private readonly GitOperationExecutor _executor;

    public WsGitOperationCommandDispatcher(
        GitOperationPreviewService previewService,
        GitOperationExecutor executor
    )
    {
        _previewService = previewService;
        _executor = executor;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type == "git_operation_preview")
        {
            if (!TryBuildPreviewRequest(message.RawJson, out var request, out var errorMessage))
            {
                await SendErrorAsync(socket, sendLock, errorMessage, cancellationToken).ConfigureAwait(false);
                return true;
            }

            var result = await _previewService.PreviewAsync(request, cancellationToken).ConfigureAwait(false);
            await SendPreviewResultAsync(socket, sendLock, result, cancellationToken).ConfigureAwait(false);
            return true;
        }

        if (message.Type == "git_operation_apply")
        {
            if (!TryBuildApplyRequest(message.RawJson, out var request, out var errorMessage))
            {
                await SendErrorAsync(socket, sendLock, errorMessage, cancellationToken).ConfigureAwait(false);
                return true;
            }

            var result = await _previewService.ApplyAsync(request, _executor, cancellationToken)
                .ConfigureAwait(false);
            await SendApplyResultAsync(socket, sendLock, result, cancellationToken).ConfigureAwait(false);
            return true;
        }

        return false;
    }

    internal static bool TryBuildPreviewRequest(
        string rawJson,
        out GitOperationPreviewRequest request,
        out string errorMessage
    )
    {
        request = new GitOperationPreviewRequest(string.Empty, string.Empty, string.Empty, Array.Empty<string>());
        errorMessage = string.Empty;
        if (!TryGetCommandRoot(rawJson, out var root, out var document))
        {
            errorMessage = "invalid git_operation_preview payload";
            return false;
        }

        using (document)
        {
            var operation = ReadString(root, "operation");
            if (string.IsNullOrWhiteSpace(operation))
            {
                errorMessage = "operation is required";
                return false;
            }

            request = new GitOperationPreviewRequest(
                operation,
                ReadString(root, "branchName"),
                ReadString(root, "commitMessage"),
                ReadStringArray(root, "paths", "selectedPaths"),
                ReadString(root, "remoteName"),
                ReadString(root, "remoteBranchName"),
                ReadBool(root, "setUpstream") ?? false
            );
            return true;
        }
    }

    internal static bool TryBuildApplyRequest(
        string rawJson,
        out GitOperationApplyRequest request,
        out string errorMessage
    )
    {
        request = new GitOperationApplyRequest(string.Empty, string.Empty, string.Empty);
        errorMessage = string.Empty;
        if (!TryGetCommandRoot(rawJson, out var root, out var document))
        {
            errorMessage = "invalid git_operation_apply payload";
            return false;
        }

        using (document)
        {
            var previewId = ReadString(root, "previewId");
            if (string.IsNullOrWhiteSpace(previewId))
            {
                errorMessage = "previewId is required";
                return false;
            }

            request = new GitOperationApplyRequest(
                previewId,
                ReadString(root, "confirmationToken"),
                ReadRawJson(root, "approval", "approvalPayload")
            );
            return true;
        }
    }

    private static Task SendPreviewResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        GitOperationPreviewResult result,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"git_operation_preview_result\","
            + $"\"payload\":{GitOperationJson.Serialize(result)}"
            + "}",
            cancellationToken
        );
    }

    private static Task SendApplyResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        GitOperationApplyResult result,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"git_operation_apply_result\","
            + $"\"payload\":{GitOperationJson.Serialize(result)}"
            + "}",
            cancellationToken
        );
    }

    private static Task SendErrorAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string message,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            $"{{\"type\":\"error\",\"message\":\"{WebSocketGateway.EscapeJson(message)}\"}}",
            cancellationToken
        );
    }

    private static bool TryGetCommandRoot(
        string rawJson,
        out JsonElement root,
        out JsonDocument document
    )
    {
        root = default;
        document = null!;
        try
        {
            document = JsonDocument.Parse(rawJson ?? string.Empty);
            root = document.RootElement;
            if (TryGetProperty(root, "payload", out var payload) && payload.ValueKind == JsonValueKind.Object)
            {
                root = payload;
            }

            return root.ValueKind == JsonValueKind.Object;
        }
        catch (JsonException)
        {
            document?.Dispose();
            return false;
        }
    }

    private static string ReadString(JsonElement root, string name)
    {
        if (!TryGetProperty(root, name, out var value))
        {
            return string.Empty;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? string.Empty,
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => string.Empty
        };
    }

    private static string ReadRawJson(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!TryGetProperty(root, name, out var value))
            {
                continue;
            }

            return value.ValueKind == JsonValueKind.String
                ? value.GetString() ?? string.Empty
                : value.GetRawText();
        }

        return string.Empty;
    }

    private static IReadOnlyList<string> ReadStringArray(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!TryGetProperty(root, name, out var value))
            {
                continue;
            }

            if (value.ValueKind == JsonValueKind.String)
            {
                var single = value.GetString();
                return string.IsNullOrWhiteSpace(single)
                    ? Array.Empty<string>()
                    : new[] { single };
            }

            if (value.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<string>();
            }

            var items = new List<string>();
            foreach (var item in value.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                {
                    var text = item.GetString();
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        items.Add(text);
                    }
                }
            }

            return items;
        }

        return Array.Empty<string>();
    }

    private static bool? ReadBool(JsonElement root, string name)
    {
        if (!TryGetProperty(root, name, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String when bool.TryParse(value.GetString(), out var parsed) => parsed,
            _ => null
        };
    }

    private static bool TryGetProperty(JsonElement root, string name, out JsonElement value)
    {
        if (root.TryGetProperty(name, out value))
        {
            return true;
        }

        foreach (var property in root.EnumerateObject())
        {
            if (property.NameEquals(name)
                || string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }
}

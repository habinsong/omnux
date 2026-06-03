using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class GitOperationJson
{
    private static readonly GitOperationJsonContext BaseContext = new(CreateOptions(indented: false));
    private static readonly GitOperationJsonContext IndentedContext = new(CreateOptions(indented: true));

    public static string Serialize(GitOperationPreviewResult result, bool indented = false)
    {
        return JsonSerializer.Serialize(result, (indented ? IndentedContext : BaseContext).GitOperationPreviewResult);
    }

    public static string Serialize(GitOperationApplyResult result, bool indented = false)
    {
        return JsonSerializer.Serialize(result, (indented ? IndentedContext : BaseContext).GitOperationApplyResult);
    }

    public static string Serialize(GitOperationPreviewState state, bool indented = false)
    {
        return JsonSerializer.Serialize(state, (indented ? IndentedContext : BaseContext).GitOperationPreviewState);
    }

    public static string Serialize(GitOperationApprovalPayload payload, bool indented = false)
    {
        return JsonSerializer.Serialize(payload, (indented ? IndentedContext : BaseContext).GitOperationApprovalPayload);
    }

    public static GitOperationPreviewState? DeserializeState(string json)
    {
        return JsonSerializer.Deserialize(json, BaseContext.GitOperationPreviewState);
    }

    public static GitOperationApprovalPayload? DeserializeApprovalPayload(string json)
    {
        return JsonSerializer.Deserialize(json, BaseContext.GitOperationApprovalPayload);
    }

    private static JsonSerializerOptions CreateOptions(bool indented)
    {
        return new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            WriteIndented = indented,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };
    }
}

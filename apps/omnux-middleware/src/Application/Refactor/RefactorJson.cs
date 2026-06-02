using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class RefactorJson
{
    private static readonly RefactorJsonContext BaseContext = new(CreateOptions(indented: false));
    private static readonly RefactorJsonContext IndentedContext = new(CreateOptions(indented: true));

    public static string Serialize(RefactorActionResult result, bool indented = false)
    {
        return JsonSerializer.Serialize(result, (indented ? IndentedContext : BaseContext).RefactorActionResult);
    }

    public static string Serialize(RefactorPreviewRecord record, bool indented = false)
    {
        return JsonSerializer.Serialize(record, (indented ? IndentedContext : BaseContext).RefactorPreviewRecord);
    }

    public static string Serialize(RefactorRollbackRecord record, bool indented = false)
    {
        return JsonSerializer.Serialize(record, (indented ? IndentedContext : BaseContext).RefactorRollbackRecord);
    }

    public static RefactorPreviewRecord? DeserializePreviewRecord(string json)
    {
        return JsonSerializer.Deserialize(json, BaseContext.RefactorPreviewRecord);
    }

    public static RefactorRollbackRecord? DeserializeRollbackRecord(string json)
    {
        return JsonSerializer.Deserialize(json, BaseContext.RefactorRollbackRecord);
    }

    public static AnchorEditRequest[] DeserializeEdits(string json)
    {
        return JsonSerializer.Deserialize(json, BaseContext.AnchorEditRequestArray) ?? Array.Empty<AnchorEditRequest>();
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

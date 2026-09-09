using System.Text;
using System.Text.Json;

namespace Omnux.Middleware;

/// <summary>
/// 훅 표준 입력 JSON 생성. 문자열 이어붙이기를 쓰지 않고 Utf8JsonWriter 로만 만든다.
/// 탭·제어 문자가 포함된 명령/프롬프트에서도 유효한 JSON 을 보장한다.
/// </summary>
internal static class HookEventJson
{
    public static string Serialize(HookEventInput input)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, new JsonWriterOptions { Indented = false }))
        {
            writer.WriteStartObject();
            writer.WriteString("event", input.Event);
            writer.WriteString("sessionId", input.SessionId);
            writer.WriteString("cwd", input.Cwd);

            if (input.ToolName.Length > 0)
            {
                writer.WriteString("toolName", input.ToolName);
            }

            if (input.FilePath.Length > 0)
            {
                writer.WriteString("filePath", input.FilePath);
            }

            if (input.Command.Length > 0)
            {
                writer.WriteString("command", input.Command);
            }

            if (input.Prompt.Length > 0)
            {
                writer.WriteString("prompt", input.Prompt);
            }

            WriteToolInput(writer, input.ToolInputJson);
            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>도구 입력 원문을 보존한다. 유효한 JSON 객체가 아니면 문자열로 전달하고 표시한다.</summary>
    private static void WriteToolInput(Utf8JsonWriter writer, string toolInputJson)
    {
        var text = (toolInputJson ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return;
        }

        if (text[0] == '{' || text[0] == '[')
        {
            try
            {
                using var document = JsonDocument.Parse(text);
                writer.WritePropertyName("toolInput");
                document.RootElement.WriteTo(writer);
                return;
            }
            catch (JsonException)
            {
                // 아래에서 원문 문자열로 전달한다.
            }
        }

        writer.WriteString("toolInputRaw", text);
    }
}

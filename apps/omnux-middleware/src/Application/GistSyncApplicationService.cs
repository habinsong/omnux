using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

public sealed record GistFile(
    [property: JsonPropertyName("content")] string Content
);

public sealed record GistCreateRequest(
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("public")] bool IsPublic,
    [property: JsonPropertyName("files")] Dictionary<string, GistFile> Files
);

public sealed record GistUpdateRequest(
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("files")] Dictionary<string, GistFile> Files
);

public sealed record GistResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("files")] Dictionary<string, GistFileResponse> Files
);

public sealed record GistFileResponse(
    [property: JsonPropertyName("content")] string? Content,
    [property: JsonPropertyName("truncated")] bool? Truncated,
    [property: JsonPropertyName("raw_url")] string? RawUrl
);

public interface IGistSyncApplicationService
{
    Task<string> UploadBackupToGistAsync(byte[] zipBytes, string gitHubToken, string? existingGistId = null);
    Task<byte[]> DownloadBackupFromGistAsync(string gistId, string gitHubToken);
}

public sealed class GistSyncApplicationService : IGistSyncApplicationService
{
    private readonly HttpClient _httpClient;
    private const string BackupFileName = "omnux-portable-package.b64";

    public GistSyncApplicationService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<string> UploadBackupToGistAsync(byte[] zipBytes, string gitHubToken, string? existingGistId = null)
    {
        var base64 = Convert.ToBase64String(zipBytes);
        var files = new Dictionary<string, GistFile>
        {
            [BackupFileName] = new GistFile(base64)
        };

        using var request = new HttpRequestMessage(
            string.IsNullOrWhiteSpace(existingGistId) ? HttpMethod.Post : HttpMethod.Patch,
            string.IsNullOrWhiteSpace(existingGistId) ? "https://api.github.com/gists" : $"https://api.github.com/gists/{existingGistId}"
        );

        request.Headers.UserAgent.Add(new ProductInfoHeaderValue("Omnux", "1.0"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", gitHubToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));

        string jsonPayload;
        if (string.IsNullOrWhiteSpace(existingGistId))
        {
            var createRequest = new GistCreateRequest("Omnux Portable Backup Sync", false, files);
            jsonPayload = JsonSerializer.Serialize(createRequest, OmniJsonContext.Default.GistCreateRequest);
        }
        else
        {
            var updateRequest = new GistUpdateRequest("Omnux Portable Backup Sync", files);
            jsonPayload = JsonSerializer.Serialize(updateRequest, OmniJsonContext.Default.GistUpdateRequest);
        }

        request.Content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");
        using var response = await _httpClient.SendAsync(request);
        response.EnsureSuccessStatusCode();

        var responseJson = await response.Content.ReadAsStringAsync();
        var gistResponse = JsonSerializer.Deserialize(responseJson, OmniJsonContext.Default.GistResponse);

        if (string.IsNullOrWhiteSpace(gistResponse?.Id))
        {
            throw new InvalidOperationException("GitHub Gist 생성/수정에 성공했으나 Gist ID를 받지 못했습니다.");
        }

        return gistResponse.Id;
    }

    public async Task<byte[]> DownloadBackupFromGistAsync(string gistId, string gitHubToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"https://api.github.com/gists/{gistId}");
        request.Headers.UserAgent.Add(new ProductInfoHeaderValue("Omnux", "1.0"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", gitHubToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));

        using var response = await _httpClient.SendAsync(request);
        response.EnsureSuccessStatusCode();

        var responseJson = await response.Content.ReadAsStringAsync();
        var gistResponse = JsonSerializer.Deserialize(responseJson, OmniJsonContext.Default.GistResponse);

        if (gistResponse?.Files == null || !gistResponse.Files.TryGetValue(BackupFileName, out var backupFile))
        {
            throw new InvalidOperationException($"Gist에서 '{BackupFileName}' 파일을 찾을 수 없습니다.");
        }

        string base64Content;
        if (backupFile.Truncated == true && !string.IsNullOrWhiteSpace(backupFile.RawUrl))
        {
            // If the content is truncated by GitHub API, fetch the raw URL
            using var rawRequest = new HttpRequestMessage(HttpMethod.Get, backupFile.RawUrl);
            rawRequest.Headers.UserAgent.Add(new ProductInfoHeaderValue("Omnux", "1.0"));
            rawRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", gitHubToken);
            using var rawResponse = await _httpClient.SendAsync(rawRequest);
            rawResponse.EnsureSuccessStatusCode();
            base64Content = await rawResponse.Content.ReadAsStringAsync();
        }
        else if (!string.IsNullOrWhiteSpace(backupFile.Content))
        {
            base64Content = backupFile.Content;
        }
        else
        {
            throw new InvalidOperationException($"Gist에서 '{BackupFileName}' 파일의 내용을 가져올 수 없습니다.");
        }

        try
        {
            return Convert.FromBase64String(base64Content.Trim());
        }
        catch (FormatException ex)
        {
            throw new InvalidOperationException("다운로드한 Gist 파일의 형식이 올바른 Base64가 아닙니다.", ex);
        }
    }
}

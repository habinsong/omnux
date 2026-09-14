using System.Net;
using System.Net.Http;

namespace Omnux.Middleware;

/// <summary>
/// 페이지 원문을 받아 올 때 쓰는 HttpClient 를 한 곳에서 만든다.
/// 압축 해제를 켜지 않으면 gzip·brotli 로 내려오는 사이트의 본문이 깨진 바이트 그대로 프롬프트에
/// 실린다(실측: python.org 다운로드 페이지에서 9,783자가 전부 깨진 문자였다).
/// </summary>
internal static class WebFetchHttpClientFactory
{
    public static HttpClient Create(TimeSpan? timeout = null)
    {
        var handler = new HttpClientHandler
        {
            AutomaticDecompression = DecompressionMethods.GZip
                                     | DecompressionMethods.Deflate
                                     | DecompressionMethods.Brotli
        };
        var client = new HttpClient(handler)
        {
            Timeout = timeout ?? TimeSpan.FromSeconds(10)
        };
        client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "omnux/1.0");
        return client;
    }
}

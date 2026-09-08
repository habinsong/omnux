using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodexModelCatalogTests
{
    [Theory]
    [InlineData("gpt-6-astra", true)]
    [InlineData("gpt-5.6-sol", true)]
    [InlineData("gpt-5.4-mini", true)]
    [InlineData("gpt-5.3-codex", true)]
    [InlineData("gpt-image-2", false)]
    [InlineData("text-embedding-3-small", false)]
    public void CodingCatalogIncludesCurrentModelsWithoutImageOrEmbeddingModels(string id, bool expected)
        => Assert.Equal(expected, CodexModelCatalog.IsCodexRelevant(id));
}

using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class MemoryChunkingPolicyTests
{
    [Fact]
    public void ChunkSplitsProjectCSharpByDeclarationBoundaries()
    {
        var content = """
            using System;

            namespace Demo;

            public sealed class Sample
            {
                public Sample()
                {
                }

                public void First()
                {
                    Console.WriteLine("first");
                }

                public void Second()
                {
                    Console.WriteLine("second");
                }
            }
            """;

        var chunks = MemoryChunkingPolicy.Chunk("apps/demo/Sample.cs", "project", content, 400, 80);

        Assert.Contains(chunks, chunk => chunk.Text.Contains("public Sample()", StringComparison.Ordinal));
        Assert.Contains(chunks, chunk => chunk.Text.Contains("public void First()", StringComparison.Ordinal));
        Assert.Contains(chunks, chunk => chunk.Text.Contains("public void Second()", StringComparison.Ordinal));
        Assert.DoesNotContain(chunks, chunk =>
            chunk.Text.Contains("public void First()", StringComparison.Ordinal)
            && chunk.Text.Contains("public void Second()", StringComparison.Ordinal));
    }

    [Fact]
    public void ChunkKeepsSlidingFallbackForMemoryNotes()
    {
        var content = string.Join("\n", Enumerable.Range(1, 80).Select(i => $"line {i:D2}"));

        var chunks = MemoryChunkingPolicy.Chunk("memory-notes/demo.md", "memory", content, 20, 4);

        Assert.True(chunks.Count > 1);
        Assert.Equal(1, chunks[0].StartLine);
        Assert.All(chunks, chunk => Assert.True(chunk.EndLine >= chunk.StartLine));
    }
}

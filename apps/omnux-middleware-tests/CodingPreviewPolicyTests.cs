using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingPreviewPolicyTests
{
    [Theory]
    [InlineData("main.py")]
    [InlineData("App.tsx")]
    [InlineData("main.cpp")]
    [InlineData("Program.cs")]
    [InlineData("main.swift")]
    [InlineData("Cargo.toml")]
    public void SourceFilesCanBeReadAsText(string file)
        => Assert.Equal("text/plain; charset=utf-8", CodingPreviewPolicy.ContentType(file));

    [Theory]
    [InlineData(".env")]
    [InlineData("private.key")]
    [InlineData("certificate.pem")]
    [InlineData("program.exe")]
    public void UnsupportedAndCredentialFilesAreNotServed(string file)
        => Assert.Equal("", CodingPreviewPolicy.ContentType(file));

    [Fact]
    public void PreviewCannotFollowLinksOutsideTheRunDirectory()
    {
        var root = Directory.CreateTempSubdirectory("omnux-preview-").FullName;
        try
        {
            var run = Directory.CreateDirectory(Path.Combine(root, "run")).FullName;
            var outside = Path.Combine(root, "outside.py");
            var inside = Path.Combine(run, "main.py");
            File.WriteAllText(outside, "outside fixture");
            File.WriteAllText(inside, "inside fixture");
            Assert.True(CodingPreviewPolicy.IsRegularFileWithinRun(inside, run));
            Assert.False(CodingPreviewPolicy.IsRegularFileWithinRun(outside, run));
            Assert.True(CodingPreviewPolicy.IsRegularDirectoryWithinRun(run, root));
            Assert.False(CodingPreviewPolicy.IsRegularDirectoryWithinRun(root, run));
            if (!OperatingSystem.IsWindows())
            {
                var link = Path.Combine(run, "linked.py");
                File.CreateSymbolicLink(link, outside);
                Assert.False(CodingPreviewPolicy.IsRegularFileWithinRun(link, run));
                var directoryLink = Path.Combine(root, "linked-run");
                Directory.CreateSymbolicLink(directoryLink, run);
                Assert.False(CodingPreviewPolicy.IsRegularDirectoryWithinRun(directoryLink, root));
            }
        }
        finally { Directory.Delete(root, recursive: true); }
    }
}

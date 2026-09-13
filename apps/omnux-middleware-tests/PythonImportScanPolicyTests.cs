using Omnux.Middleware;
using Xunit;

namespace Omnux.Middleware.Tests;

public class PythonImportScanPolicyTests
{
    [Fact]
    public void ImportLineDoesNotSwallowTheNextLine()
    {
        // 실측 회귀: "import unittest" 다음 줄의 from-import 를 삼켜 median·stdev 를
        // 외부 패키지로 오인하고 pip install 이 실패했다.
        var source = "import unittest\n\nfrom stats import mean, median, stdev\n\n\ndef test():\n    pass\n";

        var modules = PythonImportScanPolicy.ExtractRootModules(source);

        Assert.Contains("unittest", modules);
        Assert.Contains("stats", modules);
        Assert.DoesNotContain("median", modules);
        Assert.DoesNotContain("stdev", modules);
        Assert.DoesNotContain("mean", modules);
    }

    [Fact]
    public void MultipleModulesOnOneImportLineAreAllRead()
    {
        var modules = PythonImportScanPolicy.ExtractRootModules("import os, sys, json\n");

        Assert.Equal(new[] { "json", "os", "sys" }, modules);
    }

    [Fact]
    public void AliasAndDottedPathsCollapseToRootModule()
    {
        var modules = PythonImportScanPolicy.ExtractRootModules(
            "import numpy as np\nfrom concurrent.futures import ThreadPoolExecutor\n"
        );

        Assert.Contains("numpy", modules);
        Assert.Contains("concurrent", modules);
        Assert.DoesNotContain("np", modules);
    }

    [Fact]
    public void IndentedImportsInsideFunctionsAreRead()
    {
        var modules = PythonImportScanPolicy.ExtractRootModules("def load():\n    import requests\n    return requests\n");

        Assert.Contains("requests", modules);
    }

    [Fact]
    public void WordsThatMerelyContainImportAreIgnored()
    {
        var modules = PythonImportScanPolicy.ExtractRootModules("important = 1\nprint('import pygame')\n");

        Assert.Empty(modules);
    }
}

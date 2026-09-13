using System.Text.RegularExpressions;

namespace Omnux.Middleware;

/// <summary>
/// 실행 명령이 어떤 툴체인을 필요로 하는지 알아내고, 없을 때 설치 방법을 알려 준다.
///
/// 없는 툴체인으로 만든 명령은 모델이 스스로 우회 분기를 넣어 <c>exit 0</c> 으로 끝내기도 한다.
/// 실측에서 Go 가 없는 기계가 "GO_NOT_FOUND" 만 출력하고 "실행 완료"로 보고됐다.
/// 여기서 미리 막아 거짓 성공을 없앤다.
/// </summary>
public static class CodingToolchainPolicy
{
    private sealed record ToolRule(string Executable, Regex Trigger, string Label, string Install);

    private static readonly ToolRule[] Rules =
    {
        new("go", new Regex(@"(^|[\s;&|(])go\s+(build|run|test|mod|vet|install)\b", RegexOptions.Compiled), "Go", "sudo apt install golang-go (또는 https://go.dev/dl)"),
        new("cargo", new Regex(@"(^|[\s;&|(])cargo\s+(build|run|test|check)\b", RegexOptions.Compiled), "Rust(cargo)", "https://rustup.rs 로 rustup 설치"),
        new("rustc", new Regex(@"(^|[\s;&|(])rustc\s+", RegexOptions.Compiled), "Rust(rustc)", "https://rustup.rs 로 rustup 설치"),
        new("javac", new Regex(@"(^|[\s;&|(])javac\s+", RegexOptions.Compiled), "Java(javac)", "sudo apt install default-jdk"),
        new("gradle", new Regex(@"(^|[\s;&|(])gradle\s+", RegexOptions.Compiled), "Gradle", "sudo apt install gradle"),
        new("kotlinc", new Regex(@"(^|[\s;&|(])kotlinc\b", RegexOptions.Compiled), "Kotlin", "sdk install kotlin (SDKMAN!)"),
        new("dotnet", new Regex(@"(^|[\s;&|(])dotnet\s+(build|run|test|publish)\b", RegexOptions.Compiled), ".NET SDK", "https://dotnet.microsoft.com/download"),
        new("php", new Regex(@"(^|[\s;&|(])php\s+", RegexOptions.Compiled), "PHP", "sudo apt install php-cli"),
        new("ruby", new Regex(@"(^|[\s;&|(])ruby\s+", RegexOptions.Compiled), "Ruby", "sudo apt install ruby"),
        new("swift", new Regex(@"(^|[\s;&|(])swift\s+(build|run|test)\b", RegexOptions.Compiled), "Swift", "https://swift.org/install"),
        new("cmake", new Regex(@"(^|[\s;&|(])cmake\s+", RegexOptions.Compiled), "CMake", "sudo apt install cmake"),
        new("node", new Regex(@"(^|[\s;&|(])node\s+", RegexOptions.Compiled), "Node.js", "sudo apt install nodejs (또는 https://nodejs.org)"),
        new("python3", new Regex(@"(^|[\s;&|(])python3\s+", RegexOptions.Compiled), "Python 3", "sudo apt install python3")
    };

    /// <summary>명령이 요구하는 실행 파일들. 순서는 규칙 정의 순서를 따른다.</summary>
    public static IReadOnlyList<string> DetectRequiredExecutables(string? command)
    {
        var text = command ?? string.Empty;
        if (text.Length == 0)
        {
            return Array.Empty<string>();
        }

        return Rules
            .Where(rule => rule.Trigger.IsMatch(text))
            .Select(rule => rule.Executable)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }

    /// <summary>없는 툴체인을 사람이 읽을 안내로 바꾼다. 이름을 모르면 실행 파일 이름 그대로 쓴다.</summary>
    public static string BuildMissingToolchainMessage(IReadOnlyList<string> missingExecutables)
    {
        var lines = new List<string>();
        foreach (var executable in missingExecutables ?? Array.Empty<string>())
        {
            var rule = Rules.FirstOrDefault(item => string.Equals(item.Executable, executable, StringComparison.Ordinal));
            lines.Add(rule == null
                ? $"- {executable}: 실행 파일을 찾지 못했습니다."
                : $"- {rule.Label}: 설치 후 다시 시도하세요. ({rule.Install})");
        }

        if (lines.Count == 0)
        {
            return string.Empty;
        }

        return "이 기계에 필요한 실행 도구가 없어 실행하지 못했습니다.\n" + string.Join("\n", lines);
    }
}

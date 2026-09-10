using System.Net;

namespace Omnux.Middleware;

public sealed partial class CodingApplicationService
{
    private sealed record CodingProjectProfile(
        string Language,
        string ProjectKind,
        IReadOnlyList<string> EntryFiles,
        string BuildTool,
        string TestTool,
        IReadOnlyList<string> RunCommands,
        bool PrefersMultiFile
    );

    private static CodingProjectProfile ResolveCodingProjectProfile(
        string? objective,
        string? languageHint,
        IReadOnlyList<string>? requestedPaths = null
    )
    {
        var text = CodingLanguagePolicy.ExtractLatestCodingRequestText(WebUtility.HtmlDecode(objective ?? string.Empty)).ToLowerInvariant();
        var explicitLanguage = CodingLanguagePolicy.ResolveExplicitObjectiveLanguage(objective);
        var language = CodingLanguagePolicy.NormalizeCodingLanguageHintPreservingAuto(languageHint);
        if (language == "auto" && !string.IsNullOrWhiteSpace(explicitLanguage))
        {
            language = explicitLanguage;
        }

        if (language == "auto" && requestedPaths != null)
        {
            var pathLanguage = requestedPaths
                .Select(path => CodingLanguagePolicy.GuessLanguageFromPath(path, "auto"))
                .FirstOrDefault(value => value != "auto");
            if (!string.IsNullOrWhiteSpace(pathLanguage))
            {
                language = pathLanguage;
            }
        }

        if (language == "auto")
        {
            language = CodingLanguagePolicy.ResolveInitialCodingLanguage(languageHint, objective ?? string.Empty);
        }

        var singleFile = IsExplicitSingleFileSimpleTask(objective, language, requestedPaths);
        var apiLike = ContainsAny(text, "api", "rest", "backend", "http server", "web server");
        var cliLike = CodingTaskSignalPolicy.LooksLikeCli(text);
        var libraryLike = ContainsAny(text, "library", "package", "module", "sdk");
        var testLike = ContainsAny(text, "test", "unit test", "pytest", "jest");
        var dataLike = ContainsAny(text, "csv", "pandas", "chart");
        var gameLike = IsGameLikeCodingTask(objective ?? string.Empty, language);
        var frontendLike = IsFrontendLikeCodingTask(objective ?? string.Empty, language);

        return language switch
        {
            "react-vite" => new("react-vite", "react-vite", new[] { "src/main.tsx", "index.html" }, "npm run build", "npm test 또는 npm run build", new[] { "npm run dev" }, true),
            "typescript" when frontendLike => new("typescript", "react-vite", new[] { "src/main.tsx", "index.html" }, "npm run build", "npm test 또는 npm run build", new[] { "npm run dev" }, true),
            "typescript" => new("typescript", "typescript-node", new[] { "src/index.ts" }, "npm run build 또는 npx tsc --noEmit", "npm test", new[] { "npm start", "node dist/index.js" }, !singleFile),
            "javascript" when frontendLike => new("javascript", "node-web", new[] { "index.html", "src/main.js" }, "npm run build 또는 정적 HTML smoke", "Playwright smoke", new[] { "npm run dev" }, true),
            "javascript" => new("javascript", "node-cli", new[] { "src/index.js" }, "npm run build 또는 node --check", "npm test", new[] { "npm start", "node src/index.js" }, !singleFile),
            "python" when gameLike => new("python", "python-game", new[] { "main.py", "requirements.txt" }, "python3 -m compileall -q .", "OMNI_HEADLESS_TEST=1 smoke 실행", new[] { "python3 main.py" }, true),
            "python" when libraryLike || testLike => new("python", "python-package", new[] { "pyproject.toml", "src/app/__init__.py", "tests/test_app.py" }, "python3 -m compileall -q .", "python3 -m pytest -q", new[] { "python3 -m app" }, true),
            "python" when cliLike || dataLike || apiLike => new("python", cliLike ? "python-cli" : "python-package", new[] { "main.py", "requirements.txt" }, "python3 -m compileall -q .", "python3 -m pytest -q", new[] { "python3 main.py" }, !singleFile),
            "python" => new("python", singleFile ? "python-script" : "python-package", singleFile ? new[] { "main.py" } : new[] { "main.py", "requirements.txt" }, "python3 -m compileall -q .", "python3 -m pytest -q", new[] { "python3 main.py" }, !singleFile),
            "go" => new("go", "go-module", new[] { "go.mod", "main.go" }, "go build ./...", "go test ./...", new[] { "go run ." }, true),
            "rust" => new("rust", "rust-cargo", new[] { "Cargo.toml", "src/main.rs" }, "cargo build", "cargo test", new[] { "cargo run" }, true),
            "java" => new("java", singleFile ? "java-single" : "java-gradle", singleFile ? new[] { "Main.java" } : new[] { "build.gradle", "src/main/java/Main.java" }, singleFile ? "javac Main.java" : "gradle build", singleFile ? "java Main" : "gradle test", singleFile ? new[] { "java Main" } : new[] { "gradle run" }, !singleFile),
            "kotlin" => new("kotlin", singleFile ? "kotlin-single" : "kotlin-gradle", singleFile ? new[] { "Main.kt" } : new[] { "build.gradle.kts", "src/main/kotlin/Main.kt" }, singleFile ? "kotlinc Main.kt -include-runtime -d app.jar" : "gradle build", "gradle test", singleFile ? new[] { "java -jar app.jar" } : new[] { "gradle run" }, !singleFile),
            "csharp" => new("csharp", "csharp-project", new[] { "App.csproj", "Program.cs" }, "dotnet build", "dotnet test 또는 dotnet build", new[] { "dotnet run --project App.csproj" }, true),
            "cpp" => new("cpp", "cpp-cmake", new[] { "CMakeLists.txt", "src/main.cpp", "include/app.hpp" }, "cmake -S . -B build && cmake --build build", "ctest --test-dir build", new[] { "./build/app" }, true),
            "c" => new("c", "c-cmake", new[] { "CMakeLists.txt", "src/main.c", "include/app.h" }, "cmake -S . -B build && cmake --build build", "ctest --test-dir build", new[] { "./build/app" }, true),
            "php" => new("php", "php-cli", new[] { "composer.json", "src/App.php", "bin/app.php" }, "composer install", "composer test 또는 php -l", new[] { "php bin/app.php" }, true),
            "ruby" => new("ruby", "ruby-cli", new[] { "Gemfile", "lib/app.rb", "bin/app" }, "bundle install", "bundle exec ruby -c lib/app.rb", new[] { "ruby bin/app" }, true),
            "swift" => new("swift", "swift-package", new[] { "Package.swift", "Sources/App/main.swift" }, "swift build", "swift test", new[] { "swift run" }, true),
            "bash" => new("bash", "bash-cli", new[] { "scripts/app.sh" }, "bash -n scripts/app.sh", "bash scripts/app.sh --help", new[] { "bash scripts/app.sh" }, !singleFile),
            "html" or "css" => new(language, "static-web", new[] { "index.html", "styles.css", "app.js" }, "정적 HTML 검증", "Playwright smoke", new[] { "open index.html" }, true),
            _ => new(language == "auto" ? "python" : language, "auto-project", new[] { "README.md", "src/main" }, "프로젝트별 빌드", "프로젝트별 테스트", Array.Empty<string>(), true)
        };
    }

    private static bool IsExplicitSingleFileSimpleTask(
        string? objective,
        string? languageHint,
        IReadOnlyList<string>? requestedPaths
    )
    {
        var text = CodingLanguagePolicy.ExtractLatestCodingRequestText(WebUtility.HtmlDecode(objective ?? string.Empty)).ToLowerInvariant();
        var expectedOutputLines = CodingExpectedOutputPolicy.ExtractExpectedConsoleOutputLines(text);
        var pathCount = requestedPaths?.Count ?? 0;
        var singleFileIntent = CodingFallbackPolicy.HasSingleFileIntent(text)
            || ContainsAny(text, "single file", "one file", "1 file");
        var simpleStdout = expectedOutputLines.Count > 0
            || ContainsAny(text, "print", "echo", "stdout", "console.log");
        var projectSignals = ContainsAny(
            text,
            "project",
            "web app",
            "api",
            "server",
            "game",
            "test",
            "package",
            "library",
            "multiple files",
            "multi-file"
        );

        if (projectSignals)
        {
            return false;
        }

        return singleFileIntent && simpleStdout && pathCount <= 1;
    }
}

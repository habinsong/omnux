using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private static readonly Regex BrowserIntentOpenVerbRegex = new(
        @"(?i)(열어\s*줘?|열어|띄워\s*줘?|띄워|접속(?:해|해줘|시켜줘)?|이동(?:해|해줘)?|방문(?:해|해줘)?|open|navigate|go\s+to|visit)"
    );
    private static readonly Regex BrowserIntentStartRegex = new(
        @"(?i)(브라우저|browser).*(켜\s*줘?|열어\s*줘?|시작|start|open)"
    );
    private static readonly Regex BrowserIntentStopRegex = new(
        @"(?i)(브라우저|browser).*(꺼\s*줘?|닫아\s*줘?|중지|종료|stop|close)"
    );
    private static readonly Regex BrowserIntentNewTabRegex = new(
        @"(?i)(새\s*탭|새창|new\s+tab)"
    );
    private static readonly Regex BrowserIntentTrailingPunctuationRegex = new(
        @"[)\].,!?;:'""，。！？、]+$"
    );

    private static readonly IReadOnlyList<(string Keyword, string Url, string Label)> BrowserIntentKnownSites =
        new (string Keyword, string Url, string Label)[]
        {
            ("네이버", "https://www.naver.com/", "네이버"),
            ("naver", "https://www.naver.com/", "네이버"),
            ("구글", "https://www.google.com/", "구글"),
            ("google", "https://www.google.com/", "구글"),
            ("유튜브", "https://www.youtube.com/", "유튜브"),
            ("유투브", "https://www.youtube.com/", "유튜브"),
            ("youtube", "https://www.youtube.com/", "유튜브"),
            ("다음", "https://www.daum.net/", "다음"),
            ("daum", "https://www.daum.net/", "다음"),
            ("카카오", "https://www.kakao.com/", "카카오"),
            ("kakao", "https://www.kakao.com/", "카카오"),
            ("깃허브", "https://github.com/", "GitHub"),
            ("github", "https://github.com/", "GitHub"),
            ("지메일", "https://mail.google.com/", "Gmail"),
            ("gmail", "https://mail.google.com/", "Gmail"),
            ("오픈ai", "https://openai.com/", "OpenAI"),
            ("openai", "https://openai.com/", "OpenAI")
        };

    private ConversationChatResult? TryHandleBrowserChatIntent(
        SessionContext session,
        string rawInput,
        string mode,
        string? requestId = null
    )
    {
        if (!TryParseBrowserIntent(rawInput, out var command))
        {
            return null;
        }

        var result = _browserTool.Execute(command.Action, command.Url);
        // 브라우저를 못 띄웠는데 읽을 주소가 있으면 오류를 답으로 주지 않는다. "이 페이지 열어서 알려줘"의
        // 목적은 내용을 아는 것이므로, 일반 경로(URL 내용 가져오기·웹 검색)가 처리하게 넘긴다
        // (실측: Chromium 실행 실패 한 줄만 답으로 오고 페이지 내용은 전혀 못 가져왔다).
        if (!result.Ok && !string.IsNullOrWhiteSpace(command.Url))
        {
            Console.Error.WriteLine(
                $"[browser-intent] launch failed, falling back to page fetch: {TrimForOutput(result.Error ?? "-", 160)}"
            );
            return null;
        }

        var assistantText = BuildBrowserIntentAssistantText(command, result);
        _conversationStore.AppendMessage(session.Thread.Id, "user", rawInput, "browser:intent");
        _conversationStore.AppendMessage(session.Thread.Id, "assistant", assistantText, "browser:intent");
        ScheduleConversationMaintenance(
            session.Thread.Id,
            $"{session.Scope}-{session.Mode}",
            "browser",
            result.Adapter
        );

        var updated = _conversationStore.Get(session.Thread.Id) ?? session.Thread;
        return new ConversationChatResult(
            mode,
            updated.Id,
            "browser",
            result.Adapter,
            assistantText,
            "browser:intent",
            updated,
            null,
            null,
            RequestId: requestId
        );
    }

    private ConversationMultiResult? TryHandleBrowserMultiIntent(
        SessionContext session,
        string rawInput,
        MultiChatRequest request
    )
    {
        if (!TryParseBrowserIntent(rawInput, out var command))
        {
            return null;
        }

        var result = _browserTool.Execute(command.Action, command.Url);
        // 브라우저를 못 띄웠는데 읽을 주소가 있으면 오류를 답으로 주지 않는다. "이 페이지 열어서 알려줘"의
        // 목적은 내용을 아는 것이므로, 일반 경로(URL 내용 가져오기·웹 검색)가 처리하게 넘긴다
        // (실측: Chromium 실행 실패 한 줄만 답으로 오고 페이지 내용은 전혀 못 가져왔다).
        if (!result.Ok && !string.IsNullOrWhiteSpace(command.Url))
        {
            Console.Error.WriteLine(
                $"[browser-intent] launch failed, falling back to page fetch: {TrimForOutput(result.Error ?? "-", 160)}"
            );
            return null;
        }

        var assistantText = BuildBrowserIntentAssistantText(command, result);
        _conversationStore.AppendMessage(session.Thread.Id, "user", rawInput, "browser:intent");
        _conversationStore.AppendMessage(session.Thread.Id, "assistant", assistantText, "browser:intent");
        ScheduleConversationMaintenance(
            session.Thread.Id,
            $"{session.Scope}-{session.Mode}",
            "browser",
            result.Adapter
        );

        var updated = _conversationStore.Get(session.Thread.Id) ?? session.Thread;
        var model = result.Adapter;
        return new ConversationMultiResult(
            updated.Id,
            assistantText,
            assistantText,
            assistantText,
            assistantText,
            assistantText,
            NormalizeModelSelection(request.GroqModel) ?? model,
            NormalizeModelSelection(request.GeminiModel) ?? model,
            NormalizeModelSelection(request.CerebrasModel) ?? model,
            NormalizeModelSelection(request.CopilotModel) ?? model,
            request.SummaryProvider ?? "browser",
            "browser",
            updated,
            null,
            null,
            CodexText: assistantText,
            CodexModel: NormalizeModelSelection(request.CodexModel) ?? model,
            CommonCore: assistantText,
            Differences: "",
            NvidiaText: assistantText,
            NvidiaModel: NormalizeModelSelection(request.NvidiaModel) ?? model
        );
    }

    // "슈퍼마리오 게임 만들어줘", "index.html 작성해줘" 류 코드/파일 생성 요청. 이런 건
    // 브라우저 네비게이션이 아니라 정상 코딩 루프로 보내야 한다(html/게임 단어 + 파일명이 있어도).
    private static readonly Regex CodingBuildIntentRegex = new(
        @"(?i)(만들|작성|구현|개발|생성|코딩|코드\s*짜|짜\s*줘|build|create|implement|develop|generate|scaffold|write\s+(a|an|the|some)?\s*(code|game|app|page|site|program|script)|게임|앱|페이지|프로그램|스크립트|\.(html?|jsx?|tsx?|css|py|json))"
    );

    private CodingRunResult? TryHandleBrowserCodingIntent(
        SessionContext session,
        string rawInput,
        string mode,
        string codingRunRoot,
        string language
    )
    {
        // 코드/파일 생성 의도가 보이면 브라우저 인텐트를 아예 시도하지 않는다.
        rawInput ??= string.Empty;
        if (CodingBuildIntentRegex.IsMatch(rawInput))
        {
            return null;
        }

        if (!TryParseBrowserIntent(rawInput, out var command))
        {
            return null;
        }

        Directory.CreateDirectory(codingRunRoot);
        var result = _browserTool.Execute(command.Action, command.Url);
        // 브라우저를 못 띄웠는데 읽을 주소가 있으면 오류를 답으로 주지 않는다. "이 페이지 열어서 알려줘"의
        // 목적은 내용을 아는 것이므로, 일반 경로(URL 내용 가져오기·웹 검색)가 처리하게 넘긴다
        // (실측: Chromium 실행 실패 한 줄만 답으로 오고 페이지 내용은 전혀 못 가져왔다).
        if (!result.Ok && !string.IsNullOrWhiteSpace(command.Url))
        {
            Console.Error.WriteLine(
                $"[browser-intent] launch failed, falling back to page fetch: {TrimForOutput(result.Error ?? "-", 160)}"
            );
            return null;
        }

        var assistantText = BuildBrowserIntentAssistantText(command, result);
        _conversationStore.AppendMessage(session.Thread.Id, "user", rawInput, "browser:intent");
        _conversationStore.AppendMessage(session.Thread.Id, "assistant", assistantText, "browser:intent");
        ScheduleConversationMaintenance(
            session.Thread.Id,
            $"{session.Scope}-{session.Mode}",
            "browser",
            result.Adapter
        );

        var updated = _conversationStore.Get(session.Thread.Id) ?? session.Thread;
        var execution = new CodeExecutionResult(
            "browser",
            codingRunRoot,
            "",
            BuildBrowserIntentCommandLabel(command, result),
            result.Ok ? 0 : 1,
            assistantText,
            result.Error ?? "",
            result.Ok ? "ok" : "error"
        );
        return new CodingRunResult(
            mode,
            updated.Id,
            "browser",
            result.Adapter,
            language,
            "",
            execution,
            Array.Empty<CodingWorkerResult>(),
            Array.Empty<string>(),
            assistantText,
            updated,
            null
        );
    }

    private static bool TryParseBrowserIntent(string input, out BrowserIntentCommand command)
    {
        command = default!;
        var text = (input ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        if (BrowserIntentStopRegex.IsMatch(text))
        {
            command = new BrowserIntentCommand("stop", null, "브라우저");
            return true;
        }

        var hasOpenVerb = BrowserIntentOpenVerbRegex.IsMatch(text);
        var hasBrowserWord = ContainsAnyIgnoreCase(text, "브라우저", "browser");
        var target = ResolveBrowserIntentTarget(text);
        if (target != null && (hasOpenVerb || hasBrowserWord))
        {
            var action = BrowserIntentNewTabRegex.IsMatch(text) ? "open" : "navigate";
            command = new BrowserIntentCommand(action, target.Value.Url, target.Value.Label);
            return true;
        }

        if (target == null && BrowserIntentStartRegex.IsMatch(text))
        {
            command = new BrowserIntentCommand("start", null, "브라우저");
            return true;
        }

        return false;
    }

    private static (string Url, string Label)? ResolveBrowserIntentTarget(string text)
    {
        var urlMatch = HttpUrlRegex.Match(text);
        if (urlMatch.Success)
        {
            var url = CleanBrowserIntentUrl(urlMatch.Value);
            return (url, url);
        }

        foreach (var site in BrowserIntentKnownSites)
        {
            if (text.Contains(site.Keyword, StringComparison.OrdinalIgnoreCase))
            {
                return (site.Url, site.Label);
            }
        }

        var domainMatch = DomainRegex.Match(text);
        if (domainMatch.Success)
        {
            var domain = CleanBrowserIntentUrl(domainMatch.Value);
            // index.html / app.py 같은 로컬 파일명은 도메인이 아니다(html 을 TLD 로 오인하면
            // browser.navigate https://index.html 로 가서 ERR_NAME_NOT_RESOLVED 가 난다).
            var lastDot = domain.LastIndexOf('.');
            var tld = lastDot >= 0 ? domain[(lastDot + 1)..] : string.Empty;
            if (NonNavigableDomainSuffixes.Contains(tld, StringComparer.OrdinalIgnoreCase))
            {
                return null;
            }

            return ($"https://{domain}", domain);
        }

        return null;
    }

    // 코드/마크업/리소스 파일 확장자 — 도메인 TLD 로 오인하면 안 된다.
    private static readonly string[] NonNavigableDomainSuffixes =
    {
        "html", "htm", "js", "mjs", "cjs", "jsx", "ts", "tsx", "css", "scss", "json", "py",
        "md", "txt", "csproj", "sln", "java", "go", "rs", "rb", "php", "c", "cpp", "h",
        "sh", "yml", "yaml", "xml", "png", "jpg", "jpeg", "svg", "ico"
    };

    private static string CleanBrowserIntentUrl(string value)
    {
        return BrowserIntentTrailingPunctuationRegex.Replace((value ?? string.Empty).Trim(), "");
    }

    private static bool ContainsAnyIgnoreCase(string text, params string[] needles)
    {
        foreach (var needle in needles)
        {
            if (!string.IsNullOrWhiteSpace(needle)
                && text.Contains(needle, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static string BuildBrowserIntentAssistantText(BrowserIntentCommand command, BrowserToolResult result)
    {
        var targetText = string.IsNullOrWhiteSpace(command.Url)
            ? command.Label
            : command.Url;
        if (result.Ok && string.Equals(result.Adapter, "playwright", StringComparison.OrdinalIgnoreCase))
        {
            return command.Action switch
            {
                "stop" => "브라우저를 닫았습니다.",
                "start" => "브라우저를 열었습니다.",
                "open" => $"브라우저 새 탭에서 {targetText} 을(를) 열었습니다.",
                _ => $"브라우저에서 {targetText} 으로 이동했습니다."
            } + $"\n\nadapter=playwright running={(result.Running ? "true" : "false")} tabs={result.Tabs.Count}";
        }

        if (result.Ok)
        {
            return $"브라우저 요청은 처리했지만 실제 Chromium이 아니라 {result.Adapter} adapter로 기록됐습니다."
                + $"\n\n요청: {BuildBrowserIntentCommandLabel(command, result)}";
        }

        return $"브라우저 요청을 실행하지 못했습니다.\n\n요청: {BuildBrowserIntentCommandLabel(command, result)}\n오류: {result.Error ?? "-"}";
    }

    private static string BuildBrowserIntentCommandLabel(BrowserIntentCommand command, BrowserToolResult result)
    {
        var target = string.IsNullOrWhiteSpace(command.Url) ? "" : $" {command.Url}";
        return $"browser.{command.Action}{target} adapter={result.Adapter}";
    }

    private sealed record BrowserIntentCommand(
        string Action,
        string? Url,
        string Label
    );
}

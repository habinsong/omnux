namespace Omnux.Middleware;

/// <summary>
/// 텍스트/슬래시 명령 라우팅의 입력 캡슐. 핸들러는 이 컨텍스트만 받고
/// CommandService private state에 의존하지 않는다 (결함 4번 God Object 탈결합 경계).
/// </summary>
internal sealed record SlashCommandContext(string Text, string Source);

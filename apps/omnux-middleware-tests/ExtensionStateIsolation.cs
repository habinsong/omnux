using System.Runtime.CompilerServices;

namespace Omnux.Middleware.Tests;

/// <summary>
/// 검사 프로세스가 사용자 개인 확장 설정(`~/.omnux/extensions.json`)을 읽지 않게 격리한다.
/// 코딩·자동화의 훅 게이트는 기본 경로를 쓰므로, 격리하지 않으면 검사 결과가
/// 사용자가 등록한 훅에 따라 달라진다(QA-01 유형 문제).
/// </summary>
internal static class ExtensionStateIsolation
{
    [ModuleInitializer]
    internal static void RedirectExtensionStateToTempFile()
    {
        var directory = Path.Combine(
            Path.GetTempPath(),
            $"omnux-test-extension-state-{Guid.NewGuid():N}"
        );

        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(ExtensionConfigStore.PathEnvName)))
        {
            Directory.CreateDirectory(directory);
            Environment.SetEnvironmentVariable(
                ExtensionConfigStore.PathEnvName,
                Path.Combine(directory, ExtensionConfigStore.FileName)
            );
        }

        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(ApprovalStore.PathEnvName)))
        {
            Directory.CreateDirectory(directory);
            Environment.SetEnvironmentVariable(
                ApprovalStore.PathEnvName,
                Path.Combine(directory, ApprovalStore.FileName)
            );
        }

        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(PluginScanner.RootEnvName)))
        {
            var pluginRoot = Path.Combine(directory, PluginScanner.DefaultDirectoryName);
            Directory.CreateDirectory(pluginRoot);
            Environment.SetEnvironmentVariable(PluginScanner.RootEnvName, pluginRoot);
        }
    }
}

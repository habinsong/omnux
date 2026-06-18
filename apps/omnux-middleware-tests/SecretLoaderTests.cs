using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class SecretLoaderTests
{
    [Fact]
    public void TryWritePlatformSecretCore_falls_back_to_local_store_when_macos_keychain_write_fails()
    {
        // Given: macOS keychain write fails but the local secure store can persist the secret.
        var keychainAttempts = 0;
        var localAttempts = 0;

        // When: platform secret storage is attempted on macOS.
        var ok = SecretLoader.TryWritePlatformSecretCore(
            useMacOsKeychain: true,
            writeMacOsKeychain: () =>
            {
                keychainAttempts += 1;
                return false;
            },
            writeLocalSecureStore: () =>
            {
                localAttempts += 1;
                return true;
            }
        );

        // Then: the local fallback succeeds after one failed keychain attempt.
        Assert.True(ok);
        Assert.Equal(1, keychainAttempts);
        Assert.Equal(1, localAttempts);
    }

    [Fact]
    public void TryDeletePlatformSecretCore_deletes_local_store_even_when_macos_keychain_is_present()
    {
        // Given: a secret may exist in both macOS keychain and local fallback storage.
        var keychainAttempts = 0;
        var localAttempts = 0;

        // When: platform secret deletion is attempted on macOS.
        var ok = SecretLoader.TryDeletePlatformSecretCore(
            useMacOsKeychain: true,
            deleteMacOsKeychain: () =>
            {
                keychainAttempts += 1;
                return false;
            },
            deleteLocalSecureStore: () =>
            {
                localAttempts += 1;
                return true;
            }
        );

        // Then: local fallback cleanup is enough to report a successful delete.
        Assert.True(ok);
        Assert.Equal(1, keychainAttempts);
        Assert.Equal(1, localAttempts);
    }
}

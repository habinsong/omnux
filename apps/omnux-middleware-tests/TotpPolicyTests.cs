using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TotpPolicyTests
{
    [Theory]
    [InlineData(59L, "94287082")]
    [InlineData(1_111_111_109L, "07081804")]
    [InlineData(1_111_111_111L, "14050471")]
    [InlineData(1_234_567_890L, "89005924")]
    [InlineData(2_000_000_000L, "69279037")]
    [InlineData(20_000_000_000L, "65353130")]
    public void ComputeCode_matches_rfc6238_sha1_test_vectors(long unixTimeSeconds, string expected)
    {
        // Given: the RFC 6238 SHA1 test secret encoded as Base32.
        const string Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        var now = DateTimeOffset.FromUnixTimeSeconds(unixTimeSeconds);

        // When: the TOTP code is computed for the RFC timestamp.
        var code = TotpPolicy.ComputeCode(Secret, now, digits: 8);

        // Then: the result matches the standard authenticator value.
        Assert.Equal(expected, code);
    }

    [Fact]
    public void Verify_accepts_current_authenticator_code_when_input_contains_spaces()
    {
        // Given: an authenticator code generated from the same secret and time window.
        const string Secret = "JBSWY3DPEHPK3PXP";
        var now = DateTimeOffset.FromUnixTimeSeconds(1_234_567_890);
        var code = TotpPolicy.ComputeCode(Secret, now);
        var spaced = $"{code[..3]} {code[3..]}";

        // When: the user enters the code with a visual separator.
        var ok = TotpPolicy.Verify(Secret, spaced, now);

        // Then: digit normalization preserves the valid authenticator code.
        Assert.True(ok);
    }

    [Fact]
    public void BuildOtpAuthUri_uses_service_name_for_label_and_issuer_id_for_matching_when_issuer_id_is_provided()
    {
        // Given: Apple Passwords-compatible metadata separates display text from credential matching.
        const string Secret = "JBSWY3DPEHPK3PXP";

        // When: an otpauth URI is generated for QR enrollment.
        var uri = TotpPolicy.BuildOtpAuthUri("omnux", "dashboard", Secret, issuerId: "omnux.local");

        // Then: the label stays human-readable while issuer carries the stable matching identifier.
        Assert.StartsWith("otpauth://totp/omnux%3Adashboard?", uri, StringComparison.Ordinal);
        Assert.Contains("secret=JBSWY3DPEHPK3PXP", uri, StringComparison.Ordinal);
        Assert.Contains("issuer=omnux.local", uri, StringComparison.Ordinal);
        Assert.DoesNotContain("issuer=omnux&", uri, StringComparison.Ordinal);
    }

    [Fact]
    public void BeginEnrollment_uses_domain_shaped_default_issuer_for_password_manager_matching()
    {
        // Given: the desktop app starts TOTP enrollment with default metadata.
        var store = new TotpAuthenticatorStore(account: "dashboard");

        // When: enrollment data is issued to the desktop QR renderer.
        var enrollment = store.BeginEnrollment();

        // Then: the QR payload uses a credential-matching issuer instead of the display label.
        Assert.Contains("otpauth://totp/omnux%3Adashboard?", enrollment.OtpAuthUri, StringComparison.Ordinal);
        Assert.Contains("issuer=omnux.local", enrollment.OtpAuthUri, StringComparison.Ordinal);
        Assert.DoesNotContain("issuer=omnux&", enrollment.OtpAuthUri, StringComparison.Ordinal);
    }
}

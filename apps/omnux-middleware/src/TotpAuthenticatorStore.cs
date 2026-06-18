namespace Omnux.Middleware;

/// <summary>인증 앱 등록 시작 시 클라이언트에 전달할 정보(시크릿 + QR용 otpauth URI).</summary>
public readonly record struct TotpEnrollment(string Secret, string OtpAuthUri, string Account, string Issuer);

/// <summary>
/// 표준 TOTP 인증 앱(Apple 암호, Google Authenticator 등) 등록/검증 상태를 관리한다.
/// 확정된 시크릿은 OS 키체인(macOS) 또는 로컬 보안저장소에 저장하고(<see cref="SecretLoader"/>),
/// 등록 확인 전 시크릿은 메모리에만 보관한다(코드 검증으로 등록을 확정하기 전엔 저장하지 않음).
/// Telegram 전달식 OTP와 독립적으로 동작하는 보조 인증 수단이다.
/// </summary>
public sealed class TotpAuthenticatorStore
{
    private const string KeychainService = "omnux_totp_secret";

    private readonly object _lock = new();
    private readonly string _issuer;
    private readonly string _issuerId;
    private readonly string _account;
    private string? _pendingSecret;
    private bool? _enrolledCache;

    public TotpAuthenticatorStore(string? issuer = null, string? account = null, string? issuerId = null)
    {
        _issuer = string.IsNullOrWhiteSpace(issuer) ? "omnux" : issuer!.Trim();
        _issuerId = string.IsNullOrWhiteSpace(issuerId) ? "omnux.local" : issuerId!.Trim();
        _account = string.IsNullOrWhiteSpace(account)
            ? (string.IsNullOrWhiteSpace(Environment.UserName) ? "dashboard" : Environment.UserName.Trim())
            : account!.Trim();
    }

    /// <summary>인증 앱이 등록되어 있는지 여부. 키체인 조회 비용을 줄이기 위해 메모리에 캐시한다.</summary>
    public bool IsEnrolled
    {
        get
        {
            lock (_lock)
            {
                if (_enrolledCache.HasValue)
                {
                    return _enrolledCache.Value;
                }
            }

            var present = !string.IsNullOrWhiteSpace(LoadSecret());
            lock (_lock)
            {
                _enrolledCache = present;
            }

            return present;
        }
    }

    /// <summary>새 시크릿을 생성해 메모리에 pending으로 보관하고 QR용 정보를 반환한다(저장하지 않음).</summary>
    public TotpEnrollment BeginEnrollment()
    {
        var secret = TotpPolicy.GenerateSecret();
        lock (_lock)
        {
            _pendingSecret = secret;
        }

        var uri = TotpPolicy.BuildOtpAuthUri(_issuer, _account, secret, issuerId: _issuerId);
        return new TotpEnrollment(secret, uri, _account, _issuer);
    }

    /// <summary>pending 시크릿으로 입력 코드를 검증하고, 성공하면 키체인에 저장해 등록을 확정한다.</summary>
    public bool ConfirmEnrollment(string? code)
    {
        string? pending;
        lock (_lock)
        {
            pending = _pendingSecret;
        }

        if (string.IsNullOrWhiteSpace(pending) || string.IsNullOrWhiteSpace(code))
        {
            return false;
        }

        if (!TotpPolicy.Verify(pending!, code!, DateTimeOffset.UtcNow))
        {
            return false;
        }

        if (!SecretLoader.TryWritePlatformSecret(KeychainService, _account, pending!))
        {
            return false;
        }

        lock (_lock)
        {
            _pendingSecret = null;
            _enrolledCache = true;
        }

        return true;
    }

    /// <summary>등록된 인증 앱을 해제한다(저장된 시크릿 삭제 + pending 폐기).</summary>
    public bool Disable()
    {
        var deleted = SecretLoader.TryDeletePlatformSecret(KeychainService, _account);
        lock (_lock)
        {
            _pendingSecret = null;
            _enrolledCache = false;
        }

        return deleted;
    }

    /// <summary>로그인 시 저장된 시크릿으로 입력 코드를 검증한다.</summary>
    public bool VerifyLogin(string? code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return false;
        }

        var secret = LoadSecret();
        if (string.IsNullOrWhiteSpace(secret))
        {
            return false;
        }

        return TotpPolicy.Verify(secret!, code!, DateTimeOffset.UtcNow);
    }

    private string? LoadSecret() => SecretLoader.TryReadPlatformSecret(KeychainService, _account);
}

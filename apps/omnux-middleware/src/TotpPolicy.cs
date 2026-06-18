using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Omnux.Middleware;

/// <summary>
/// 표준 TOTP(RFC 6238) / HOTP(RFC 4226) 구현. 인증 앱(Apple 암호, Google Authenticator,
/// Authy, 1Password 등)이 생성하는 6자리 시간 기반 코드를 발급/검증한다.
/// 순수 함수 모음이라 RFC 6238 테스트 벡터로 단독 검증할 수 있다.
/// </summary>
internal static class TotpPolicy
{
    public const int DefaultDigits = 6;
    public const int DefaultPeriodSeconds = 30;

    private const string Base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    /// <summary>인증 앱 등록용 새 시크릿(160비트)을 Base32 문자열로 생성한다.</summary>
    public static string GenerateSecret(int bytes = 20)
    {
        var raw = new byte[Math.Max(10, bytes)];
        RandomNumberGenerator.Fill(raw);
        return Base32Encode(raw);
    }

    /// <summary>현재 시각 기준 TOTP 코드를 계산한다.</summary>
    public static string ComputeCode(
        string secretBase32,
        DateTimeOffset now,
        int digits = DefaultDigits,
        int periodSeconds = DefaultPeriodSeconds
    )
    {
        var counter = now.ToUnixTimeSeconds() / Math.Max(1, periodSeconds);
        return ComputeHotp(Base32Decode(secretBase32), counter, digits);
    }

    /// <summary>
    /// 입력 코드가 현재 시간창(±window 스텝) 안에서 유효한지 상수시간 비교로 검증한다.
    /// 시계 오차/입력 지연을 흡수하기 위해 기본 ±1 스텝(±30초)을 허용한다.
    /// </summary>
    public static bool Verify(
        string secretBase32,
        string code,
        DateTimeOffset now,
        int window = 1,
        int digits = DefaultDigits,
        int periodSeconds = DefaultPeriodSeconds
    )
    {
        if (string.IsNullOrWhiteSpace(secretBase32) || string.IsNullOrWhiteSpace(code))
        {
            return false;
        }

        var normalizedInput = new string(code.Where(char.IsDigit).ToArray());
        if (normalizedInput.Length != digits)
        {
            return false;
        }

        byte[] key;
        try
        {
            key = Base32Decode(secretBase32);
        }
        catch
        {
            return false;
        }

        if (key.Length == 0)
        {
            return false;
        }

        var baseCounter = now.ToUnixTimeSeconds() / Math.Max(1, periodSeconds);
        var safeWindow = Math.Clamp(window, 0, 10);
        var matched = false;
        // 일치하더라도 전체 창을 끝까지 순회해 타이밍 사이드채널을 줄인다.
        for (var offset = -safeWindow; offset <= safeWindow; offset++)
        {
            var candidate = ComputeHotp(key, baseCounter + offset, digits);
            if (FixedTimeEquals(candidate, normalizedInput))
            {
                matched = true;
            }
        }

        return matched;
    }

    /// <summary>
    /// 인증 앱이 스캔할 otpauth:// URI를 만든다. issuer/account는 URL 인코딩한다.
    /// </summary>
    public static string BuildOtpAuthUri(
        string issuer,
        string account,
        string secretBase32,
        int digits = DefaultDigits,
        int periodSeconds = DefaultPeriodSeconds,
        string? issuerId = null
    )
    {
        var safeIssuer = string.IsNullOrWhiteSpace(issuer) ? "omnux" : issuer.Trim();
        var safeIssuerId = string.IsNullOrWhiteSpace(issuerId) ? safeIssuer : issuerId.Trim();
        var safeAccount = string.IsNullOrWhiteSpace(account) ? "dashboard" : account.Trim();
        var label = Uri.EscapeDataString($"{safeIssuer}:{safeAccount}");
        var query = string.Join(
            "&",
            $"secret={Uri.EscapeDataString(secretBase32)}",
            $"issuer={Uri.EscapeDataString(safeIssuerId)}",
            "algorithm=SHA1",
            $"digits={digits.ToString(CultureInfo.InvariantCulture)}",
            $"period={periodSeconds.ToString(CultureInfo.InvariantCulture)}"
        );
        return $"otpauth://totp/{label}?{query}";
    }

    private static string ComputeHotp(byte[] key, long counter, int digits)
    {
        Span<byte> counterBytes = stackalloc byte[8];
        for (var i = 7; i >= 0; i--)
        {
            counterBytes[i] = (byte)(counter & 0xff);
            counter >>= 8;
        }

        Span<byte> hash = stackalloc byte[HMACSHA1.HashSizeInBytes];
        if (!HMACSHA1.TryHashData(key, counterBytes, hash, out _))
        {
            using var hmac = new HMACSHA1(key);
            var fallback = hmac.ComputeHash(counterBytes.ToArray());
            fallback.CopyTo(hash);
        }

        var dynamicOffset = hash[^1] & 0x0f;
        var binary =
            ((hash[dynamicOffset] & 0x7f) << 24)
            | ((hash[dynamicOffset + 1] & 0xff) << 16)
            | ((hash[dynamicOffset + 2] & 0xff) << 8)
            | (hash[dynamicOffset + 3] & 0xff);

        var modulo = (int)Math.Pow(10, digits);
        var otp = binary % modulo;
        return otp.ToString(CultureInfo.InvariantCulture).PadLeft(digits, '0');
    }

    private static bool FixedTimeEquals(string a, string b)
    {
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(a),
            Encoding.ASCII.GetBytes(b)
        );
    }

    public static string Base32Encode(ReadOnlySpan<byte> data)
    {
        if (data.Length == 0)
        {
            return string.Empty;
        }

        var builder = new StringBuilder((data.Length + 4) / 5 * 8);
        int buffer = 0;
        int bitsLeft = 0;
        foreach (var b in data)
        {
            buffer = (buffer << 8) | b;
            bitsLeft += 8;
            while (bitsLeft >= 5)
            {
                bitsLeft -= 5;
                builder.Append(Base32Alphabet[(buffer >> bitsLeft) & 0x1f]);
            }
        }

        if (bitsLeft > 0)
        {
            builder.Append(Base32Alphabet[(buffer << (5 - bitsLeft)) & 0x1f]);
        }

        return builder.ToString();
    }

    public static byte[] Base32Decode(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return Array.Empty<byte>();
        }

        var cleaned = input.Trim().TrimEnd('=').Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant();
        var output = new List<byte>(cleaned.Length * 5 / 8);
        int buffer = 0;
        int bitsLeft = 0;
        foreach (var c in cleaned)
        {
            var index = Base32Alphabet.IndexOf(c);
            if (index < 0)
            {
                throw new FormatException($"Invalid Base32 character: {c}");
            }

            buffer = (buffer << 5) | index;
            bitsLeft += 5;
            if (bitsLeft >= 8)
            {
                bitsLeft -= 8;
                output.Add((byte)((buffer >> bitsLeft) & 0xff));
            }
        }

        return output.ToArray();
    }
}

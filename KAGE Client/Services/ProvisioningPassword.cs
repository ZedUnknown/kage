using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace KAGE_Client.Services;

internal static class ProvisioningPassword {
    public static bool IsValid(string? value) =>
        value is not null && Regex.IsMatch(value, @"\A[0-9a-fA-F]{5}(-[0-9a-fA-F]{5}){3}\z");

    public static bool IsValidHash(string? value) =>
        value is not null && Regex.IsMatch(value, @"\A[0-9a-fA-F]{64}\z");

    public static string Hash(string password) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(password.Trim().ToLowerInvariant())));

    public static bool Matches(string password, string? hash) =>
        IsValid(password.Trim()) && IsValidHash(hash)
        && CryptographicOperations.FixedTimeEquals(Convert.FromHexString(Hash(password)), Convert.FromHexString(hash!));
}

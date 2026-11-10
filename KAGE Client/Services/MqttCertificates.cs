using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace KAGE_Client.Services;

public static class MqttCertificates {
    public static X509Certificate2Collection Load(string? pem) {
        var certificates = new X509Certificate2Collection();
        if (string.IsNullOrEmpty(pem)) return certificates;
        try {
            certificates.ImportFromPem(pem);
            if (certificates.Count == 0) throw new CryptographicException("No PEM certificates were found.");
            return certificates;
        }
        catch {
            foreach (var certificate in certificates) certificate.Dispose();
            throw;
        }
    }
}

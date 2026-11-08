#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <mbedtls/x509_crt.h>

namespace HubTrust {

static const char DEFAULT_ROOT_CA[] = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDnzCCAoegAwIBAgIUC77zMrXUv4qytH+qLel6ETXC8v8wDQYJKoZIhvcNAQEL
BQAwVzEcMBoGA1UECgwTQXJhc2FrYSBDb3Jwb3JhdGlvbjEfMB0GA1UECwwWS0FH
RSBXb3Jrc3BhY2UgU3lzdGVtczEWMBQGA1UEAwwNS0FHRSBMb2NhbCBDQTAeFw0y
NjEwMTAyMjM4MDFaFw0zNjEwMDcyMjM4MDFaMFcxHDAaBgNVBAoME0FyYXNha2Eg
Q29ycG9yYXRpb24xHzAdBgNVBAsMFktBR0UgV29ya3NwYWNlIFN5c3RlbXMxFjAU
BgNVBAMMDUtBR0UgTG9jYWwgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDoLjlSSYIHaqDMqSNpKA+D4xMUvL+/L92dJ9mb2b4LsXj67fRiQ9tuAqZY
khBMDW/NaKnUM7kh45LeYKHcMbLrEDFyXTaZ+5/HiNwN5k9zPE5FojDPTnItJL/N
nWOCtvdnn2KFiW46sHsznodpumQDVTf7nw9BFRh0FG4STs2wxt+qS4ql/dxUwPBL
kulZ7MrqPcbvVnQtzVQfAjw/E3vFkuOAch6apGfePq7IyRVPUfck0x3T6n4ZExTv
Av4nBYqAy/duiXcfjlyxuJ3SIT5fjz/LzeJ2wmPlVEoL1H5+AbgB4PcS1PJNfVv4
kTQe6jbfezFrdx2ex/PmG11aLvt/AgMBAAGjYzBhMB8GA1UdIwQYMBaAFKiTca4X
Ieivr+kTROR+irHZZKSpMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEG
MB0GA1UdDgQWBBSok3GuFyHor6/pE0Tkfoqx2WSkqTANBgkqhkiG9w0BAQsFAAOC
AQEAZotch4rLe0WWD4endGMqXaZ4jmwdKnhs/8svs7XH9fZ4KNZkIkhz6f5WJMQy
fQ2hsnDaJy+1xylTsep2fN6CgGRDu8hanUULfLz55FsG8SXZC4CLQ3LRFXKb7o1G
bW2/0wLTHc1ryspClFfa4QgeDGqu+2FLkunFjKszdox/yRH5IQXdT70dTNh4AEl4
e/GJxEVD23I+qmq6qPXNGRvJTU5Y55QJcYlLfTDQ9evaIvw1dsLGS0430GBgtO3P
US0rQ+85UXXVvEtbSzqIGeObLPg22MsSgqNs0kqkwESrNW/UAYphxs95GPvETNmk
typxIEX0yUxbXNaM6Wx+G53Psg==
-----END CERTIFICATE-----
)EOF";

// Owned storage remains alive for WiFiClientSecure's borrowed CA pointer.
// Only changed during provisioning, before the MQTT worker is started.
static String customRootCA;
static constexpr size_t MAX_CA_LENGTH = 8192;

const char* current() {
    return customRootCA.isEmpty() ? DEFAULT_ROOT_CA : customRootCA.c_str();
}

bool valid(const String& pem) {
    if (pem.length() > MAX_CA_LENGTH ||
        !pem.startsWith("-----BEGIN CERTIFICATE-----") ||
        !pem.endsWith("-----END CERTIFICATE-----")) return false;

    // The PEM parser permits unrelated text between certificates. Accept only
    // certificate blocks and whitespace, never embedded keys or ignored data.
    size_t offset = 0;
    while (offset < pem.length()) {
        while (offset < pem.length() &&
            (pem[offset] == ' ' || pem[offset] == '\r' || pem[offset] == '\n' || pem[offset] == '\t')) ++offset;
        if (offset == pem.length()) break;
        if (!pem.startsWith("-----BEGIN CERTIFICATE-----", offset)) return false;
        int end = pem.indexOf("-----END CERTIFICATE-----", offset);
        if (end < 0) return false;
        for (size_t i = offset + 27; i < static_cast<size_t>(end); ++i) {
            char ch = pem[i];
            if (!((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
                (ch >= '0' && ch <= '9') || ch == '+' || ch == '/' || ch == '=' ||
                ch == '\r' || ch == '\n' || ch == ' ' || ch == '\t')) return false;
        }
        offset = end + 25;
    }

    mbedtls_x509_crt chain;
    mbedtls_x509_crt_init(&chain);
    bool result = mbedtls_x509_crt_parse(&chain,
        reinterpret_cast<const unsigned char*>(pem.c_str()), pem.length() + 1) == 0;
    for (const mbedtls_x509_crt* cert = &chain; result && cert; cert = cert->next) {
        result = cert->ca_istrue &&
            mbedtls_x509_crt_check_key_usage(cert, MBEDTLS_X509_KU_KEY_CERT_SIGN) == 0;
    }
    mbedtls_x509_crt_free(&chain);
    return result;
}

void load() {
    Preferences storage;
    if (!storage.begin("kage", true)) return;
    String saved = storage.getString("RootCA", "");
    storage.end();
    saved.trim();
    if (valid(saved)) customRootCA = saved;
    else customRootCA = "";
}

bool save(const String& pem) {
    if (!valid(pem)) return false;
    Preferences storage;
    if (!storage.begin("kage", false)) return false;
    bool saved = storage.putString("RootCA", pem) == pem.length();
    storage.end();
    if (saved) customRootCA = pem;
    return saved;
}

bool reset() {
    Preferences storage;
    if (!storage.begin("kage", false)) return false;
    bool removed = !storage.isKey("RootCA") || storage.remove("RootCA");
    storage.end();
    if (removed) customRootCA = "";
    return removed;
}

}

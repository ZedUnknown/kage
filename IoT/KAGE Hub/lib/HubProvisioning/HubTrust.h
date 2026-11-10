#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <mbedtls/x509_crt.h>

namespace HubTrust {

// Owned storage remains alive for WiFiClientSecure's borrowed CA pointer.
// Only changed during provisioning, before the MQTT worker is started.
static String customRootCA;
static constexpr size_t MAX_CA_LENGTH = 8192;

const char* current() {
    return customRootCA.c_str();
}

bool configured() {
    return !customRootCA.isEmpty();
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
    customRootCA = "";
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

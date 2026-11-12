
#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <esp_netif.h>
#include "HubTrust.h"
#include "SetupPage.h"
#include <LEDStates.h>

namespace HubProvisioning {

    static WebServer server(80);
    static DNSServer dnsServer;
    static bool dnsActive = false;

    static bool active = false;
    static bool restartPending = false;
    static unsigned long savedAt = 0;
    static bool ledTestRunning = false;
    static unsigned long ledTestStartedAt = 0;
    constexpr unsigned long LED_TEST_LOCK_DURATION_MS = 2000; // identifyLED: five 300 ms flashes and 100 ms gaps.

    bool rejectDuringRestart() {
        server.sendHeader("Cache-Control", "no-store");
        if (!restartPending) return false;
        server.send(409, "text/plain", "The hub is restarting. Reconnect after restart.");
        return true;
    }

    // [Hub Provisioning Wi-Fi Password]
    const char* AP_PASSWORD = "admin1234";

    void redirectToSetup() {
        server.sendHeader("Cache-Control", "no-store");
        server.sendHeader("Location", "http://192.168.4.1/");
        server.send(302, "text/plain", "Open the KAGE Hub setup page.");
    }

    bool advertiseSetupDns() {
        esp_netif_t* ap = esp_netif_get_handle_from_ifkey("WIFI_AP_DEF");
        if (!ap) return false;

        const esp_err_t stopped = esp_netif_dhcps_stop(ap);
        if (stopped != ESP_OK && stopped != ESP_ERR_ESP_NETIF_DHCP_ALREADY_STOPPED) return false;

        esp_netif_dns_info_t dns = {};
        dns.ip.type = ESP_IPADDR_TYPE_V4;
        dns.ip.u_addr.ip4.addr = static_cast<uint32_t>(IPAddress(192, 168, 4, 1));
        const esp_err_t configured = esp_netif_set_dns_info(ap, ESP_NETIF_DNS_MAIN, &dns);
        const esp_err_t started = esp_netif_dhcps_start(ap);
        return configured == ESP_OK &&
            (started == ESP_OK || started == ESP_ERR_ESP_NETIF_DHCP_ALREADY_STARTED);
    }


    // [Start Temporary Wi-Fi and Web Server]
    void start() {
        if (active) return;

        String apName = "KAGE-HUB-" +
            String((uint32_t)ESP.getEfuseMac(), HEX);

        apName.toUpperCase();

        WiFi.mode(WIFI_AP);
        if (!advertiseSetupDns()) {
            Serial.println("Could not advertise Hub setup DNS in the Wi-Fi lease.");
        }

        if (!WiFi.softAP(apName.c_str(), AP_PASSWORD)) {
            Serial.println("Failed to start Hub setup Wi-Fi.");
            return;
        }

        Serial.println("Hub provisioning mode started.");
        Serial.println("Wi-Fi: " + apName);
        Serial.println("Setup URL: http://192.168.4.1");


        // [Setup Web Page]
        server.on("/", HTTP_GET, []() {
            const String host = server.hostHeader();
            if (host.length() && host != "192.168.4.1" && host != "192.168.4.1:80") {
                redirectToSetup();
                return;
            }

            server.sendHeader("Cache-Control", "no-store");

            server.send_P(200, "text/html; charset=utf-8", HUB_SETUP_PAGE);
        });

        // captive portal paths for different operating systems
        const char* const captiveProbePaths[] = {
            "/generate_204", "/gen_204",             // Android
            "/hotspot-detect.html", "/library/test/success.html", // iOS/macOS
            "/connecttest.txt", "/ncsi.txt", "/redirect" // Windows
        };
        for (const char* path : captiveProbePaths) {
            server.on(path, HTTP_GET, redirectToSetup);
        }

        server.on("/test-led", HTTP_POST, []() {
            if (rejectDuringRestart()) return;
            if (ledTestRunning) {
                server.send(409, "text/plain", "LED test already running. Wait a moment and try again.");
                return;
            }
            ledTestStartedAt = millis();
            ledTestRunning = true;
            identifyLED();
            server.send(200, "text/plain", "LED test started.");
        });

        server.on("/root-ca", HTTP_GET, []() {
            server.sendHeader("Cache-Control", "no-store");
            server.sendHeader("X-CA-Source", HubTrust::configured() ? "custom" : "none");
            server.send(200, "text/plain", HubTrust::current());
        });

        server.on("/root-ca", HTTP_POST, []() {
            if (rejectDuringRestart()) return;
            String pem = server.arg("RootCA");
            pem.trim();
            if (!HubTrust::valid(pem)) {
                server.send(400, "text/plain", "Invalid root CA. Paste PEM CA certificates only (maximum 8192 bytes). The current CA has not changed.");
                return;
            }
            if (!HubTrust::save(pem)) {
                server.send(500, "text/plain", "Could not save the root CA to device storage. Please try again.");
                return;
            }
            server.send(200, "text/plain", "Custom root CA saved. It will be used for the next MQTT connection.");
        });

        server.on("/root-ca/reset", HTTP_POST, []() {
            if (rejectDuringRestart()) return;
            if (!HubTrust::reset()) {
                server.send(500, "text/plain", "Could not clear the root CA in device storage. Please try again.");
                return;
            }
            server.send(200, "text/plain", "Saved root CA cleared. Save a root CA before restarting the hub.");
        });

        // [Receive and Save Configuration]
        server.on("/save", HTTP_POST, []() {

            if (rejectDuringRestart()) return;

            if (!HubTrust::configured()) {
                server.send(400, "text/plain", "Save a valid root CA under TLS trust before restarting the hub.");
                return;
            }

            String wifiSSID = server.arg("WiFiSSID");
            String wifiPassword = server.arg("WiFiPassword");
            String mqttServer = server.arg("MQTTServer");
            String mqttPort = server.arg("MQTTPort");
            String hubId = server.arg("HubId");
            String hubToken = server.arg("HubToken");

            long port = mqttPort.toInt();
            bool validPort = mqttPort.length() > 0 && mqttPort.length() <= 5;
            for (size_t i = 0; i < mqttPort.length(); ++i) {
                if (mqttPort[i] < '0' || mqttPort[i] > '9') validPort = false;
            }

            wifiSSID.trim();
            mqttServer.trim();
            hubId.trim();

            if (
                wifiSSID == "" ||
                wifiPassword.length() < 8 ||
                wifiSSID.length() > 32 ||
                wifiPassword.length() > 63 ||
                mqttServer == "" ||
                mqttServer.length() > 253 ||
                mqttServer.indexOf("://") >= 0 ||
                mqttServer.indexOf(' ') >= 0 ||
                hubId == "" ||
                hubId.length() > 64 ||
                hubToken == "" ||
                hubToken.length() > 256 ||
                !validPort ||
                port < 1 || port > 65535
            ) {
                server.send(400, "text/plain",
                    "Invalid configuration. Check all fields.");
                return;
            }

            Preferences preferences;

            if (!preferences.begin("kage", false)) {
                server.send(500, "text/plain",
                    "Failed to access NVS.");
                return;
            }

            bool saved =
                preferences.putString("WiFiSSID", wifiSSID) > 0 &&
                preferences.putString("WiFiPassword", wifiPassword) > 0 &&
                preferences.putString("MQTTServer", mqttServer) > 0 &&
                preferences.putString("MQTTPort", mqttPort) > 0 &&
                preferences.putString("HubId", hubId) > 0 &&
                preferences.putString("HubToken", hubToken) > 0;

            preferences.end();

            if (!saved) {
                server.send(500, "text/plain",
                    "Failed to save configuration.");
                return;
            }

            Serial.println("Hub configuration saved to NVS.");

            server.sendHeader("Cache-Control", "no-store");
            server.send(200, "text/plain; charset=utf-8",
                "Configuration saved. The hub is restarting. You can now disconnect from its setup Wi-Fi.");

            savedAt = millis();
            restartPending = true;
        });

        // Probe URLs differ by OS version. Keep the existing API paths out of
        // the catchall, and redirect other HTTP GETs to the setup page.
        server.onNotFound([]() {
            const String uri = server.uri();
            if (server.method() == HTTP_GET &&
                uri != "/save" && uri != "/test-led" &&
                !uri.startsWith("/root-ca")) {
                redirectToSetup();
                return;
            }
            server.send(404, "text/plain", "Not found");
        });


        server.begin();
        active = true;
        dnsActive = dnsServer.start(53, "*", WiFi.softAPIP());
        if (!dnsActive) Serial.println("Captive portal DNS failed to start; use http://192.168.4.1.");

        Serial.println("Provisioning web server started.");
    }

    void stop() {
        if (!active) return;
        dnsServer.stop();
        dnsActive = false;
        server.stop();
        active = false;
    }


    // [Process Web Requests]
    void update() {
        if (!active) return;

        if (dnsActive) dnsServer.processNextRequest();
        server.handleClient();

        if (ledTestRunning) {
            if (millis() - ledTestStartedAt >= LED_TEST_LOCK_DURATION_MS) {
                ledTestRunning = false;
            }
        }

        if (restartPending && millis() - savedAt >= 1500) {
            stop();
            ESP.restart();
        }
        delay(1);
    }

}

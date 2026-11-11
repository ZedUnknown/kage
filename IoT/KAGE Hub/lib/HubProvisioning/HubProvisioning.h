
#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include "HubTrust.h"
#include "SetupPage.h"
#include <LEDStates.h>

namespace HubProvisioning {

    static WebServer server(80);

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

    // [Hub Provisioning Wi-Fi AP Password]
    const char* AP_PASSWORD = "admin1234";


    // [Start Temporary Wi-Fi and Web Server]
    void start() {
        String apName = "KAGE-HUB-" +
            String((uint32_t)ESP.getEfuseMac(), HEX);

        apName.toUpperCase();

        WiFi.mode(WIFI_AP);

        if (!WiFi.softAP(apName.c_str(), AP_PASSWORD)) {
            Serial.println("Failed to start Hub setup Wi-Fi.");
            return;
        }

        Serial.println("Hub provisioning mode started.");
        Serial.println("Wi-Fi: " + apName);
        Serial.println("Setup URL: http://192.168.4.1");


        // [Setup Web Page]
        server.on("/", HTTP_GET, []() {

            server.sendHeader("Cache-Control", "no-store");

            server.send_P(200, "text/html; charset=utf-8", HUB_SETUP_PAGE);
        });

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


        server.begin();
        active = true;

        Serial.println("Provisioning web server started.");
    }


    // [Process Web Requests]
    void update() {
        if (!active) return;

        server.handleClient();

        if (ledTestRunning) {
            if (millis() - ledTestStartedAt >= LED_TEST_LOCK_DURATION_MS) {
                ledTestRunning = false;
            }
        }

        if (restartPending && millis() - savedAt >= 1500) {
            ESP.restart();
        }
        delay(1);
    }

}

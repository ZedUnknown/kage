#include <Arduino.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h> // MQTT client library
#include <cJSON.h>
#include <sys/time.h>
#include <KageHNProtocol.h>
#include <Declarations.h>
#include <SyncTime.h>
#include <HubProvisioning.h>

String live_prefix = "kage/hub/live/";

// [NVS Variables]
// : Hub ID and Token
String hubId;
String hubToken;

// : Wi-Fi Credentials
String WiFiSSID;
String WiFiPassword;

// : MQTT Server and Port
String mqttServer;
int mqttPort;

// : Paired Nodes List
const int MAX_PAIRED_NODES = 100;
uint8_t pairedNodeMacs[MAX_PAIRED_NODES][6];  // [0]  → Node MAC, 6 bytes
                                              // [99] → Node MAC, 6 bytes

// [Runtime Variables]
uint8_t approvedNodeMac[MAX_PAIRED_NODES][6]; // Approved Node MAC address for pairing

// [NVS Storage]
Preferences preferences;

// [Read NVS]
String readNVS(const String& key) {
    preferences.begin("kage", true); // Read-only mode

    String value = preferences.getString(key.c_str(), "");

    preferences.end();
    return value;
}

// [Write NVS]
bool writeNVS(
    const String& key,
    const String& value
) {
    if (!preferences.begin("kage", false)) return false; // Read-write mode

    size_t bytesWritten = preferences.putString(
        key.c_str(),
        value
    );

    preferences.end();
    return bytesWritten > 0;
}


// [Load Paired Nodes]
bool loadPairedNodes() {
    preferences.begin("kage", true);

    // Start with every slot empty (C++ garbage values stuff)
    memset(pairedNodeMacs, 0, sizeof(pairedNodeMacs));

    // Take the stored data from NVS
    size_t storedBytes = preferences.getBytesLength("pairedNodeMacs");
    size_t pairedNodeCount = storedBytes / 6; // Each MAC address is 6 bytes

    // No paired Nodes have been stored yet
    if (storedBytes == 0) {
        preferences.end();
        Serial.println("No paired Nodes stored.");
        return true;
    }

    // Every MAC must consist of exactly 6 bytes
    if (storedBytes % 6 != 0) {
        preferences.end();
        Serial.println("Error: Invalid paired Node data.");
        return false;
    }

    if (
        pairedNodeCount > MAX_PAIRED_NODES ||
        storedBytes > sizeof(pairedNodeMacs)
    ) {
        preferences.end();
        Serial.println("Error: Stored paired Nodes exceed the maximum limit.");
        return false;
    }

    // Load the paired Node MAC addresses into the array
    size_t bytesRead = preferences.getBytes(
        "pairedNodeMacs",
        pairedNodeMacs,
        storedBytes
    );

    preferences.end();
    if (bytesRead != storedBytes) {
        Serial.println("Failed to load paired Nodes.");
        return false;
    }
    Serial.println("Paired Nodes loaded.");
    return true;
}

// [Save Paired Nodes]
bool savePairedNodes() {
    if (!preferences.begin("kage", false)) return false; // Read-write mode

    size_t bytesWritten =
        preferences.putBytes(
            "pairedNodeMacs",
            pairedNodeMacs,
            sizeof(pairedNodeMacs)
        );

    preferences.end();

    if (bytesWritten == sizeof(pairedNodeMacs)) {
        Serial.println("Paired Nodes saved to NVS.");
        return true;
    }

    Serial.println("Failed to save paired Nodes.");
    return false;
}

// [Remove Paired Node]
bool removePairedNode(const uint8_t* macAddress) {
    for (int i = 0; i < MAX_PAIRED_NODES; ++i) {
        if (memcmp(pairedNodeMacs[i], macAddress, 6) == 0) { // 0 = MAC addresses match
            memset(pairedNodeMacs[i], 0, 6); // Clear the MAC address
            if (savePairedNodes()) return true;
            memcpy(pairedNodeMacs[i], macAddress, 6);
            return false;
        }
    }

    return false;
}

// [Add Paired Node]
// : for macAddress that use the 6-byte array representation
bool addPairedNode(const uint8_t* macAddress) {
    for (int i = 0; i < MAX_PAIRED_NODES; ++i) {
        if (memcmp(pairedNodeMacs[i], macAddress, 6) == 0) {
            Serial.println("Node already paired.");
            return true;
        }
    }

    // Check every existing MAC before filling an empty slot.
    for (int i = 0; i < MAX_PAIRED_NODES; ++i) {
        if (isEmptyMac(pairedNodeMacs[i])) {
            memcpy(pairedNodeMacs[i], macAddress, 6);
            if (savePairedNodes()) {
                Serial.println("Node added successfully.");
                return true;
            }
            memset(pairedNodeMacs[i], 0, 6);
            return false;
        }
    }

    return false;
}

// : for macAddress that use the string representation (e.g., "AA:BB:CC:DD:EE:FF")
bool addPairedNode(const char* macAddress) {
    uint8_t macBytes[6];
    if (!macStringToBytes(macAddress, macBytes)) {
        Serial.println("Invalid MAC address format.");
        return false;
    }

    return addPairedNode(macBytes);
}


// [Clear Paired Nodes]
void clearPairedNodes() {
    preferences.begin("kage", false);

    // Must match the exact key used by savePairedNodes()
    preferences.remove("pairedNodeMacs");

    preferences.end();


    // Clear runtime copy
    memset(
        pairedNodeMacs,
        0,
        sizeof(pairedNodeMacs)
    );

    Serial.println("TEST: Paired Node data cleared.");
}

// [Clear Wi-Fi Credentials]
void clearWiFiCredentials() {
    preferences.begin("kage", false);

    // Remove Wi-Fi credentials from NVS
    preferences.remove("WiFiSSID");
    preferences.remove("WiFiPassword");

    preferences.end();

    // Clear runtime copy
    WiFiSSID = "";
    WiFiPassword = "";

    Serial.println("TEST: Wi-Fi credentials cleared.");
}

// [Clear Token and Hub ID]
void clearTokenAndHubId() {
    preferences.begin("kage", false);

    // Remove Hub ID and Token from NVS
    preferences.remove("HubId");
    preferences.remove("HubToken");

    preferences.end();

    // Clear runtime copy
    hubId = "";
    hubToken = "";

    Serial.println("TEST: Hub ID and Token cleared.");
}

// [Clear MQTT Credentials]
void clearMQTTCredentials() {
    preferences.begin("kage", false);

    // Remove MQTT credentials from NVS
    preferences.remove("MQTTServer");
    preferences.remove("MQTTPort");

    preferences.end();

    // Clear runtime copy
    mqttServer = "";
    mqttPort = 0;

    Serial.println("TEST: MQTT credentials cleared.");
}


bool isEmptyMac(const uint8_t* macAddress) {
    const uint8_t emptyMac[6] = {
        0, 0, 0, 0, 0, 0
    };

    return memcmp(macAddress, emptyMac, 6) == 0;
}

// [is Node Paired]
bool isNodePaired(const uint8_t* macAddress) {
    if (isEmptyMac(macAddress) || (macAddress[0] & 1)) return false;
    for (int i = 0; i < MAX_PAIRED_NODES; ++i) {
        if (memcmp(pairedNodeMacs[i], macAddress, 6) == 0) {
            return true;
        }
    }
    return false;
}

bool isNodeApproved(const uint8_t* macAddress) {
    if (isEmptyMac(macAddress)) return false;
    for (int i = 0; i < MAX_PAIRED_NODES; ++i) {
        if (memcmp(approvedNodeMac[i], macAddress, 6) == 0) return true;
    }
    return false;
}

// add approvedNodeMac to the list of approved Node MAC addresses for pairing
bool addApprovedNodeMac(const uint8_t* macAddress) {
    if (isEmptyMac(macAddress) || (macAddress[0] & 1)) return false;
    for (int i = 0; i < MAX_PAIRED_NODES; ++i) {
        if (memcmp(approvedNodeMac[i], macAddress, 6) == 0) {
            Serial.println("Node already approved for pairing.");
            return true;
        }
    }

    // Check every existing MAC before filling an empty slot.
    for (int i = 0; i < MAX_PAIRED_NODES; ++i) {
        if (isEmptyMac(approvedNodeMac[i])) {
            memcpy(approvedNodeMac[i], macAddress, 6);
            Serial.println("Node approved for pairing successfully.");
            return true;
        }
    }

    Serial.println("Failed to approve Node for pairing. No empty slots available.");
    return false;
}

// remove approvedNodeMac from the list of approved Node MAC addresses for pairing
bool removeApprovedNodeMac(const uint8_t* macAddress) {
    for (int i = 0; i < MAX_PAIRED_NODES; ++i) {
        if (memcmp(approvedNodeMac[i], macAddress, 6) == 0) {
            memset(approvedNodeMac[i], 0, 6);
            Serial.println("Node removed from approved list successfully.");
            return true;
        }
    }

    Serial.println("Failed to remove Node from approved list. MAC address not found.");
    return false;
}

// [Provisioning Mode]
void provisioningMode_HubCredentials() {
    Serial.println("Provisioning mode activated.");

    Serial.println("Enter Hub ID:");
    while (Serial.available() == 0) {} // Wait for user input
    hubId = Serial.readStringUntil('\n');
    hubId.trim();

    Serial.println("Enter Hub Token:");
    while (Serial.available() == 0) {} // Wait for user input
    hubToken = Serial.readStringUntil('\n');
    hubToken.trim();

    // Save to NVS
    String writeResult = writeNVS("HubId", hubId) && writeNVS("HubToken", hubToken) ?
        "Hub ID and Token saved successfully." :
        "Failed to save Hub ID and Token.";
    Serial.println(writeResult);

    // Restart the ESP32
    ESP.restart();
}

void provisioningMode_WiFiCredentials() {
    Serial.println("Provisioning mode activated for Wi-Fi credentials.");

    Serial.println("Enter Wi-Fi SSID:");
    while (Serial.available() == 0) {} // Wait for user input
    WiFiSSID = Serial.readStringUntil('\n');
    WiFiSSID.trim();

    Serial.println("Enter Wi-Fi Password:");
    while (Serial.available() == 0) {} // Wait for user input
    WiFiPassword = Serial.readStringUntil('\n');
    WiFiPassword.trim();

    // Save to NVS
    String writeResult = writeNVS("WiFiSSID", WiFiSSID) && writeNVS("WiFiPassword", WiFiPassword) ?
        "Wi-Fi credentials saved successfully." :
        "Failed to save Wi-Fi credentials.";
    Serial.println(writeResult);

    // Restart the ESP32
    ESP.restart();
}

// [Connect to Wi-Fi]
WiFiClientSecure wifiClient;

bool wifiAttemptRunning = false;

unsigned long wifiAttemptStartedAt = 0;
const unsigned long wifiAttemptTimeout = 15000; // 15 seconds

bool wifiWasConnected = false;

int wifiReconnectAttempts = 0;

unsigned long lastWiFiReconnectAttempt = 0;
const unsigned long wifiReconnectInterval = 5000;

void connectToWiFi() {
    wifiAttemptStartedAt = millis();
    lastWiFiReconnectAttempt = millis();
    wifiAttemptRunning = true;

    Serial.println("Starting WiFi connection...");
    WiFi.begin(
        WiFiSSID.c_str(),
        WiFiPassword.c_str()
    );
}

void checkWiFiConnection() {
    if (WiFi.status() == WL_CONNECTED) {
        if (!wifiWasConnected) {
            Serial.println("WiFi connected successfully.");
            Serial.print("IP Address: ");
            Serial.println(WiFi.localIP());
            Serial.println("WiFi channel: " + String(WiFi.channel()));
        }

        wifiWasConnected = true;
        wifiAttemptRunning = false;
        wifiReconnectAttempts = 0;
        return;
    }

    if (wifiWasConnected) {
        Serial.println("WiFi connection lost.");
        wifiWasConnected = false;
    }

    if (wifiAttemptRunning) {
        if (millis() - wifiAttemptStartedAt < wifiAttemptTimeout) {
            return;
        }

        wifiAttemptRunning = false;
        ++wifiReconnectAttempts;
        Serial.println("WiFi connection attempt timed out.");
    }

    if (millis() - lastWiFiReconnectAttempt >= wifiReconnectInterval) {
        connectToWiFi();
    }
}

// [MQTT Client Setup]
PubSubClient mqttClient(wifiClient);

// MQTT owns its socket on a separate task. The main loop owns all pairing/NVS
// state and ESP-NOW sends; commands and publications cross bounded queues.
struct MQTTMessage {
    char topic[160];
    char payload[256];
    bool retained;
};
QueueHandle_t mqttIncoming = nullptr;
QueueHandle_t mqttOutgoing = nullptr;
std::atomic<bool> mqttOnline{false};
std::atomic<uint32_t> mqttCommandDrops{0};
// Fresh presence lets the admin worker recover after it reconnects. Retained
// startup status alone is deliberately not treated as live presence by KAGE.
const unsigned long mqttStatusInterval = 15000;
unsigned long mqttStatusLastSentAt = 0;


bool connectToMQTT() {
    if (!HubTrust::configured()) {
        Serial.println("MQTT requires a saved root CA. Configure it in Hub setup.");
        return false;
    }
    mqttClient.setServer(mqttServer.c_str(), mqttPort);
    mqttClient.setKeepAlive(10);
    wifiClient.setCACert(HubTrust::current());
    // wifiClient.setInsecure();
    // mqttClient.setSocketTimeout(5);
    // wifiClient.setTimeout(5000);

    Serial.println("TLS trust: saved root CA");

    // Topic
    String _topic = live_prefix + hubId + "/status";

    printf("Connecting to MQTT broker at %s:%d...\n", mqttServer.c_str(), mqttPort);

    time_t now = time(nullptr);
    Serial.print("TLS system time: ");
    Serial.print(ctime(&now));

    if (!mqttClient.connected()) {

        Serial.print("Attempting MQTT connection...");

        bool connected = mqttClient.connect(
            hubId.c_str(),      // MQTT Client ID
            hubId.c_str(),      // MQTT Username
            hubToken.c_str(),   // MQTT Password

            // Last Will and Testament (LWT)
            // If I were to disappear from the network, publish offline on my status topic for me.
            _topic.c_str(),     // Last Will topic
            1,                  // Last Will QoS
            true,               // Last Will retained | save the last will message on the broker
            "offline"           // Last Will message (payload)
        );

        if (connected) {
            Serial.println();
            Serial.println("Connected to MQTT broker!");

            // Deploy subscriptions before publishing
            deploySubscriptions();
            mqttStatusLastSentAt = millis() - mqttStatusInterval;

            // Publish "online" status to the topic
            bool isPublished = mqttPublish(
                _topic,
                "online",
                true
            );

            /*
                "online": The payload (message body) being sent. In this case, it tells other subscribed clients that this device is now active.

                true: The retained flag. Setting this to true instructs the MQTT broker to save this specific message.
                      Any new client that subscribes to this topic in the future will immediately receive this "online" status, even if the device published it hours ago.
            */

            if (isPublished) {
                Serial.println("Published 'online' status to topic: " + _topic);

            } else {
                Serial.println("Failed to publish 'online' status to topic: " + _topic);
            }

        } else {
            Serial.print("Failed to connect, rc=");

            int state = mqttClient.state();
            Serial.println(state);

            char tlsError[160] = {};
            int tlsCode = wifiClient.lastError(tlsError, sizeof(tlsError));
            if (tlsCode != 0) Serial.printf("TLS error %d: %s\n", tlsCode, tlsError);

            if (state == 4 || state == 5) {
                Serial.println("MQTT credentials rejected; retaining radio and pairing state.");
            } else {
                Serial.println("Retrying in 5 seconds...");
            }
        }

        return connected;
    }

    return true;
}

bool mqttAttempted = false;
unsigned long lastMQTTAttemptFinished = 0;
int mqttReconnectAttempts = 0;

// validate the admin server through MQTT once at startup, 3 attempts
const int mqttPingMaxAttempts = 3;
const unsigned long mqttPingTimeout = 5000;

enum class MQTTPingStatus {
    NotStarted,
    Waiting,
    RetryDelay,
    Passed,
    Failed,
    Provisioning
};

// MQTT worker owns the count and timer, and is the only task changing status.
int mqttPingAttempts = 0;
unsigned long mqttPingStartedAt = 0;
bool mqttBrokerReached = false;
char mqttPingRequestId[33] = {};
const unsigned long mqttAdminRetryDelay = 30000;
std::atomic<MQTTPingStatus> mqttPingStatus{MQTTPingStatus::NotStarted};

void checkMQTTConnection() {
    if (mqttPingStatus != MQTTPingStatus::Passed) {
        if (mqttPingStatus == MQTTPingStatus::RetryDelay) {
            if (mqttClient.connected()) mqttClient.loop();
            if (millis() - mqttPingStartedAt < mqttAdminRetryDelay) return;
            mqttPingAttempts = 0;
            mqttPingStatus = MQTTPingStatus::NotStarted;
        }
        if (mqttPingStatus == MQTTPingStatus::Waiting) {
            if (mqttClient.connected()) mqttClient.loop();
            if (mqttPingStatus == MQTTPingStatus::Passed) return;
            if (millis() - mqttPingStartedAt < mqttPingTimeout) return;

            mqttPingStatus = MQTTPingStatus::NotStarted;
            Serial.println("MQTT ping attempt failed: no valid KAGE response.");
            if (mqttPingAttempts >= mqttPingMaxAttempts) {
                if (mqttBrokerReached) {
                    Serial.println("Broker login succeeded but KAGE admin did not reply. Retrying in 30 seconds.");
                    mqttPingStartedAt = millis();
                    mqttPingStatus = MQTTPingStatus::RetryDelay;
                    return;
                }
                mqttPingStatus = MQTTPingStatus::Failed;
                return;
            }
        }

        // Wi-Fi and clock failures are handled by their existing recovery paths.
        if (WiFi.status() != WL_CONNECTED || !syncTime()) return;

        ++mqttPingAttempts;
        Serial.printf("MQTT ping attempt %d/%d\n", mqttPingAttempts, mqttPingMaxAttempts);
        bool connected = connectToMQTT();
        mqttPingStartedAt = millis();
        mqttPingStatus = MQTTPingStatus::Waiting;
        if (connected) {
            mqttBrokerReached = true;

            // Give this ping a new ID so we can match its reply.
            const char hexDigits[] = "0123456789abcdef";
            for (int i = 0; i < 32; i++) {
                mqttPingRequestId[i] = hexDigits[esp_random() % 16];
            }
            mqttPingRequestId[32] = '\0';

            String request = String("{\"request_id\":\"") + mqttPingRequestId + "\"}";
            if (!mqttPublish(live_prefix + hubId + "/ping_request", request)) {
                Serial.println("MQTT ping could not be queued.");
            }
        }
        return;
    }

    if (WiFi.status() == WL_CONNECTED && syncTime()) {
        if (mqttClient.connected()) {
            if (mqttAttempted) Serial.println("MQTT connected successfully.");
            mqttReconnectAttempts = 0;
            mqttAttempted = false;
        } else if (
            !mqttAttempted ||
            millis() - lastMQTTAttemptFinished >= 5000
        ) {
            mqttAttempted = true;
            bool connected = connectToMQTT();
            lastMQTTAttemptFinished = millis();

            if (connected) {
                mqttReconnectAttempts = 0;
            } else {
                ++mqttReconnectAttempts;
            }
        }

        if (mqttClient.connected()) {
            mqttClient.loop();
        }
    }
}

// [MQTT Utils]
bool mqttSubscribe(const String& topic) {
    bool isSubscribed = mqttClient.subscribe(topic.c_str());

    if (isSubscribed) {
        Serial.println("Subscribed to topic: " + String(topic));
        return true;
    } else {
        Serial.println("Failed to subscribe to topic: " + String(topic));
        return false;
    }
};

bool mqttPublish(const String& topic, const String& payload, bool retained) {
    MQTTMessage message = {};
    if (mqttOutgoing == nullptr || topic.length() >= sizeof(message.topic) || payload.length() >= sizeof(message.payload)) {
        Serial.println("MQTT publication too large or queue not initialized.");
        return false;
    }
    memcpy(message.topic, topic.c_str(), topic.length() + 1);
    memcpy(message.payload, payload.c_str(), payload.length() + 1);
    message.retained = retained;
    if (xQueueSend(mqttOutgoing, &message, 0) != pdTRUE) {
        Serial.println("MQTT outgoing queue full; publication not queued: " + topic);
        return false;
    }
    return true;
};


/*
[MQTT Listener]
: call by the PubSubClient library when an MQTT message is received.
*/
void mqttListener(char* topic, byte* payload, unsigned int length) {
    MQTTMessage message = {};
    if (strlen(topic) >= sizeof(message.topic) || length >= sizeof(message.payload)) {
        ++mqttCommandDrops;
        return;
    }
    strcpy(message.topic, topic);
    memcpy(message.payload, payload, length);
    if (String(topic) == live_prefix + hubId + "/ping_response") {
        // Keep ping state changes on the MQTT worker. Other commands remain
        // queued for the main loop, which owns pairing and NVS operations.
        handleMQTTMessage(String(message.topic), String(message.payload));
        return;
    }
    if (xQueueSend(mqttIncoming, &message, 0) != pdTRUE) ++mqttCommandDrops;
}

void mqttWorker(void*) {
    MQTTMessage pending = {};
    bool havePending = false;
    for (;;) {
        checkMQTTConnection();
        if (mqttPingStatus == MQTTPingStatus::Failed) {
            // Stop socket access before the main loop switches Wi-Fi into
            // provisioning mode. Saved credentials remain available.
            mqttClient.disconnect();
            mqttOnline.store(false);
            mqttPingStatus = MQTTPingStatus::Provisioning;
            vTaskDelete(nullptr);
            return;
        }
        mqttOnline.store(WiFi.status() == WL_CONNECTED && mqttClient.connected());
        if (mqttOnline.load()) {
            if (millis() - mqttStatusLastSentAt >= mqttStatusInterval) {
                String statusTopic = live_prefix + hubId + "/status";
                if (mqttClient.publish(statusTopic.c_str(), "online", false)) {
                    mqttStatusLastSentAt = millis();
                }
            }
            if (!havePending) havePending = xQueueReceive(mqttOutgoing, &pending, 0) == pdTRUE;
            if (havePending && mqttClient.publish(pending.topic, pending.payload, pending.retained)) {
                Serial.println("Published to topic: " + String(pending.topic) + " | Payload: " + String(pending.payload));
                havePending = false;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void processMQTTCommands() {
    MQTTMessage message;
    // Bound work per turn so even command bursts cannot starve radio handling.
    for (int i = 0; i < 4 && xQueueReceive(mqttIncoming, &message, 0) == pdTRUE; ++i) {
        Serial.println("Received MQTT command: " + String(message.topic) + " | " + String(message.payload));
        handleMQTTMessage(String(message.topic), String(message.payload));
    }
}

// [Deploy Subscriptions]
void deploySubscriptions() {
    // Pairing Request Confirmation
    String pairingTopic = live_prefix + hubId + "/pairing_response/+";
    mqttSubscribe(pairingTopic); // + is a wildcard for the Node's MAC address

    // Unpair Request
    String unpairTopic = live_prefix + hubId + "/unpair_response/+";
    mqttSubscribe(unpairTopic); // + is a wildcard for the Node's MAC address

    // Ping Response
    String pingResponseTopic = live_prefix + hubId + "/ping_response";
    mqttSubscribe(pingResponseTopic);

    // One command topic per Hub; the target Node MAC is in the JSON payload.
    String identifyTopic = live_prefix + hubId + "/identify";
    mqttSubscribe(identifyTopic);
}


// [Handle MQTT Messages from Subscriptions]
void handleMQTTMessage(const String& topic, const String& message) {

    if (topic == live_prefix + hubId + "/ping_response") {
        if (mqttPingStatus != MQTTPingStatus::Waiting) return;

        cJSON* response = cJSON_ParseWithOpts(message.c_str(), nullptr, true);
        const cJSON* data = cJSON_GetObjectItemCaseSensitive(response, "data");
        const cJSON* key = cJSON_GetObjectItemCaseSensitive(data, "key");
        const cJSON* requestId = cJSON_GetObjectItemCaseSensitive(response, "request_id");
        bool valid = cJSON_IsObject(data) && cJSON_IsString(key) &&
            strcmp(key->valuestring, "KAGE") == 0 && cJSON_IsString(requestId) &&
            mqttPingRequestId[0] != '\0' && strcmp(requestId->valuestring, mqttPingRequestId) == 0;
        cJSON_Delete(response);

        if (valid) {
            mqttPingStatus = MQTTPingStatus::Passed;
            Serial.println("MQTT ping validated: KAGE admin server is running.");
        } else {
            Serial.println("Invalid MQTT ping response; expected KAGE and the current request_id.");
        }
        return;
    }

    // [ Handle identify command ]
    // : kage/hub/<hubId>/identify
    if (topic == live_prefix + hubId + "/identify") {
        cJSON* command = cJSON_ParseWithOpts(message.c_str(), nullptr, true);
        const cJSON* version = cJSON_GetObjectItemCaseSensitive(command, "version");
        const cJSON* mac = cJSON_GetObjectItemCaseSensitive(command, "mac_address");
        const cJSON* id = cJSON_GetObjectItemCaseSensitive(command, "command_id");
        const cJSON* deadline = cJSON_GetObjectItemCaseSensitive(command, "deadline");

        bool validId = cJSON_IsString(id) && id->valuestring[0] != '\0' && strlen(id->valuestring) <= 64;
        if (validId) {
            for (const char* p = id->valuestring; *p; ++p) {
                if (!isalnum((unsigned char)*p) && *p != '-' && *p != '_' && *p != '.') {
                    validId = false;
                    break;
                }
            }
        }

        uint8_t macBytes[6] = {};
        bool validMac = cJSON_IsString(mac) && macStringToBytes(mac->valuestring, macBytes);
        const char* status = "rejected";
        const char* reason = nullptr;

        if (!cJSON_IsObject(command)) {
            reason = "invalid_json";
        } else if (!validId) {
            reason = "invalid_command_id";
        } else if (!cJSON_IsNumber(version) || version->valuedouble != 1) {
            reason = "unsupported_version";
        } else if (!validMac) {
            reason = "invalid_mac_address";
        } else if (!cJSON_IsNumber(deadline) || !isfinite(deadline->valuedouble) ||
                deadline->valuedouble <= 0 || deadline->valuedouble > 9007199254740991.0 ||
                floor(deadline->valuedouble) != deadline->valuedouble) {
            reason = "invalid_deadline";
        } else if (!isNodePaired(macBytes)) {
            reason = "node_not_paired";
        } else {
            time_t now = time(nullptr);
            if (now < 1700000000) {
                reason = "clock_not_synchronized";
            } else if (deadline->valuedouble <= (double)now) {
                reason = "deadline_expired";
            } else {
                // The current Node firmware identifies on TEST_PACKET_REQUEST.
                // Command ID and deadline remain Hub-side until dedicated packets exist.
                ESPNowPacket request = {};
                request.packetType = PacketTypes::TEST_PACKET_REQUEST;
                request.wifiChannel = WiFi.channel();
                if (sendPacket(macBytes, request)) {
                    status = "dispatched";
                } else {
                    status = "delivery_failed";
                    reason = "radio_send_failed";
                }
            }
        }

        cJSON* result = cJSON_CreateObject();
        if (result != nullptr) {
            cJSON_AddNumberToObject(result, "version", 1);
            if (validId) cJSON_AddStringToObject(result, "command_id", id->valuestring);
            if (validMac) {
                char canonicalMac[18];
                macBytesToString(macBytes, canonicalMac, sizeof(canonicalMac));
                cJSON_AddStringToObject(result, "mac_address", canonicalMac);
            }
            cJSON_AddStringToObject(result, "status", status);
            if (reason != nullptr) cJSON_AddStringToObject(result, "reason", reason);
            char* payload = cJSON_PrintUnformatted(result);
            if (payload != nullptr) {
                mqttPublish(live_prefix + hubId + "/identify_result", String(payload));
                cJSON_free(payload);
            }
            cJSON_Delete(result);
        }
        cJSON_Delete(command);
        return;
    }

    // [ Handle pairing response ]
    // : kage/hub/<hubId>/pairing_response/AA:BB:CC:DD:EE:FF
    String pairingResponsePrefix = live_prefix + hubId + "/pairing_response/";
    if (topic.startsWith(pairingResponsePrefix)) {
        String nodeMacAddress = topic.substring(pairingResponsePrefix.length());
        Serial.println("Received pairing response from Node MAC: " + nodeMacAddress);

        Serial.println("Handling pairing response: " + message);
        if (message == "accept") {
            Serial.println("Pairing accepted by the admin.");
            // Convert MAC address string to byte array
            uint8_t macBytes[6];
            if (!macStringToBytes(nodeMacAddress.c_str(), macBytes)) {
                Serial.println("Invalid MAC address format.");
                return;
            }

            // Keep approval until a confirmation has been saved successfully.
            if (!addApprovedNodeMac(macBytes)) {
                Serial.println("Pairing approval could not be stored.");
            }
        } else if (message == "reject") {
            uint8_t macBytes[6];
            if (!macStringToBytes(nodeMacAddress.c_str(), macBytes)) {
                Serial.println("Invalid MAC address format.");
                return;
            }
            if (isNodeApproved(macBytes)) removeApprovedNodeMac(macBytes);
            Serial.println("Pairing rejected by the admin.");
        }
    }

    // [ Handle unpair response ]
    // : kage/hub/<hubId>/unpair_response/AA:BB:CC:DD:EE:FF
    else if (topic.startsWith(live_prefix + hubId + "/unpair_response/")) {
        String nodeMacAddress = topic.substring((live_prefix + hubId + "/unpair_response/").length());
        Serial.println("Received unpair response from Node MAC: " + nodeMacAddress);

        Serial.println("Handling unpair response: " + message);
        if (message == "accept") {
            Serial.println("Unpairing accepted by the admin.");
            // Send UNPAIR_RESPONSE packet to the Node
            ESPNowPacket unpairResponsePacket = {};
            unpairResponsePacket.packetType = PacketTypes::UNPAIR_RESPONSE;

            // Convert MAC address string to byte array
            uint8_t macBytes[6];
            if (!macStringToBytes(nodeMacAddress.c_str(), macBytes)) {
                Serial.println("Invalid MAC address format.");
                return;
            }

            bool success = sendPacket(
                macBytes,
                unpairResponsePacket
            );

            // Revoke any pending pairing approval even if the node is unreachable.
            if (isNodeApproved(macBytes)) removeApprovedNodeMac(macBytes);
            if (success) {
                // Radio delivery does not prove that the Node cleared NVS.
                Serial.println("Waiting for UNPAIR_RESPONSE_ACK from Node.");
            } else {
                Serial.println("Failed to send UNPAIR_RESPONSE packet to Node.");
            }

        } else if (message == "reject") {
            Serial.println("Unpairing rejected by the admin.");
        }
    }

    else {
        Serial.println("No handler for this topic.");
    }
}


/*
[ESP-NOW Packet Handler]
: call by the KageHNProtocol library when an ESP-NOW packet is received.

[PAIRING]
    Node ── PAIRING_REQUEST ─────> Hub
    Node <─ PAIRING_RESPONSE ───── Hub
    Node ── PAIRING_CONFIRM ──────> Hub
    Node <─ PAIRING_COMPLETE ────── Hub
    Node ── PAIRING_SAVED ────────> Hub
    Node <─ PAIRING_SAVED_ACK ────── Hub

[CONNECTION TEST]
    Node ── TEST_PACKET_REQUEST ──> Hub
    Node <─ TEST_PACKET_RESPONSE ── Hub

[DATA]
    Node ── DATA_PACKET ──────────> Hub

[UNPAIR]
    Either ── UNPAIR_REQUEST ─────> Other
    Either <─ UNPAIR_RESPONSE ───── Other
    Either <─ UNPAIR_RESPONSE_ACK ───── Other
*/

void packetHandler(
    const uint8_t* macAddress,
    const ESPNowPacket& receivedPacket
) {

    // Convert MAC address to string format
    char macString[18];

    snprintf(
        macString,
        sizeof(macString),
        "%02X:%02X:%02X:%02X:%02X:%02X",
        macAddress[0], macAddress[1], macAddress[2],
        macAddress[3], macAddress[4], macAddress[5]
    );

    Serial.print("Received packet from MAC: ");
    Serial.println(macString);

    Serial.print("Packet Type: ");
    switch (receivedPacket.packetType) {
        // received from Node when it wants to pair with the Hub
        case PacketTypes::PAIRING_REQUEST: {
            Serial.println("PAIRING_REQUEST");

            // A paired node may retry if it missed completion of the handshake.
            if (isNodeApproved(macAddress) || isNodePaired(macAddress)) {
                Serial.println("Approved or paired Node discovered. Sending PAIRING_RESPONSE");

                ESPNowPacket pairingResponsePacket = {};
                pairingResponsePacket.packetType = PacketTypes::PAIRING_RESPONSE;
                pairingResponsePacket.wifiChannel = WiFi.channel();

                bool success = sendPacket(
                    macAddress,
                    pairingResponsePacket
                );

                // Retain approval through failed sends and lost confirmations.
                // PAIRING_CONFIRM consumes it only after saving the paired node.
                Serial.println("PAIRING_RESPONSE packet sent to Node: " + String(success ? "Success" : "Failure"));
                break;
            }

            // Discovery is repeated on every PAIRING_REQUEST until the Node is approved or paired. The admin must approve the Node before it can pair with the Hub.
            if (!mqttOnline.load()) {
                Serial.println("Discovery received but MQTT is offline. Cannot send pairing request to admin.");
                break;
            }
            // Show pairing request to the admin via MQTT
            String pairingTopic = live_prefix + hubId + "/pairing_request";

            // Create a JSON payload with the MAC address of the Node
            String pairingPayload =
                "{\"mac_address\":\"" +
                String(macString) +
                "\"}";

            mqttPublish(pairingTopic, pairingPayload);
            // check: handleMQTTMessage()

            break;
        }

        // case PacketTypes::PAIRING_RESPONSE:
        //     Serial.println("PAIRING_RESPONSE");
        //     break;

        case PacketTypes::PAIRING_CONFIRM: {
            Serial.println("PAIRING_CONFIRM");

            if (!isNodeApproved(macAddress) && !isNodePaired(macAddress)) {
                Serial.println("Ignoring unapproved PAIRING_CONFIRM.");
                break;
            }

            // Failed saves leave approval available for a retry.
            if (!addPairedNode(macAddress)) break;

            ESPNowPacket pairingCompletePacket = {};
            pairingCompletePacket.packetType = PacketTypes::PAIRING_COMPLETE;
            pairingCompletePacket.wifiChannel = WiFi.channel();

            bool success = sendPacket(
                macAddress,
                pairingCompletePacket
            );

            Serial.println("PAIRING_COMPLETE packet sent to Node: " + String(success ? "Success" : "Failure"));

            if (isNodeApproved(macAddress)) removeApprovedNodeMac(macAddress);

            // The node must confirm that its own NVS save succeeded before we
            // tell the admin this handshake completed.
            break;
        }

        case PacketTypes::PAIRING_SAVED: {
            Serial.println("PAIRING_SAVED");
            if (!isNodePaired(macAddress)) break;
            if (receivedPacket.wifiChannel != WiFi.channel()) break;
            String pairingConfirmTopic = live_prefix + hubId + "/pairing_confirm";

            String pairingConfirmPayload =
                "{\"mac_address\":\"" +
                String(macString) +
                "\"}";

            if (mqttPublish(pairingConfirmTopic, pairingConfirmPayload)) {
                ESPNowPacket ack = {};
                ack.packetType = PAIRING_SAVED_ACK;
                ack.wifiChannel = WiFi.channel();
                sendPacket(macAddress, ack);
            }
            // check: handleMQTTMessage()

            break;
        }

        // either the Hub or Node can send unpair requests.
        case PacketTypes::UNPAIR_REQUEST: {
            Serial.println("UNPAIR_REQUEST");
            // need admin confirmation if the Node is allowed to unpair from the Hub
            String unpairTopic = live_prefix + hubId + "/unpair_request";
            String unpairPayload =
                "{\"mac_address\":\"" +
                String(macString) +
                "\"}";

            mqttPublish(unpairTopic, unpairPayload);
            break;
        }

        case PacketTypes::UNPAIR_RESPONSE:
        case PacketTypes::UNPAIR_RESPONSE_ACK: {
            const bool needsAck = receivedPacket.packetType == PacketTypes::UNPAIR_RESPONSE;
            Serial.println(needsAck ? "UNPAIR_RESPONSE" : "UNPAIR_RESPONSE_ACK");
            // remove the Node's MAC address from the NVS list of paired Nodes
            if (!removePairedNode(macAddress)) break;
            if (isNodeApproved(macAddress)) if (!removeApprovedNodeMac(macAddress)) break;
            if (needsAck) {
                ESPNowPacket ack = {};
                ack.packetType = PacketTypes::UNPAIR_RESPONSE_ACK;
                if (!sendPacket(macAddress, ack)) {
                    Serial.println("Failed to send UNPAIR_RESPONSE_ACK to Node.");
                }
            }
            // The Node sends either response only after clearing its own NVS.
            String unpairConfirmTopic = live_prefix + hubId + "/unpair_confirm";
            String unpairConfirmPayload =
                "{\"mac_address\":\"" +
                String(macString) +
                "\"}";
            mqttPublish(unpairConfirmTopic, unpairConfirmPayload);
            break;
        }

        // received from Node when it wants to test the connection with the Hub
        case PacketTypes::TEST_PACKET_REQUEST: {
            Serial.println("TEST_PACKET_REQUEST");

            if (!isNodePaired(macAddress)) {
                Serial.println("Node is not paired. Ignoring TEST_PACKET_REQUEST.");
                break;
            }

            ESPNowPacket _receivedPacket = receivedPacket;
            _receivedPacket.packetType = PacketTypes::TEST_PACKET_RESPONSE;
            _receivedPacket.wifiChannel = WiFi.channel();
            sendPacket(macAddress, _receivedPacket);

            break;
        }

        // used by Node to send data to the Hub
        case PacketTypes::DATA_PACKET: {
            Serial.println("DATA_PACKET");
            if (!isNodePaired(macAddress)) {
                Serial.println("Ignoring occupancy from unpaired Node: " + String(macString));
                break;
            }
            if (receivedPacket.wifiChannel != WiFi.channel()) {
                Serial.println("Ignoring occupancy with an invalid WiFi channel.");
                break;
            }
            Serial.printf("Node %s occupancy: %s\n", macString,
                          receivedPacket.isOccupied ? "occupied" : "empty");
            // Do not queue old sensor readings while the broker is disconnected.
            // The Node repeats its latest reading every 15 seconds.
            if (!mqttOnline.load()) {
                Serial.println("Occupancy not forwarded: MQTT is offline.");
                break;
            }
            timeval observed = {};
            gettimeofday(&observed, nullptr);
            if (observed.tv_sec < 1700000000) {
                Serial.println("Occupancy not forwarded: UTC clock is not synchronized.");
                break;
            }
            char observedAtMs[24];
            snprintf(observedAtMs, sizeof(observedAtMs), "%llu",
                static_cast<unsigned long long>(observed.tv_sec) * 1000ULL + observed.tv_usec / 1000);
            String occupancyTopic = live_prefix + hubId + "/occupancy/" + String(macString) +
                "/" + (receivedPacket.isOccupied ? "occupied" : "empty");
            bool queued = mqttPublish(occupancyTopic, String(observedAtMs), false);
            Serial.println(queued ? "Occupancy queued for admin server: " + occupancyTopic :
                                   "Occupancy could not be queued for admin server: " + occupancyTopic);
            break;
        }

        default:
            Serial.println("UNKNOWN");
            break;
    }
}


// [Start Hub]
void startHub() {
    Serial.println();
    Serial.println("================================");
    Serial.println("           KAGE HUB             ");
    Serial.println("================================");

    Serial.println("Hub ID: " + hubId);
    Serial.println("Hub Token: " + hubToken.substring(0, 4) + "****");

    // Setup ESP-NOW Packet Handler
    setupPacketHandler(packetHandler);

    // Setup ESP-NOW
    setupESPNow();
    Serial.println("Hub MAC: " + WiFi.macAddress());
    delay(1000);

    // Connect to Wi-Fi
    connectToWiFi();

    // Set MQTT callback
    mqttClient.setCallback(mqttListener);
    mqttClient.setBufferSize(512);
    mqttIncoming = xQueueCreate(20, sizeof(MQTTMessage));
    mqttOutgoing = xQueueCreate(20, sizeof(MQTTMessage));
    if (mqttIncoming == nullptr || mqttOutgoing == nullptr ||
        xTaskCreate(mqttWorker, "kage-mqtt", 6144, nullptr, 1, nullptr) != pdPASS) {
        Serial.println("Failed to start MQTT worker. Restarting...");
        ESP.restart();
    }
}

// ======================================================================

void setup() {
    Serial.begin(115200); // Serial communication at 115200 baud
    delay(3000); // Wait for Serial to initialize

    Serial.println("KAGE ESP32 boot successful!");

    // [DEBUGGING]
    // clearPairedNodes();
    // clearWiFiCredentials();
    // clearTokenAndHubId();

    // Read NVS
    hubId = readNVS("HubId");
    hubToken = readNVS("HubToken");

    WiFiSSID = readNVS("WiFiSSID");
    WiFiPassword = readNVS("WiFiPassword");

    mqttServer = readNVS("MQTTServer");
    mqttPort = readNVS("MQTTPort").toInt();

    // Load TLS trust before connecting to MQTT broker
    HubTrust::load();
    if (!HubTrust::configured()) {
        Serial.println("No valid MQTT root CA saved. Opening Hub setup to configure TLS trust.");
    }

    // Check for provisioning mode

    // Test 1: If any of the required credentials are missing, enter provisioning mode.
    if (
        hubId == "" || hubToken == "" ||
        WiFiSSID == "" || WiFiPassword == "" ||
        mqttServer == "" || mqttPort == 0 || !HubTrust::configured()
    ) {
        HubProvisioning::start();
        return; // exit and restart
    }

    // The MQTT worker validates the ping after Wi-Fi and TLS are ready.
    Serial.println("All required credentials found. Starting Hub...");

    // Load paired Node macs from NVS
    if (!loadPairedNodes()) {
        Serial.println("Error loading paired Nodes. Restarting...");
        ESP.restart();
    }

    // Start the Hub
    startHub();
}


void loop() {

    // [Handle Hub Provisioning]
    if (HubProvisioning::active) {
        HubProvisioning::update();
        return;
    }

    if (mqttPingStatus == MQTTPingStatus::Provisioning) {
        Serial.println("MQTT broker connection failed after 3 attempts. Starting provisioning; saved credentials retained.");
        HubProvisioning::start();
        return;
    }

    // To prevent the ESP32 from being overwhelmed by incoming ESP-NOW packets
    processPackets();

    // [Wi-Fi Connection Check]
    checkWiFiConnection();

    // [MQTT Connection Check]
    processMQTTCommands();

    delay(1);
}

#include <Arduino.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h> // MQTT client library
#include <KageHNProtocol.h>
#include <Declarations.h>
#include <SyncTime.h>

String _prefix = "kage/hub/";

// [NVS Variables]
// : Hub ID and Token
String hubId;
String hubToken;

// : Wi-Fi Credentials
String WiFiSSID;
String WiFiPassword;

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

const char* mqttServer = "192.168.1.23";
const int mqttPort = 8883;

const char* rootCA = R"EOF(
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

bool connectToMQTT() {
    mqttClient.setServer(mqttServer, mqttPort);
    mqttClient.setKeepAlive(10);
    wifiClient.setCACert(rootCA);
    // wifiClient.setInsecure();
    // mqttClient.setSocketTimeout(5);
    // wifiClient.setTimeout(5000);

    Serial.println("Root CA:");
    Serial.println(rootCA);

    // Topic
    String _topic = _prefix + hubId + "/status";

    printf("Connecting to MQTT broker at %s:%d...\n", mqttServer, mqttPort);

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

void checkMQTTConnection() {
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

// [Deploy Subscriptions]
void deploySubscriptions() {
    // Pairing Request Confirmation
    String pairingTopic = _prefix + hubId + "/pairing_response/+";
    // + is a wildcard for the Node's MAC address
    mqttSubscribe(pairingTopic);

    // Unpair Request
    String unpairTopic = _prefix + hubId + "/unpair_response/+";
    // + is a wildcard for the Node's MAC address
    mqttSubscribe(unpairTopic);
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
    if (xQueueSend(mqttIncoming, &message, 0) != pdTRUE) ++mqttCommandDrops;
}

void mqttWorker(void*) {
    MQTTMessage pending = {};
    bool havePending = false;
    for (;;) {
        checkMQTTConnection();
        mqttOnline.store(WiFi.status() == WL_CONNECTED && mqttClient.connected());
        if (mqttOnline.load()) {
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

void handleMQTTMessage(const String& topic, const String& message) {
    // [ Handle pairing response ]
    // : kage/hub/<hubId>/pairing_response/AA:BB:CC:DD:EE:FF
    String pairingResponsePrefix = _prefix + hubId + "/pairing_response/";
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
    else if (topic.startsWith(_prefix + hubId + "/unpair_response/")) {
        String nodeMacAddress = topic.substring((_prefix + hubId + "/unpair_response/").length());
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
            // if (success) {
            //     if (!removePairedNode(macBytes)) {
            //         Serial.println("Failed to remove paired Node or Node was already unpaired.");
            //     }
            // } else Serial.println("Failed to send UNPAIR_RESPONSE packet to Node.");
            if (success) {
                if (removePairedNode(macBytes)) {
                    String topic = _prefix + hubId + "/unpair_confirm";
                    String payload =
                        "{\"mac_address\":\"" + nodeMacAddress + "\"}";

                    mqttPublish(topic, payload);
                } else {
                    Serial.println("Failed to remove paired Node or already unpaired.");
                }
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

[CONNECTION TEST]
    Node ── TEST_PACKET_REQUEST ──> Hub
    Node <─ TEST_PACKET_RESPONSE ── Hub

[DATA]
    Node ── DATA_PACKET ──────────> Hub

[UNPAIR]
    Either ── UNPAIR_REQUEST ─────> Other
    Either <─ UNPAIR_RESPONSE ───── Other
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
            String pairingTopic = _prefix + hubId + "/pairing_request";

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
            String pairingConfirmTopic = _prefix + hubId + "/pairing_confirm";

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
            String unpairTopic = _prefix + hubId + "/unpair_request";
            String unpairPayload =
                "{\"mac_address\":\"" +
                String(macString) +
                "\"}";

            mqttPublish(unpairTopic, unpairPayload);
            break;
        }

        case PacketTypes::UNPAIR_RESPONSE: {
            Serial.println("UNPAIR_RESPONSE");
            // remove the Node's MAC address from the NVS list of paired Nodes
            if (!removePairedNode(macAddress)) break;
            if (isNodeApproved(macAddress)) if (!removeApprovedNodeMac(macAddress)) break;
            // just inform the admin server that the Node has successfully unpaired with the Hub
            String unpairConfirmTopic = _prefix + hubId + "/unpair_confirm";
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
        case PacketTypes::DATA_PACKET:
            Serial.println("DATA_PACKET");
            if (isNodePaired(macAddress)) {
                Serial.println("Data received from paired Node: " + String(macString));
            } else {
                Serial.println("Data received from unpaired Node: " + String(macString));
            }
            break;

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

    // [TESTING ONLY]
    clearPairedNodes();
    // clearWiFiCredentials();

    // Read NVS
    hubId = readNVS("HubId");
    hubToken = readNVS("HubToken");

    WiFiSSID = readNVS("WiFiSSID");
    WiFiPassword = readNVS("WiFiPassword");

    // Check for provisioning mode
    if (hubId == "" || hubToken == "" || WiFiSSID == "" || WiFiPassword == "") {
        // Check for provisioning mode for Hub ID and Token
        if (hubId == "" || hubToken == "") {
            provisioningMode_HubCredentials();
            return; // exit and restart
        }
        // Check for provisioning mode for Wi-Fi credentials
        if (WiFiSSID == "" || WiFiPassword == "") {
            provisioningMode_WiFiCredentials();
        }

        return; // exit and restart
    }

    // Load paired Node macs from NVS
    if (!loadPairedNodes()) {
        Serial.println("Error loading paired Nodes. Restarting...");
        ESP.restart();
    }

    // Start the Hub
    startHub();
}


void loop() {

    // To prevent the ESP32 from being overwhelmed by incoming ESP-NOW packets
    processPackets();

    // [Wi-Fi Connection Check]
    checkWiFiConnection();

    // [MQTT Connection Check]
    processMQTTCommands();

    delay(1);
}

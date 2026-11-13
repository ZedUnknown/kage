#include <Preferences.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <KageHNProtocol.h>
#include <KageNodeButton.h>
#include <Declarations.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <LEDStates.h>

// [Runtime Variables]
bool startupComplete = false;
bool isPendingRequest = false; // Flag to indicate if a pairing request is pending

bool awaitingPairingSavedAck = false;
uint8_t pairingSavedAttempts = 0;
unsigned long lastPairingSavedAttempt = 0;

// occupancy runtime
bool occupancyKnown = false; // sensor state known (first reading to prevent setting occupancy to false on startup)
bool currentOccupancy = false; // current occupancy state
bool occupancyPending = false;
bool occupancyAttempted = false;
unsigned long lastOccupancyAttempt = 0;
unsigned long lastOccupancySent = 0;
constexpr unsigned long OCCUPANCY_RETRY_MS = 1000;
constexpr unsigned long OCCUPANCY_HEARTBEAT_MS = 15000;

// [NVS Storage]
Preferences preferences;

String HubMacAddress;
String HubWiFiChannel;

// : New NVS saving method: StoreHub is preferred over legacy "HubMacAddress" + "HubWiFiChannel" (string)
// : runtime still uses HubMacAddress and HubWiFiChannel. StoredHub is only used for saving and loading from NVS.
struct StoredHub {
    uint8_t version;
    uint8_t mac[6];
    uint8_t channel;
};

bool savePairedHub(const uint8_t* mac, uint8_t channel) {
    if (!preferences.begin("kage", false)) return false;
    StoredHub record = {};
    record.version = 1;
    memcpy(record.mac, mac, 6);
    record.channel = channel;
    bool saved = preferences.putBytes("pairedHub", &record, sizeof(record)) == sizeof(record);
    preferences.end();
    return saved;
}


// [Read NVS]
String readNVS() {
   if (!preferences.begin("kage", true)) return "No saved Hub. Starting discovery.";

   if (preferences.isKey("pairedHub")) {
       StoredHub record = {};
       bool valid = preferences.getBytesLength("pairedHub") == sizeof(record) &&
                    preferences.getBytes("pairedHub", &record, sizeof(record)) == sizeof(record) &&
                    record.version == 1 && record.channel >= 1 && record.channel <= 13 &&
                    !(record.mac[0] & 1);
       preferences.end();
       const uint8_t empty[6] = {};
       if (!valid || memcmp(record.mac, empty, 6) == 0) return "Invalid saved Hub. Starting discovery.";
       char mac[18];
       macBytesToString(record.mac, mac, sizeof(mac));
       HubMacAddress = mac;
       HubWiFiChannel = String(record.channel);
       return "Saved Hub loaded.";
   }

   HubMacAddress = preferences.getString("HubMacAddress", "");
   HubWiFiChannel = preferences.getString("HubWiFiChannel", "");

   preferences.end();

   return "Legacy NVS values read successfully";
};


// [Write NVS]
bool writeNVS(String key, String value) {
   if (!preferences.begin("kage", false)) return false; // Read-write mode

   size_t bytesWritten = preferences.putString(key.c_str(), value.c_str());

   preferences.end();
   return bytesWritten > 0;
};

// [Clear Pending Pairing]
String pendingHubMacAddress = "";
String pendingHubWiFiChannel = "";

unsigned long pairingStartedAt = 0;
unsigned long lastConfirmationAttempt = 0;

void clearPendingPairing() {
    pendingHubMacAddress = "";
    pendingHubWiFiChannel = "";
    isPendingRequest = false;
}

// [Clear Paired Hub]
bool clearPairedHub() {
    if (!preferences.begin("kage", false)) {
        Serial.println("Failed to open NVS.");
        return false;
    }

    bool success = true;

    if (
        preferences.isKey("HubWiFiChannel") &&
        !preferences.remove("HubWiFiChannel")
    ) success = false;

    if (
        preferences.isKey("HubMacAddress") &&
        !preferences.remove("HubMacAddress")
    ) success = false;

    if (success && preferences.isKey("pairedHub") && !preferences.remove("pairedHub")) success = false;

    preferences.end();


    if (!success) {
        Serial.println("Failed to clear paired Hub.");
        return false;
    }


    // Clear runtime variables
    HubMacAddress = "";
    HubWiFiChannel = "";

    isPendingRequest = false;
    isPaired = false;
    startupComplete = false;
    awaitingPairingSavedAck = false;

    occupancyKnown = false;
    occupancyPending = false;
    occupancyAttempted = false;

    Serial.println("Paired Hub cleared successfully.");

    // Clear pending pairing variables
    clearPendingPairing();

    return true;
}

// [Request Types]
void sendDiscoveryRequest(uint8_t channel) {
    ESPNowPacket packet = {};

    packet.packetType = PacketTypes::PAIRING_REQUEST;
    packet.wifiChannel = channel;

    packet.isOccupied = currentOccupancy;

    bool sent = sendPacket(
        (const uint8_t*)&BROADCAST_MAC,
        packet
    );

    Serial.printf(
        "Discovery: requested channel=%u, actual channel=%d, send=%s\n",
        channel,
        WiFi.channel(),
        sent ? "OK" : "FAILED"
    );
}

void sendTestPacketRequest(uint8_t channel) {
    ESPNowPacket packet = {};

    packet.packetType = PacketTypes::TEST_PACKET_REQUEST;
    packet.wifiChannel = channel;

    packet.isOccupied = currentOccupancy;

    uint8_t macBytes[6];
    if (!macStringToBytes(HubMacAddress.c_str(), macBytes)) {
        Serial.println("Invalid Hub MAC address format.");
        return;
    }

    sendPacket(
        macBytes,
        packet
    );

}


// [Occupancy]
// FSR: triggerOccupancy(true or false).
// Changed readings are sent promptly; unchanged readings use the heartbeat.
void triggerOccupancy(bool occupied) {
    if (!occupancyKnown || currentOccupancy != occupied) {
        occupancyPending = true;
        // avoid waiting for the next heartbeat if the occupancy state has changed
        occupancyAttempted = false;
    }
    currentOccupancy = occupied;
    occupancyKnown = true;
}

void handleOccupancyPacket() {
    if (!occupancyKnown || !isPaired || !startupComplete || awaitingPairingSavedAck) return;

    // to avoid flooding the Hub with occupancy packets
    unsigned long now = millis();
    if (!occupancyPending && now - lastOccupancySent < OCCUPANCY_HEARTBEAT_MS) return;
    if (occupancyAttempted && now - lastOccupancyAttempt < OCCUPANCY_RETRY_MS) return;

    uint8_t hubMac[6];
    int channel = HubWiFiChannel.toInt();
    if (!macStringToBytes(HubMacAddress.c_str(), hubMac) ||
        channel < 1 || channel > 13 || WiFi.channel() != channel) return;

    // [Packet]
    ESPNowPacket packet = {};
    packet.packetType = PacketTypes::DATA_PACKET;
    packet.isOccupied = currentOccupancy;
    packet.wifiChannel = channel;

    lastOccupancyAttempt = now;
    occupancyAttempted = true;
    if (sendPacket(hubMac, packet)) {
        occupancyPending = false;
        lastOccupancySent = millis();
        Serial.printf("Occupancy sent to Hub: %s\n", currentOccupancy ? "occupied" : "empty");
    } else {
        occupancyPending = true;
        Serial.println("Occupancy send failed. Retrying with the latest reading.");
    }
}


// [Get Correct WiFi Channel]
uint8_t currentScanHubChannel = 1;

void getCorrectHubChannel() {

    if (isPendingRequest || isPaired) return;

    if (currentScanHubChannel > 13) {
        currentScanHubChannel = 1;
    }

    // set currentScanHubChannel as the WiFi channel for ESP-NOW
    if (!setRadioChannel(currentScanHubChannel)) {
        if (!sendPending) ++currentScanHubChannel;
        return;
    }

    Serial.println("Sending Test Packet to Hub: " + String(HubMacAddress) + " on channel: " + String(currentScanHubChannel));
    blinkLED(2, false);

    // due to the nature of ESP-NOW, the broadcast packets are not guaranteed delivery.
    // therefore, will send multiple discovery requests per channel and wait for a response.
    for (uint8_t i = 0; i < 3; i++) {
        if (HubWiFiChannel != "") return;
        if (i == 1) {
            // If the hub lost its pairing record, request admin approval again.
            // Keep targeting the saved hub, rather than silently adopting another.
            uint8_t mac[6];
            if (macStringToBytes(HubMacAddress.c_str(), mac)) {
                ESPNowPacket request = {};
                request.packetType = PAIRING_REQUEST;
                request.wifiChannel = currentScanHubChannel;
                sendPacket(mac, request);
            }
        } else sendTestPacketRequest(currentScanHubChannel);

        waitForPackets(100); // Wait for response
        if (isPendingRequest || HubWiFiChannel != "") return;
    }

    waitForPackets(800); // Wait for response
    if (isPendingRequest || HubWiFiChannel != "") return;

    currentScanHubChannel++;
};

uint8_t currentScanWiFiChannel = 1;

void getCorrectWiFiChannel() {

    if (isPendingRequest || isPaired) return;

    // response is queued by onESPNowReceive and handled by waitForPackets
    if (currentScanWiFiChannel > 13) {
        currentScanWiFiChannel = 1;
    }

    if (!setRadioChannel(currentScanWiFiChannel)) {
        if (!sendPending) ++currentScanWiFiChannel;
        return;
    }

    Serial.println("Sending Discovery Request on channel: " + String(currentScanWiFiChannel));
    blinkLED(1, false);

    // due to the nature of ESP-NOW, the broadcast packets are not guaranteed delivery.
    // therefore, will send multiple discovery requests per channel and wait for a response.
    for (uint8_t i = 0; i < 3; i++) {
        if (HubMacAddress != "") return;
        sendDiscoveryRequest(currentScanWiFiChannel);
        waitForPackets(200); // Wait for response

        if (isPendingRequest || isPaired) return; // if a response is received, stop discovery
    }

    waitForPackets(1000); // Wait for response
    if (isPendingRequest || isPaired) return; // if a response is received, stop discovery

    currentScanWiFiChannel++;
};


// [Main Pairing Connection Handler]
void handlePairing() {

    if (HubMacAddress == "") {
        getCorrectWiFiChannel();
    }

    if (!(HubMacAddress == "") && HubWiFiChannel == "") {
        getCorrectHubChannel();
    }

}

void handlePendingPairing() {
    if (isPendingRequest) {
        if (millis() - pairingStartedAt > 5000) {
            Serial.println("Pairing request timed out. Retrying...");
            clearPendingPairing();
            return;
        }

        if (millis() - lastConfirmationAttempt < 1000) return; // wait at least 1 second before sending another confirmation

        uint8_t macBytes[6];
        if (!macStringToBytes(pendingHubMacAddress.c_str(), macBytes)) {
            clearPendingPairing();
            return;
        }

        ESPNowPacket packet = {};
        packet.packetType = PacketTypes::PAIRING_CONFIRM;
        packet.wifiChannel = pendingHubWiFiChannel.toInt();

        bool isSent = sendPacket(macBytes, packet);
        lastConfirmationAttempt = millis();

        Serial.println(isSent ? "PAIRING_CONFIRM sent successfully." : "Failed to send PAIRING_CONFIRM.");
    }
}


// [PAIRING_SAVED Retries]
// constexpr = brother of const, but with compile-time evaluation.
constexpr uint8_t MAX_PAIRING_SAVED_ATTEMPTS = 10;
constexpr unsigned long PAIRING_SAVED_RETRY_MS = 1000;

void handlePairingSavedRetries() {
    if (!awaitingPairingSavedAck || !isPaired || !startupComplete) return;
    if (millis() - lastPairingSavedAttempt < PAIRING_SAVED_RETRY_MS) return;
    if (pairingSavedAttempts >= MAX_PAIRING_SAVED_ATTEMPTS) {
        awaitingPairingSavedAck = false;
        Serial.println("Saved pairing acknowledgement timed out; keeping saved Hub.");
        return;
    }

    uint8_t mac[6];
    int channel = HubWiFiChannel.toInt();
    if (!macStringToBytes(HubMacAddress.c_str(), mac) ||
        channel < 1 || channel > 13 || WiFi.channel() != channel) return;

    ESPNowPacket packet = {};
    packet.packetType = PacketTypes::PAIRING_SAVED;
    packet.wifiChannel = channel;

    bool isSent = sendPacket(mac, packet);
    Serial.println(isSent ? "PAIRING_SAVED sent. Awaiting PAIRING_SAVED_ACK." : "Failed to send PAIRING_SAVED. Retrying...");

    pairingSavedAttempts++;
    lastPairingSavedAttempt = millis();
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
    Either ── UNPAIR_RESPONSE_ACK ─> Other
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
        // case PacketTypes::PAIRING_REQUEST:
        //     Serial.println("PAIRING_REQUEST");
        //     break;
        case PacketTypes::PAIRING_RESPONSE: {
            Serial.println("PAIRING_RESPONSE");
            if (isPendingRequest || (isPaired && startupComplete)) break;
            if (HubMacAddress != "" && HubMacAddress != String(macString)) break;
            if (receivedPacket.wifiChannel < 1 || receivedPacket.wifiChannel > 13) break;
            if (!setRadioChannel(receivedPacket.wifiChannel)) {
                Serial.println("Failed to set WiFi channel.");
                isPendingRequest = false;
                break;
            }

            pendingHubMacAddress = String(macString);
            pendingHubWiFiChannel = String(receivedPacket.wifiChannel);
            pairingStartedAt = millis();
            isPendingRequest = true;

            // send PAIRING_CONFIRM
            ESPNowPacket _receivedPacket = receivedPacket;
            _receivedPacket.packetType = PacketTypes::PAIRING_CONFIRM;

            bool isSent = sendPacket(macAddress, _receivedPacket);
            Serial.println(isSent ? "PAIRING_CONFIRM sent." : "PAIRING_CONFIRM failed; will retry.");

            lastConfirmationAttempt = millis();

            break;
        }

        // case PacketTypes::PAIRING_CONFIRM:
        //     Serial.println("PAIRING_CONFIRM");
        //     break;

        case PacketTypes::PAIRING_COMPLETE: {
            Serial.println("PAIRING_COMPLETE");
            if (receivedPacket.wifiChannel < 1 || receivedPacket.wifiChannel > 13) break;
            if (isPaired && HubMacAddress == String(macString) &&
                HubWiFiChannel.toInt() == receivedPacket.wifiChannel) {
                // Duplicate completion: retry the saved notification without another NVS write.
                handlePairingSavedRetries();
                break;
            }
            if (!isPendingRequest || pendingHubMacAddress != String(macString)) break;
            if (pendingHubWiFiChannel.toInt() != receivedPacket.wifiChannel) break;

            // Set the WiFi channel to the one provided by the Hub.
            if (!setRadioChannel(receivedPacket.wifiChannel)) break;

            // Save Hub MAC address and WiFi channel to NVS after confirmation is delivered.
            if (savePairedHub(macAddress, receivedPacket.wifiChannel)) {

                HubMacAddress = String(macString);
                HubWiFiChannel = String(receivedPacket.wifiChannel);

                clearPendingPairing();

                isPaired = true;
                startupComplete = true; // not necessary, but just to be safe
                Serial.println("Paired Hub saved successfully.");

                // Start sending PAIRING_SAVED to the Hub and wait for its ACK.
                awaitingPairingSavedAck = true;
                pairingSavedAttempts = 0;
                lastPairingSavedAttempt = millis() - PAIRING_SAVED_RETRY_MS;
                handlePairingSavedRetries();
                break;

            } else {
                Serial.println("Failed to save paired Hub.");
            }

            break;
        }

        case PacketTypes::PAIRING_SAVED_ACK: {
            if (awaitingPairingSavedAck && isPaired && HubMacAddress == String(macString) &&
                HubWiFiChannel.toInt() == receivedPacket.wifiChannel) {
                awaitingPairingSavedAck = false;
                Serial.println("Hub acknowledged saved pairing.");
                blinkLED(3);
            }
            break;
        }

        // either the Hub or Node can send unpair requests.
        case PacketTypes::UNPAIR_REQUEST: {
            Serial.println("UNPAIR_REQUEST");
            if (HubMacAddress != String(macString)) break;
            // The response must prove that the Node's NVS deletion succeeded.
            if (!clearPairedHub()) break;
            ESPNowPacket _receivedPacket = receivedPacket;
            _receivedPacket.packetType = PacketTypes::UNPAIR_RESPONSE;
            if (!sendPacket(macAddress, _receivedPacket)) {
                Serial.println("Failed to send UNPAIR_RESPONSE to Hub.");
            }
            break;
        }
        case PacketTypes::UNPAIR_RESPONSE: {
            Serial.println("UNPAIR_RESPONSE");
            if (HubMacAddress != String(macString)) break;
            if (!clearPairedHub()) break;
            ESPNowPacket ack = {};
            ack.packetType = PacketTypes::UNPAIR_RESPONSE_ACK;
            if (!sendPacket(macAddress, ack)) {
                Serial.println("Failed to send UNPAIR_RESPONSE_ACK to Hub.");
            }
            break;
        }
        case PacketTypes::UNPAIR_RESPONSE_ACK: {
            Serial.println("UNPAIR_RESPONSE_ACK: Hub persisted the unpairing.");
            break;
        }
        // received from Hub after the Node sends a test packet to check if the Hub is on the correct channel
        case PacketTypes::TEST_PACKET_RESPONSE: {
            Serial.println("TEST_PACKET_RESPONSE");

            if (HubMacAddress != String(macString)) break;
            if (receivedPacket.wifiChannel < 1 || receivedPacket.wifiChannel > 13) break;

            if (!setRadioChannel(receivedPacket.wifiChannel)) break;
            if (HubWiFiChannel.toInt() == receivedPacket.wifiChannel ||
                savePairedHub(macAddress, receivedPacket.wifiChannel)) {
                HubWiFiChannel = String(receivedPacket.wifiChannel);
                startupComplete = true;
                isPaired = true;
            }

            break;
        }

        // received from Hub when it wants to identify the Node
        case PacketTypes::TEST_PACKET_REQUEST: {
            Serial.println("TEST_PACKET_REQUEST");
            if (HubMacAddress != String(macString)) break;
            if (receivedPacket.wifiChannel < 1 || receivedPacket.wifiChannel > 13) break;

            ESPNowPacket response = {};
            response.packetType = PacketTypes::TEST_PACKET_RESPONSE;
            response.wifiChannel = receivedPacket.wifiChannel;
            sendPacket(macAddress, response);

            // Identify the Node by blinking the LED
            identifyLED();

            break;
        }

        // used by Node to send data to the Hub
        // case PacketTypes::DATA_PACKET:
        //     Serial.println("DATA_PACKET");
        //     break;

        default:
            Serial.println("UNKNOWN");
            break;
    }
}


// [Start Node]
void startNode(String _HubMacAddress, String _HubWiFiChannel) {
    Serial.println();
    Serial.println("================================");
    Serial.println("           KAGE Node            ");
    Serial.println("================================");

    Serial.println("Connecting to Hub: " + _HubMacAddress);
    Serial.println("Using WiFi Channel: " + _HubWiFiChannel);

    startupComplete = false;

    // Test the currently saved channel with the hub
    for (uint8_t i = 0; i < 3; i++) {
        if (startupComplete) break;
        sendTestPacketRequest(WiFi.channel());
        waitForPackets(200);
    }

    if (!startupComplete) waitForPackets(400); // Wait for response

    if (!startupComplete) {
        HubWiFiChannel = "";
        isPaired = false;
        Serial.println("Hub is not on the same channel as the Node. Initiating pairing process.");
    }
};

// ==========[PINS]==========
uint8_t ledPin = 7; // Pin for the LED
uint8_t buttonPin = 8; // Pin for the button

// ===========[SETUP]==========
void setup() {
    Serial.begin(115200); // Serial communication at 115200 baud

    // [Setup LED]
    if (!setupLED(ledPin)) {
        Serial.println("Failed to create LED update task. Restarting...");
        ESP.restart();
        return;
    }

    finiteBreathLED(800, 3);

    delay(3000); // Wait for Serial to initialize

    Serial.println("KAGE ESP32-C3 boot successful!");
    Serial.println("Mock occupancy: send 1 for occupied, 0 for empty, or ? for help.");

    // [Register Pin Modes]
    pinMode(buttonPin, INPUT_PULLUP);

    // [TESTING ONLY]
    // clearPairedHub();
    // clearPendingPairing();

    // Read NVS
    String nvsReadResult = readNVS();
    Serial.println(nvsReadResult);
    if (HubMacAddress != "" && HubWiFiChannel != "") {
        awaitingPairingSavedAck = true;
        pairingSavedAttempts = 0;
        lastPairingSavedAttempt = millis() - PAIRING_SAVED_RETRY_MS;
    }

    // Setup ESP-NOW Packet Handler
    setupPacketHandler(packetHandler);

    // Setup ESP-NOW
    setupESPNow();

    /* [Schrödinbug]
        : SuperMini loses both broadcast and unicast at its default max power 20 dBm.
        : Shows stable broadcasting at 8.5 dBm.
        : Yah 8.5 dBm < 20 dBm, and it's magical, but it works. ¯\_(ツ)_/¯
    */
    esp_err_t powerError = esp_wifi_set_max_tx_power(34); // 34 × 0.25 dBm = 8.5 dBm
    if (powerError != ESP_OK) {
        Serial.println("Failed to configure node radio power. Restarting...");
        ESP.restart();
        return;
    }

    Serial.println("Node MAC: " + WiFi.macAddress());
    delay(1000);

    // Check whether the Node is paired with a Hub and has a valid WiFi channel
    if (HubMacAddress != "") {
        uint8_t macBytes[6];
        if (!macStringToBytes(HubMacAddress.c_str(), macBytes)) {
            clearPairedHub();
        } else {
            int channel = HubWiFiChannel.toInt();
            if (
                channel < 1 || channel > 13 ||
                !setRadioChannel(channel)
            ) {
                HubWiFiChannel = "";
            }
        }
    }

    // Check for pairing mode or missing wifi channel
    if (HubMacAddress == "" || HubWiFiChannel == "") {
        handlePairing();
    } else {
        Serial.println("Node is paired with Hub: " + HubMacAddress + " on channel: " + HubWiFiChannel);
    }

    if (HubMacAddress != "" && HubWiFiChannel != "") startNode(HubMacAddress, HubWiFiChannel);
};


void loop() {

    // [Handle Button Hold]
    handleButtonHold(
        buttonPin,
        []() {
            Serial.println("Button Identifying Node.");
            sendTestPacketRequest(WiFi.channel());
            identifyLED();
        },
        []() {
            Serial.println("Button No Action.");
        },
        []() {
            Serial.println("Button Clearing paired Hub.");
            blinkLED(10);
            clearPairedHub();
            clearPendingPairing();
            currentScanHubChannel = 1;
            currentScanWiFiChannel = 1;
        }
    );

    // [Handle Button Press]
    handleButtonPress(
        buttonPin,
        []() { // Single Press
            Serial.println("Button Pressed: Once.");
            blinkLED(1);
            triggerOccupancy(!currentOccupancy);
        },
        []() { // Double Press
            Serial.println("Button Pressed: Twice.");
            blinkLED(2);
        },
        []() { // Triple Press
            Serial.println("Button Pressed: Thrice.");
            blinkLED(3);
        }
    );

    // [Process Incoming Packets]
    processPackets();

    // [Handle Pending Pairing]
    handlePendingPairing();

    isPaired = !(HubMacAddress == "" || HubWiFiChannel == "");
    handlePairingSavedRetries();

    // [Handle Occupancy Packet]
    handleOccupancyPacket(); // triggered by triggerOccupancy()

    if (!isPaired && !isPendingRequest) {
        handlePairing();
    }

    setBackgroundLED(!isPaired && !isPendingRequest);

    delay(100); // to save power
}

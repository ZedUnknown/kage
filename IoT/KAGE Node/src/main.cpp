#include <Preferences.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <KageHNProtocol.h>

// [Runtime Variables]
bool startupComplete = false;
bool isPendingRequest = false; // Flag to indicate if a pairing request is pending

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

    packet.isOccupied = false; // will be using a global reactive variable later

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

    packet.isOccupied = false; // will be using a global reactive variable later

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

        if (millis() - lastConfirmationAttempt < 1000) return; // Wait at least 1 second before sending another confirmation

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
            // if (HubMacAddress != String(macString)) break;
            if (!isPendingRequest || pendingHubMacAddress != String(macString)) break;
            if (pendingHubWiFiChannel.toInt() != receivedPacket.wifiChannel) break;
            if (receivedPacket.wifiChannel < 1 || receivedPacket.wifiChannel > 13) break;

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

            } else {
                Serial.println("Failed to save paired Hub.");
            }

            break;
        }

        case PacketTypes::PAIRING_SAVED_ACK: {
            if (isPaired && HubMacAddress == String(macString) &&
                HubWiFiChannel.toInt() == receivedPacket.wifiChannel) {
                Serial.println("Hub acknowledged saved pairing.");
            }
            break;
        }

        // either the Hub or Node can send unpair requests.
        case PacketTypes::UNPAIR_REQUEST: {
            Serial.println("UNPAIR_REQUEST");
            if (HubMacAddress != String(macString)) break;
            ESPNowPacket _receivedPacket = receivedPacket;
            _receivedPacket.packetType = PacketTypes::UNPAIR_RESPONSE;
            if (sendPacket(macAddress, _receivedPacket)) clearPairedHub();
            break;
        }
        case PacketTypes::UNPAIR_RESPONSE: {
            Serial.println("UNPAIR_RESPONSE");
            if (HubMacAddress == String(macString)) {
                clearPairedHub();
            }
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

// ======================================================================

void setup() {
    Serial.begin(115200); // Serial communication at 115200 baud
    delay(3000); // Wait for Serial to initialize

    Serial.println("KAGE ESP32-C3 boot successful!");

    // [TESTING ONLY]
    clearPairedHub();

    // Read NVS
    String nvsReadResult = readNVS();
    Serial.println(nvsReadResult);

    // Setup ESP-NOW Packet Handler
    setupPacketHandler(packetHandler);

    // Setup ESP-NOW
    setupESPNow();
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

    // [Process Incoming Packets]
    processPackets();

    // [Handle Pending Pairing]
    handlePendingPairing();

    isPaired = !(HubMacAddress == "" || HubWiFiChannel == "");

    if (!isPaired && !isPendingRequest) {
        handlePairing();
    }

    delay(1);
}

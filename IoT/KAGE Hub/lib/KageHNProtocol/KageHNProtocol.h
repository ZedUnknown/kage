#pragma once
#include <Arduino.h>
#include <string>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_err.h>
#include <atomic>
#include <ctype.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

/*
[ESP-NOW Communication Flow]

Node sends packet
      ↓
Hub automatically receives it
      ↓
onESPNowReceive(...) is called
      ↓
Check packet.type
      ↓
PAIR_REQUEST?
    → pair with Node and reply

CHAIR_STATE?
    → process occupied/unoccupied state
*/

// ========================================

/*
[ESP-NOW Packet Types]
: custom packet types for the ESP-NOW protocol, used by the KAGE Hub and KAGE Node for communication.
*/
enum PacketTypes: uint8_t {
    // uint8_t = 1 byte

    PAIRING_REQUEST = 1,
    PAIRING_RESPONSE = 2,
    PAIRING_CONFIRM = 3,
    PAIRING_COMPLETE = 4,
    PAIRING_SAVED_ACK = 5,

    UNPAIR_REQUEST = 6,
    UNPAIR_RESPONSE = 7,

    TEST_PACKET_REQUEST = 8,
    TEST_PACKET_RESPONSE = 9,
    PAIRING_SAVED = 10,

    DATA_PACKET = 12,
};

// [Broadcast MAC address for ESP-NOW communication]
// const std::string BROADCAST_MAC = "FF:FF:FF:FF:FF:FF";

// Optimized version + comparison friendly
const uint64_t BROADCAST_MAC = 0xFFFFFFFFFFFFULL;


/*
[General ESP-NOW Packet]
: Packet type
: Is occupied

: HubId -> for convenience
: NodeId -> aka ChairId for convenience
*/
struct ESPNowPacket {
    PacketTypes packetType;
    bool isOccupied;

    uint8_t wifiChannel;

    // Up to 20 characters + '\0'
    char HubId[21];
    char NodeId[21];
};
static_assert(sizeof(ESPNowPacket) == 45, "Hub and node packet layout must match");


// [Pairing Flag]
bool isPaired = false;

/*
[ESP-NOW Pairing Flow]

HUB                                        NODE
 │                                           │
 │                        1. PAIRING_REQUEST │
 │<──────────────────────────────────────────│
 │             "I am an unpaired Chair Node" │
 │                                           │
 │ Add Node as peer                          │
 │                                           │
 │ 2. PAIRING_RESPONSE                       │
 │──────────────────────────────────────────>│
 │ "I accept you; I am this Hub"             │
 │                                           │
 │                         Add Hub as peer   │
 │                                           │
 │                        3. PAIRING_CONFIRM │
 │<──────────────────────────────────────────│
 │                "I received your response" │
 │                                           │
 │ Pairing complete                          │
*/


// [Packet Handler]
// interface for the function handling received ESP-NOW packets
typedef void (*ESPNowPacketHandler)(
    const uint8_t* macAddress,
    const ESPNowPacket& packet
);

// callback provided by main.cpp
ESPNowPacketHandler espNowPacketHandler = nullptr;

// Keep MQTT, NVS and pairing state in the main loop, outside the Wi-Fi task.
struct ReceivedESPNowPacket {
    uint8_t macAddress[6];
    ESPNowPacket packet;
};

QueueHandle_t receivedPackets = nullptr;
QueueHandle_t sendResults = nullptr;
bool sendPending = false;
unsigned long sendStartedAt = 0;
std::atomic<uint32_t> rxPackets{0}, rxDropped{0}, rxInvalid{0};
uint32_t txPackets = 0, txFailures = 0, txTimeouts = 0, radioRecoveries = 0;

bool addPeer(const uint8_t* macAddress);
bool removeAllPeers();
void onESPNowSend(const uint8_t*, esp_now_send_status_t);
void onESPNowReceive(const uint8_t*, const uint8_t*, int);

// A missing send callback must not permanently disable every future send.
// : only the main loop owns transport setup, sends, and channel changes.
void serviceESPNow() {
    if (!sendPending) return;
    esp_now_send_status_t status;
    if (xQueueReceive(sendResults, &status, 0) == pdTRUE) {
        sendPending = false;
        return;
    }
    if (millis() - sendStartedAt < 3000) return;
    Serial.println("ESP-NOW send callback missing. Restarting radio transport.");
    if (esp_now_deinit() != ESP_OK) return;
    xQueueReset(sendResults);
    if (esp_now_init() != ESP_OK ||
        esp_now_register_recv_cb(onESPNowReceive) != ESP_OK ||
        esp_now_register_send_cb(onESPNowSend) != ESP_OK) {
        Serial.println("ESP-NOW recovery failed. Restarting device.");
        ESP.restart();
        return;
    }
    sendPending = false;
    ++radioRecoveries;
    addPeer((const uint8_t*)&BROADCAST_MAC);
}

bool setRadioChannel(uint8_t channel) {
    serviceESPNow();
    if (sendPending || channel < 1 || channel > 13) return false;
    esp_err_t error = esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE);
    if (error != ESP_OK || WiFi.channel() != channel) {
        Serial.printf("Channel switch failed: requested=%u actual=%d error=%s\n",
                      channel, WiFi.channel(), esp_err_to_name(error));
        return false;
    }
    return true;
}

// [Convert MAC String to Bytes]
bool macStringToBytes(
    const char* macString,
    uint8_t* macAddress
) {
    if (macString == nullptr || macAddress == nullptr || strlen(macString) != 17) {
        return false;
    }

    for (int i = 0; i < 17; ++i) {
        if (i % 3 == 2) {
            if (macString[i] != ':') return false;
        } else if (!isxdigit((unsigned char)macString[i])) {
            return false;
        }
    }

    unsigned int values[6];
    if (
        sscanf(
            macString,
            "%2x:%2x:%2x:%2x:%2x:%2x",
            &values[0], &values[1], &values[2],
            &values[3], &values[4], &values[5]
        ) != 6
    ) {
        return false;
    }

    for (int i = 0; i < 6; ++i) {
        macAddress[i] = (uint8_t)values[i];
    }

    return true;
}

bool macBytesToString(
    const uint8_t* macAddress,
    char* macString,
    size_t bufferSize
) {
    if (macAddress == nullptr || macString == nullptr || bufferSize < 18) {
        return false;
    }

    snprintf(
        macString,
        bufferSize,
        "%02X:%02X:%02X:%02X:%02X:%02X",
        macAddress[0], macAddress[1], macAddress[2],
        macAddress[3], macAddress[4], macAddress[5]
    );

    return true;
}


// main.cpp gives it's own function to handle the received packet
void setupPacketHandler(ESPNowPacketHandler handler) {
    espNowPacketHandler = handler;
}

// [Send ESP-NOW Packet]
bool sendPacket(const uint8_t* destination, ESPNowPacket& packet) {
    if (sendResults == nullptr) return false;
    serviceESPNow();
    if (sendPending) return false;

    // Keep a reusable peer for consecutive sends. Evict only when changing targets.
    if (!esp_now_is_peer_exist(destination)) {
        if (!removeAllPeers() || !addPeer(destination)) return false;
    }
    // according to the ESP-NOW documentation
    sendStartedAt = millis();
    esp_err_t error = esp_now_send(
        destination,
        (uint8_t*)&packet,
        sizeof(packet)
    );
    if (error != ESP_OK) {
        ++txFailures;
        Serial.printf("ESP-NOW enqueue failed: type=%u channel=%d error=%s\n",
                      packet.packetType, WiFi.channel(), esp_err_to_name(error));
        return false;
    }
    ++txPackets;

    // ESP_OK only queues the send. Wait for its actual MAC-layer result.
    sendPending = true;
    esp_now_send_status_t status;
    if (xQueueReceive(sendResults, &status, pdMS_TO_TICKS(500)) != pdTRUE) {
        ++txTimeouts;
        Serial.println("ESP-NOW send callback timed out.");
        return false;
    }
    sendPending = false;
    if (status != ESP_NOW_SEND_SUCCESS) ++txFailures;
    return status == ESP_NOW_SEND_SUCCESS;
}

void onESPNowSend(const uint8_t* macAddress, esp_now_send_status_t status) {
    if (sendResults != nullptr) xQueueSend(sendResults, &status, 0);
}

/*
[ESP-NOW Receive]
: According to the ESP-NOW documentation,
this function is called when a packet is received.

Queue the packet, then check its type in the main-loop packet handler.
*/
void onESPNowReceive(
    const uint8_t* macAddress,
    const uint8_t* incomingData,
    int length
) {
    // Check if the incoming data is of the expected size
    if (macAddress == nullptr || incomingData == nullptr || length != sizeof(ESPNowPacket)) {
        ++rxInvalid;
        return;
    }

    // Convert the incoming data to an ESPNowPacket and copy the sender's MAC.
    ReceivedESPNowPacket receivedPacket;
    memcpy(receivedPacket.macAddress, macAddress, 6);
    memcpy(&receivedPacket.packet, incomingData, sizeof(receivedPacket.packet));

    ++rxPackets;
    if (receivedPackets == nullptr || xQueueSend(receivedPackets, &receivedPacket, 0) != pdTRUE) ++rxDropped;
}

void processPackets() {
    serviceESPNow();
    if (receivedPackets == nullptr) return;

    ReceivedESPNowPacket receivedPacket;
    UBaseType_t count = uxQueueMessagesWaiting(receivedPackets);
    for (UBaseType_t i = 0; i < count; ++i) {
        if (xQueueReceive(receivedPackets, &receivedPacket, 0) != pdTRUE) break;
        if (espNowPacketHandler != nullptr) {
            espNowPacketHandler(receivedPacket.macAddress, receivedPacket.packet);
        }
    }
}

// Handle responses while the Node is waiting on its current scan channel.
void waitForPackets(unsigned long duration) {
    unsigned long startedAt = millis();
    do {
        processPackets();
        delay(1);
    } while (millis() - startedAt < duration);
}

// [Remove All Peers]
bool removeAllPeers() {
    // Fetch only unicast peers; keep the broadcast peer for discovery.
    esp_now_peer_info_t peerInfo = {};
    esp_err_t result;
    while ((result = esp_now_fetch_peer(true, &peerInfo)) == ESP_OK) {
        if (esp_now_del_peer(peerInfo.peer_addr) != ESP_OK) {
            char macString[18];
            macBytesToString(peerInfo.peer_addr, macString, 18);
            Serial.println("Failed to remove peer: " + String(macString));
            return false;
        }
    }

    return result == ESP_ERR_ESPNOW_NOT_FOUND;
}


// [Add Peer]
bool addPeer(const uint8_t* macAddress) {
    // check for existing peers *runtime only* (not stored in NVS)
    // sendPacket removes previous unicast peers after their send has finished.
    if (esp_now_is_peer_exist(macAddress)) {
        // Serial.println("Peer already exists.");
        return true;
    }

    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, macAddress, 6);

    peerInfo.channel = 0;     // use current channel
    peerInfo.encrypt = false; // no encryption

    bool success = esp_now_add_peer(&peerInfo) == ESP_OK;

    if (!success) Serial.println("Failed to add peer.");

    return success;
}

// [Setup ESP-NOW]
void setupESPNow() {
    Serial.println();
    Serial.println("==========================");
    Serial.println("       KAGE ESP-NOW       ");
    Serial.println("==========================");

    WiFi.mode(WIFI_STA); // connects to a router as a "client"
    WiFi.setSleep(false);
    // Keep an existing Wi-Fi connection; the Hub also needs it for MQTT.

    receivedPackets = xQueueCreate(20, sizeof(ReceivedESPNowPacket));
    sendResults = xQueueCreate(1, sizeof(esp_now_send_status_t));
    if (receivedPackets == nullptr || sendResults == nullptr) {
        Serial.println("Error creating ESP-NOW queues. Restarting...");
        ESP.restart();
        return;
    }

    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW");
        ESP.restart();
        return;
    }

    if (esp_now_register_recv_cb(onESPNowReceive) != ESP_OK ||
        esp_now_register_send_cb(onESPNowSend) != ESP_OK) {
        Serial.println("Error registering ESP-NOW callbacks. Restarting...");
        ESP.restart();
        return;
    }
    Serial.println("ESP-NOW initialized successfully.");

    // according to the ESP-NOW documentation,
    // the broadcast MAC address must be added as a peer before broadcasting.
    if (!addPeer((const uint8_t*)& BROADCAST_MAC)) {
        Serial.println("Error adding discovery broadcast peer. Restarting...");
        ESP.restart();
    }
};

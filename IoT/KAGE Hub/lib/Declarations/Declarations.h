#include <Arduino.h>

/*
[Function Declarations]
: I'm lazy to reorder them.
*/

bool connectToMQTT();

void deploySubscriptions();

bool mqttPublish(
    const String& topic,
    const String& payload,
    bool retained = false
);

bool mqttSubscribe(
    const String& topic
);

void mqttListener(
    char* topic,
    byte* payload,
    unsigned int length
);

void handleMQTTMessage(
    const String& topic,
    const String& message
);

bool isEmptyMac(
    const uint8_t* macAddress
);

bool macStringToBytes(
    const char* macString,
    uint8_t* macAddress
);

bool addPairedNode(
    const uint8_t* macAddress
);

bool addPairedNode(
    const char* macAddress
);
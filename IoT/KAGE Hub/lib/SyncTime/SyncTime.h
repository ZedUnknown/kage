#include <time.h>
#include <Arduino.h>


bool timeSynchronized = false;

bool syncTime() {
    if (timeSynchronized) {
        return true;
    }

    // TLS only needs correct UTC time.
    configTime(
        0,
        0,
        "pool.ntp.org",
        "time.google.com"
    );

    unsigned long startedAt = millis();

    while (time(nullptr) < 1700000000) {
        if (millis() - startedAt >= 10000) {
            Serial.println("Time synchronization failed.");
            return false;
        }

        delay(100);
    }

    timeSynchronized = true;

    Serial.println("Time synchronized.");

    time_t now = time(nullptr);
    Serial.println(ctime(&now));

    return true;
}
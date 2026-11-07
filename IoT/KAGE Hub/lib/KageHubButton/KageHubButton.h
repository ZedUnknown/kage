#pragma once
#include <Arduino.h>

// [HOLD OPTIONS]
const unsigned long SHORT_HOLD_DURATION = 2000; // 2 second
const unsigned long LONG_HOLD_DURATION = 10000; // 10 seconds
const unsigned long VERY_LONG_HOLD_DURATION = 20000; // 20 seconds

// [Handle Button Press]
const uint8_t ONE_PRESS = 1;
const uint8_t TWO_PRESS = 2;
const uint8_t THREE_PRESS = 3;


void handleButtonHold(
    uint8_t buttonPin,
    void (*onShortHold)(),
    void (*onLongHold)(),
    void (*onVeryLongHold)()
) {

    // 0 = High, 1 = Low (active low button) # due to the pullup resistor
    bool isPressed = digitalRead(buttonPin) == 1 ? false : true; // read the button state (active low)

    static unsigned long pressedAt = 0;

    // [Button pressed]
    if (isPressed && pressedAt == 0) {
        pressedAt = millis();
    }

    // [Button released]
    if (!isPressed && pressedAt != 0) {
        unsigned long heldDuration = millis() - pressedAt;

        if (heldDuration >= VERY_LONG_HOLD_DURATION) {
            onVeryLongHold();
        } else if (heldDuration >= LONG_HOLD_DURATION) {
            onLongHold();
        } else if (heldDuration >= SHORT_HOLD_DURATION) {
            onShortHold();
        }

        pressedAt = 0; // reset the pressed time
    }
}


void handleButtonPress(
    uint8_t buttonPin,
    void (*onSinglePress)(),
    void (*onDoublePress)(),
    void (*onTriplePress)()
) {
    static bool wasPressed = false;
    static uint8_t pressCount = 0;
    static unsigned long pressedAt = 0;
    static unsigned long lastPressTime = 0;

    const unsigned long PRESS_WINDOW = 600;

    // 0 = High, 1 = Low (active low button) # due to the pullup resistor
    bool isPressed = digitalRead(buttonPin) == 1 ? false : true; // read the button state (active low)

    // [Button pressed]
    if (isPressed && !wasPressed) {
        wasPressed = true;
        pressedAt = millis();
    }


    // [Button released]
    if (!isPressed && wasPressed) {
        wasPressed = false;

        unsigned long heldDuration = millis() - pressedAt;

        // Only count it as a normal press if it wasn't a hold
        // if (heldDuration < SHORT_HOLD_DURATION) {
        if (heldDuration < 500) {
            pressCount++;
            lastPressTime = millis();
        } else {
            pressCount = 0;
        }
    }


    // Wait to see if another press happens
    if (pressCount > 0 && millis() - lastPressTime >= PRESS_WINDOW) {

        switch (pressCount) {
            case ONE_PRESS:
                onSinglePress();
                break;

            case TWO_PRESS:
                onDoublePress();
                break;

            case THREE_PRESS:
                onTriplePress();
                break;
        }

        pressCount = 0;
    }
}
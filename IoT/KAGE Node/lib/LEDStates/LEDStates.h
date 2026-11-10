#pragma once

#include <Arduino.h>
#include <math.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <freertos/task.h>

namespace ledStates {

constexpr int MAX_PATTERN_LENGTH = 20;
enum class Effect { None, Pattern, Breath };

uint8_t pin = 7;
SemaphoreHandle_t mutex = nullptr;
TaskHandle_t task = nullptr;
Effect effect = Effect::None;
bool backgroundOn = false;
uint32_t startedAt = 0;
uint32_t duration = 0;
uint32_t breathSpeed = 0;
int pattern[MAX_PATTERN_LENGTH] = {};
int patternLength = 0;

// Called with the mutex held. Elapsed time also handles millis() rollover.
bool effectActive(uint32_t now) {
    return effect != Effect::None && uint32_t(now - startedAt) < duration;
}

int brightness(uint32_t now) {
    if (!effectActive(now)) {
        effect = Effect::None;
        return backgroundOn ? 255 : 0;
    }

    uint32_t elapsed = now - startedAt;
    if (effect == Effect::Pattern) {
        for (int i = 0; i < patternLength; ++i) {
            if (elapsed < uint32_t(pattern[i])) return i % 2 == 0 ? 255 : 0;
            elapsed -= pattern[i];
        }
        return backgroundOn ? 255 : 0;
    }

    // Start each effect dark, with one full breath lasting speed * 2 ms.
    float phase = float(elapsed % (breathSpeed * 2U)) / float(breathSpeed) * PI;
    int value = lroundf((expf(-cosf(phase)) - 0.36787944f) * 108.0f);
    return constrain(value, 0, 255);
}

void worker(void*) {
    int previous = -1;
    while (true) {
        xSemaphoreTake(mutex, portMAX_DELAY);
        int value = brightness(millis());
        xSemaphoreGive(mutex);

        // Keep PWM attached for every mode, including solid on/off. Only this
        // task writes the pin, so effect changes cannot race with rendering.
        if (value != previous) {
            analogWrite(pin, value);
            previous = value;
        }
        delay(1);
    }
}

void startPattern(const int* values, int length, bool interrupt) {
    if (!mutex || !values || length <= 0 || length > MAX_PATTERN_LENGTH) return;

    uint64_t total = 0;
    for (int i = 0; i < length; ++i) {
        if (values[i] <= 0) return;
        total += values[i];
    }
    if (total > UINT32_MAX) return;

    xSemaphoreTake(mutex, portMAX_DELAY);
    uint32_t now = millis();
    if (interrupt || !effectActive(now)) {
        for (int i = 0; i < length; ++i) pattern[i] = values[i];
        patternLength = length;
        startedAt = now;
        duration = uint32_t(total);
        effect = Effect::Pattern;
    }
    xSemaphoreGive(mutex);
}

} // namespace ledStates

bool setupLED(uint8_t pin) {
    using namespace ledStates;
    if (task) return true;
    ledStates::pin = pin;
    pinMode(pin, OUTPUT);
    mutex = xSemaphoreCreateMutex();
    if (!mutex) return false;

    if (xTaskCreate(worker, "LED Update Task", 2048, nullptr, 1, &task) != pdPASS) {
        vSemaphoreDelete(mutex);
        mutex = nullptr;
        task = nullptr;
        return false;
    }
    return true;
}

void setBackgroundLED(bool on) {
    using namespace ledStates;
    if (!mutex) return;
    xSemaphoreTake(mutex, portMAX_DELAY);
    backgroundOn = on;
    xSemaphoreGive(mutex);
}

void finitePatternLED(const int pattern[], int patternLength) {
    ledStates::startPattern(pattern, patternLength, true);
}

void identifyLED() {
    const int pattern[] = {300, 100, 300, 100, 300, 100, 300, 100, 300, 100};
    finitePatternLED(pattern, sizeof(pattern) / sizeof(pattern[0]));
}

// Discovery uses interrupt=false so it cannot cancel startup or user feedback.
void blinkLED(int times, bool interrupt = true) {
    if (times <= 0) return;
    times = min(times, ledStates::MAX_PATTERN_LENGTH / 2);
    int pattern[ledStates::MAX_PATTERN_LENGTH];
    for (int i = 0; i < times * 2; ++i) pattern[i] = 200;
    ledStates::startPattern(pattern, times * 2, interrupt);
}

void finiteBreathLED(int speed, int cycles) {
    using namespace ledStates;
    if (!mutex || speed <= 0 || cycles <= 0) return;
    uint64_t total = uint64_t(speed) * uint64_t(cycles) * 2U;
    if (total > UINT32_MAX) return;

    xSemaphoreTake(mutex, portMAX_DELAY);
    breathSpeed = speed;
    startedAt = millis();
    duration = uint32_t(total);
    effect = Effect::Breath;
    xSemaphoreGive(mutex);
}

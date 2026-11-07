#include <singleLEDLibrary.h>
#include <freertos/task.h>


uint8_t _ledPin = 7;

TaskHandle_t ledTaskHandle = nullptr;

// sllib* LED = nullptr;
sllib LED(_ledPin);
// void setupLED(uint8_t pin) {
//     LED.setOnSingle();
//     LED = new sllib(pin);
// }

volatile bool turnOffLEDLater = false;
volatile unsigned long ledStartedAt = 0;
volatile unsigned long ledDuration = 0;


// [LED Update Task]
void ledWorker(void* parameter) {

    while (true) {
        LED.update();

        // turn LED off when a finite pattern is finished
        if (
            turnOffLEDLater &&
            millis() - ledStartedAt >= ledDuration
        ) {
            turnOffLEDLater = false;
            LED.setOffSingle();
        }

        delay(1);
    }
}


void identifyLED() {

    static int pattern[] = {
        300, 100,
        100, 100,
        100, 100
    };

    int patternLength = sizeof(pattern) / sizeof(pattern[0]);

    // total duration of the pattern
    unsigned long totalDuration = 0;

    for (int i = 0; i < patternLength; i++) {
        totalDuration += pattern[i];
    }

    LED.setPatternSingle(pattern, patternLength);


    // make ledWorker to turn off the LED after the pattern is finished
    ledStartedAt = millis();
    ledDuration = totalDuration;
    turnOffLEDLater = true;
}


void blinkLED(int times) {

    static int pattern[20];
    int patternLength = 0;

    for (int i = 0; i < times; i++) {
        pattern[patternLength++] = 200; // ON duration
        pattern[patternLength++] = 200; // OFF duration
    }

    LED.setPatternSingle(pattern, patternLength);

    // total duration of the pattern
    unsigned long totalDuration = times * 400; // each blink is 400ms

    // make ledWorker to turn off the LED after the pattern is finished
    ledStartedAt = millis();
    ledDuration = totalDuration;
    turnOffLEDLater = true;
}


void finitePatternLED(int pattern[], int patternLength) {

    LED.setPatternSingle(pattern, patternLength);

    // total duration of the pattern
    unsigned long totalDuration = 0;

    for (int i = 0; i < patternLength; i++) {
        totalDuration += pattern[i];
    }

    // make ledWorker to turn off the LED after the pattern is finished
    ledStartedAt = millis();
    ledDuration = totalDuration;
    turnOffLEDLater = true;
}


void finiteBreathLED(int speed, int cycles) {

    LED.setBreathSingle(speed);

    // total duration of the pattern
    unsigned long totalDuration = (unsigned long) speed * cycles * 2;

    // make ledWorker to turn off the LED after the pattern is finished
    ledStartedAt = millis();
    ledDuration = totalDuration;
    turnOffLEDLater = true;
}
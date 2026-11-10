#include <Arduino.h>

/*
[Function Declarations]
: I'm lazy to reorder them.
*/

void handlePairingSavedRetries();

bool clearPairedHub();

// Call from the main loop after detecting an FSR occupancy state.
// The latest reading is sent to the paired Hub by handleOccupancyPacket().
void triggerOccupancy(bool occupied);
void handleOccupancyPacket();

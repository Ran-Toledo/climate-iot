#pragma once

#include <Arduino.h>
#include "AcTransmitter.h"

void printSerialHelp();

// Call every loop(). Returns true and fills outCommand if a recognized
// command key was read this call. Returns false otherwise (nothing
// available, a line-ending character, or an unrecognized key — the latter
// prints an error and the help text).
bool pollSerialCommand(AcCommand &outCommand);

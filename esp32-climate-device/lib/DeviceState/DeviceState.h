#pragma once

#include <Arduino.h>
#include "AcTransmitter.h"

enum class PowerState { Unknown, On, Off };

// Firmware's local best-effort model of the AC's state. There is no
// feedback channel confirming the AC actually applied a command (the IR
// receiver used for protocol discovery in Stages 2-3 is not part of this
// architecture) — this only reflects what we last told it to do.
struct AcDeviceState {
  PowerState power = PowerState::Unknown;
  // -1 = not yet known/set by this firmware. Set via the 5 captured
  // commands (serial u/d/n/o/f, always 22/23 — see
  // captures/electra-ac-commands.md) or via a backend set_state command
  // (AcTransmitter::sendState(), any 16-30C value — Stage 6).
  int8_t targetTemperatureC = -1;
};

// Updates the local state to reflect a command that was just sent.
void applyCommandToState(AcDeviceState &state, AcCommand command);

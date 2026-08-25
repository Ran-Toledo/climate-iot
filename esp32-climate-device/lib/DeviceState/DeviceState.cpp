#include "DeviceState.h"

void applyCommandToState(AcDeviceState &state, AcCommand command) {
  switch (command) {
    case AcCommand::PowerOn:
      state.power = PowerState::On;
      break;
    case AcCommand::PowerOff:
      state.power = PowerState::Off;
      break;
    case AcCommand::TempUp:
      // Matches the decoded setpoint from the captured command itself
      // (captures/electra-ac-commands.md), not an assumed +1 delta.
      state.targetTemperatureC = 23;
      break;
    case AcCommand::TempDown:
      state.targetTemperatureC = 22;
      break;
    case AcCommand::FanChange:
      // Fan speed after a cycle isn't known from the Stage 2 capture
      // (every capture decoded as "Fan: Medium") — not tracked.
      break;
  }
}

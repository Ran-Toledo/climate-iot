#pragma once

#include <Arduino.h>
#include "AcTransmitter.h"
#include "DeviceState.h"
#include "BackendClient.h"

// Polls GET /api/v1/device/commands/next on a fixed interval, validates
// the payload, translates it into an IR transmission via
// AcTransmitter::sendState(), and acknowledges the result — never
// acknowledging success before the transmission has actually been
// issued. Dedupes by command id so a redelivered/refetched command isn't
// re-transmitted to the AC a second time.
class CommandProcessor {
 public:
  CommandProcessor(BackendClient &backendClient, AcTransmitter &acTransmitter,
                    AcDeviceState &acState);

  void update(unsigned long nowMs, const String &hardwareId);

 private:
  BackendClient &backendClient_;
  AcTransmitter &acTransmitter_;
  AcDeviceState &acState_;
  unsigned long lastPollMs_;
  long lastHandledCommandId_;
};

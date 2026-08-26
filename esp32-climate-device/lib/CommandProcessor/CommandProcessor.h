#pragma once

#include <Arduino.h>
#include "AcTransmitter.h"
#include "DeviceState.h"
#include "BackendClient.h"

// Polls GET /api/v1/device/commands/next on a fixed interval, validates
// the payload, translates it into an IR transmission via
// AcTransmitter::sendState(), and acknowledges the result — never
// acknowledging success before the transmission has actually been
// issued.
//
// Dedup tracks "transmitted" and "acked" separately: if a command was
// already sent to the AC but the acknowledgment POST failed (network
// blip), a re-fetch of the same command only retries the ack — it is
// never re-transmitted. This closes the Stage 6 edge case where a
// partial ack failure could cause a duplicate IR send.
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
  long lastTransmittedCommandId_; // sent to the AC; ack may still be pending
  long lastHandledCommandId_;     // sent AND successfully acked -- fully done
};

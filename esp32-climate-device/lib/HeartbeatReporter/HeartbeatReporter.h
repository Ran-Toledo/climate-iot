#pragma once

#include <Arduino.h>
#include "BackendClient.h"

// Sends POST /api/v1/device/heartbeat on a fixed interval (matching the
// simulator's default cadence). No backoff on failure — like the
// simulator, it just logs and tries again next interval; heartbeat
// staleness is what the backend uses to derive online/offline, so a
// missed beat is self-correcting on the next one.
class HeartbeatReporter {
 public:
  explicit HeartbeatReporter(BackendClient &backendClient);

  void update(unsigned long nowMs, const String &hardwareId);

 private:
  BackendClient &backendClient_;
  unsigned long lastSentMs_;
};

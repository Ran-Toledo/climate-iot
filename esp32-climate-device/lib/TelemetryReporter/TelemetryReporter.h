#pragma once

#include <Arduino.h>
#include "BackendClient.h"

// Sends POST /api/v1/device/telemetry on a fixed interval (matching the
// simulator's default cadence), using the most recent valid DHT11
// reading. No backoff on failure, mirroring the simulator: log and try
// again next interval.
class TelemetryReporter {
 public:
  explicit TelemetryReporter(BackendClient &backendClient);

  // hasReading must be false until at least one valid DHT11 reading has
  // been taken -- nothing is sent before that.
  void update(unsigned long nowMs, const String &hardwareId, bool hasReading,
              float temperatureC, float humidityPercent);

 private:
  BackendClient &backendClient_;
  unsigned long lastSentMs_;
};

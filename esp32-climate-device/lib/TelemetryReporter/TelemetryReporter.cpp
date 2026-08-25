#include "TelemetryReporter.h"

namespace {
constexpr unsigned long kIntervalMs = 5000; // matches TELEMETRY_INTERVAL_SECONDS default
}  // namespace

TelemetryReporter::TelemetryReporter(BackendClient &backendClient)
    : backendClient_(backendClient), lastSentMs_(0) {}

void TelemetryReporter::update(unsigned long nowMs, const String &hardwareId, bool hasReading,
                                float temperatureC, float humidityPercent) {
  if (!hasReading || nowMs - lastSentMs_ < kIntervalMs) {
    return;
  }
  lastSentMs_ = nowMs;

  if (!backendClient_.sendTelemetry(hardwareId, temperatureC, humidityPercent)) {
    Serial.println("Telemetry failed (will retry next interval).");
  }
}

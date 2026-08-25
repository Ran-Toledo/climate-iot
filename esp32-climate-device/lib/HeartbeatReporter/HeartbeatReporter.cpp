#include "HeartbeatReporter.h"

namespace {
constexpr unsigned long kIntervalMs = 10000; // matches HEARTBEAT_INTERVAL_SECONDS default
}  // namespace

HeartbeatReporter::HeartbeatReporter(BackendClient &backendClient)
    : backendClient_(backendClient), lastSentMs_(0) {}

void HeartbeatReporter::update(unsigned long nowMs, const String &hardwareId) {
  if (nowMs - lastSentMs_ < kIntervalMs) {
    return;
  }
  lastSentMs_ = nowMs;

  if (!backendClient_.sendHeartbeat(hardwareId)) {
    Serial.println("Heartbeat failed (will retry next interval).");
  }
}

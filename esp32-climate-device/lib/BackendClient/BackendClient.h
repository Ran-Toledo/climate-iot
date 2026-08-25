#pragma once

#include <Arduino.h>

// Registers this device with the backend, exactly per the discovered
// contract: POST /api/v1/device/register {hardware_id, device_type, name}.
// No auth — the backend has none for the device API. Idempotent: retrying
// is always safe, so a bounded exponential backoff between attempts is
// used instead of the Python simulator's naive infinite 3s retry loop.
class BackendClient {
 public:
  explicit BackendClient(const String &baseUrl);

  // Call every loop() once Wi-Fi is connected and not yet registered.
  // No-ops if already registered or the backoff interval hasn't elapsed.
  // A single attempt itself blocks for up to the request timeout while
  // in flight, like any real network call — this is not a tight loop.
  void update(unsigned long nowMs, const String &hardwareId, const char *deviceType,
              const char *deviceName);

  bool isRegistered() const;

 private:
  String baseUrl_;
  bool registered_;
  unsigned long nextAttemptMs_;
  unsigned long backoffMs_;
};

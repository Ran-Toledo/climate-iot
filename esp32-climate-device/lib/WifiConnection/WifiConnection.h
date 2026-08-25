#pragma once

#include <Arduino.h>

// Manages Wi-Fi connect/reconnect with bounded exponential backoff — never
// a tight retry loop. Non-blocking: update() must be called every loop()
// and only issues a new connection attempt when the current backoff
// interval has elapsed.
class WifiConnection {
 public:
  WifiConnection(const char *ssid, const char *password);

  void begin();
  void update(unsigned long nowMs);

  bool isConnected() const;

 private:
  const char *ssid_;
  const char *password_;
  unsigned long nextAttemptMs_;
  unsigned long backoffMs_;
  bool wasConnected_;
};

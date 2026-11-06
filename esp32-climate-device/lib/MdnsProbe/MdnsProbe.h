#pragma once

#include <Arduino.h>

// Diagnostic only (Part A of the mDNS check): periodically resolves the
// backend's mDNS name and logs the result to serial, so we can see
// whether mDNS from this device to the laptop is reliable. It never
// changes which address BackendClient talks to.
//
// Schedule: once Wi-Fi is up, kStartupTries queries kStartupSpacingMs
// apart, then one every kPeriodicIntervalMs. Each query blocks loop() for
// at most kQueryTimeoutMs; nothing else here blocks.
class MdnsProbe {
 public:
  // hostname: bare mDNS name, without ".local" (ESP32 Arduino core 2.x's
  // MDNS.queryHost() -> mdns_query_a() appends the .local domain itself).
  // An empty hostname disables the probe.
  MdnsProbe(const char *hostname, const char *backendBaseUrl);

  // Call every loop(). deviceName is this device's own mDNS name, used by
  // MDNS.begin() the first time Wi-Fi is connected.
  void update(unsigned long nowMs, bool wifiConnected, const String &deviceName);

 private:
  void runQuery();

  const char *hostname_;
  String expectedHost_;  // host part of BACKEND_BASE_URL
  bool started_;
  bool disabledLogged_;
  int startupTriesLeft_;
  unsigned long nextQueryMs_;
  unsigned long attempts_;
  unsigned long successes_;
};

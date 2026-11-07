#pragma once

#include <Arduino.h>
#include <IPAddress.h>

// Decides which address BackendClient talks to. Order:
//   1. mDNS: <BACKEND_HOSTNAME>.local, accepted only if the answer is in
//      this device's own subnet (a stray VPN/Docker address is ignored).
//   2. NVS: the last address mDNS gave us, kept across reboots
//      (Preferences namespace "backend", written only when it changes).
//   3. The host in BACKEND_BASE_URL, as-is.
// The scheme, port and any path prefix always come from BACKEND_BASE_URL;
// only the host is swapped.
//
// Resolves once when Wi-Fi first connects, then again only after
// kFailuresBeforeResolve consecutive connection-level request failures
// (and at most once per kMinResolveIntervalMs). Each resolve blocks
// loop() for at most the mDNS timeout (2 s).
class BackendResolver {
 public:
  // hostname: bare mDNS name without ".local"; empty skips step 1.
  BackendResolver(const char *hostname, const char *backendBaseUrl);

  // Call every loop() while Wi-Fi is connected. deviceName is this
  // device's own mDNS name (used once for MDNS.begin()).
  // consecutiveFailures comes from BackendClient. Returns true when a
  // (re-)resolve ran this call; the caller then applies baseUrl() and
  // resets its failure count.
  bool update(unsigned long nowMs, const String &deviceName, int consecutiveFailures);

  bool hasResolved() const { return resolved_; }

  // Test builds only: wipes the saved address so the BACKEND_BASE_URL
  // fallback can be exercised.
  static void eraseSavedAddress();
  const String &baseUrl() const { return baseUrl_; }

 private:
  void resolve(const String &deviceName);
  bool queryMdns(const String &deviceName, IPAddress &out);
  bool loadSavedIp(IPAddress &out);
  void saveIpIfChanged(const IPAddress &ip);
  void use(const String &host, const char *source);

  const char *hostname_;
  String configuredUrl_;
  String prefix_;     // "http://"
  String urlHost_;    // host from BACKEND_BASE_URL
  String portAndPath_;  // ":8080" plus any path; may be empty
  String baseUrl_;
  bool resolved_;
  bool mdnsStarted_;
  unsigned long lastResolveMs_;
};

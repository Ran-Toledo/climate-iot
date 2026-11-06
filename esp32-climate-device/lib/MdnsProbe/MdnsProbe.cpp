#include "MdnsProbe.h"

#include <ESPmDNS.h>
#include <WiFi.h>

namespace {
constexpr int kStartupTries = 5;
constexpr unsigned long kStartupSpacingMs = 2000;
constexpr unsigned long kPeriodicIntervalMs = 5UL * 60UL * 1000UL;
constexpr uint32_t kQueryTimeoutMs = 2000;

// "http://192.168.1.122:8080/x" -> "192.168.1.122"
String hostFromUrl(const String &url) {
  int start = url.indexOf("://");
  start = (start < 0) ? 0 : start + 3;
  int end = url.length();
  int colon = url.indexOf(':', start);
  int slash = url.indexOf('/', start);
  if (colon >= 0 && colon < end) end = colon;
  if (slash >= 0 && slash < end) end = slash;
  return url.substring(start, end);
}
}  // namespace

MdnsProbe::MdnsProbe(const char *hostname, const char *backendBaseUrl)
    : hostname_(hostname),
      expectedHost_(hostFromUrl(String(backendBaseUrl))),
      started_(false),
      disabledLogged_(false),
      startupTriesLeft_(kStartupTries),
      nextQueryMs_(0),
      attempts_(0),
      successes_(0) {}

void MdnsProbe::update(unsigned long nowMs, bool wifiConnected, const String &deviceName) {
  if (hostname_ == nullptr || hostname_[0] == '\0') {
    if (!disabledLogged_) {
      disabledLogged_ = true;
      Serial.println("[mDNS] BACKEND_HOSTNAME not set in secrets.h; mDNS probe disabled.");
    }
    return;
  }
  if (!wifiConnected) {
    return;
  }

  if (!started_) {
    if (!MDNS.begin(deviceName.c_str())) {
      Serial.println("[mDNS] MDNS.begin() failed; will retry next loop.");
      return;
    }
    started_ = true;
    Serial.print("[mDNS] responder started as ");
    Serial.print(deviceName);
    Serial.print(".local; probing ");
    Serial.print(hostname_);
    Serial.print(".local, BACKEND_BASE_URL host is ");
    Serial.println(expectedHost_);
    nextQueryMs_ = nowMs;  // first query right away
  }

  if (static_cast<long>(nowMs - nextQueryMs_) < 0) {
    return;
  }

  runQuery();

  if (startupTriesLeft_ > 0) {
    startupTriesLeft_--;
  }
  nextQueryMs_ = millis() + (startupTriesLeft_ > 0 ? kStartupSpacingMs : kPeriodicIntervalMs);
}

void MdnsProbe::runQuery() {
  attempts_++;
  unsigned long t0 = millis();
  IPAddress ip = MDNS.queryHost(hostname_, kQueryTimeoutMs);
  unsigned long elapsed = millis() - t0;

  bool ok = (ip != IPAddress(0, 0, 0, 0));
  if (ok) {
    successes_++;
  }

  Serial.print("[mDNS] query #");
  Serial.print(attempts_);
  Serial.print(startupTriesLeft_ > 0 ? " (startup)" : " (periodic)");
  Serial.print(" ");
  Serial.print(hostname_);
  Serial.print(".local -> ");
  if (ok) {
    String ipStr = ip.toString();
    Serial.print("OK ");
    Serial.print(ipStr);
    Serial.print(" in ");
    Serial.print(elapsed);
    Serial.print(" ms; matches BACKEND_BASE_URL host: ");
    Serial.print(ipStr == expectedHost_ ? "yes" : "NO");
  } else {
    Serial.print("FAILED after ");
    Serial.print(elapsed);
    Serial.print(" ms");
  }
  Serial.print(" (local IP ");
  Serial.print(WiFi.localIP());
  Serial.print(", ");
  Serial.print(successes_);
  Serial.print("/");
  Serial.print(attempts_);
  Serial.println(" ok so far)");
}

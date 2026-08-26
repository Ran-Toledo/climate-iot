#include "WifiConnection.h"

#include <WiFi.h>

namespace {
constexpr unsigned long kInitialBackoffMs = 1000;
constexpr unsigned long kMaxBackoffMs = 30000;

// +/-20% jitter so a fleet of devices that dropped Wi-Fi at the same
// moment (e.g. a router blip) don't all retry in lockstep.
unsigned long jitteredBackoff(unsigned long backoffMs) {
  long jitterRangeMs = static_cast<long>(backoffMs / 5);
  if (jitterRangeMs <= 0) {
    return backoffMs;
  }
  long jitter = random(0, 2 * jitterRangeMs + 1) - jitterRangeMs;
  return backoffMs + jitter;
}
}  // namespace

WifiConnection::WifiConnection(const char *ssid, const char *password)
    : ssid_(ssid),
      password_(password),
      nextAttemptMs_(0),
      backoffMs_(kInitialBackoffMs),
      wasConnected_(false) {}

void WifiConnection::begin() {
  WiFi.mode(WIFI_STA);
  Serial.print("Wi-Fi connecting to ");
  Serial.print(ssid_);
  Serial.println("...");
  WiFi.begin(ssid_, password_);
  // Give this attempt time to resolve before update() considers retrying.
  nextAttemptMs_ = millis() + backoffMs_;
}

void WifiConnection::update(unsigned long nowMs) {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wasConnected_) {
      wasConnected_ = true;
      backoffMs_ = kInitialBackoffMs; // reset backoff once healthy
      Serial.print("Wi-Fi connected, IP: ");
      Serial.println(WiFi.localIP());
    }
    return;
  }

  if (wasConnected_) {
    wasConnected_ = false;
    Serial.println("Wi-Fi disconnected, will retry with backoff...");
    nextAttemptMs_ = nowMs; // reconnect promptly on a fresh drop
  }

  if (nowMs < nextAttemptMs_) {
    return;
  }

  Serial.print("Wi-Fi connecting to ");
  Serial.print(ssid_);
  Serial.print(" (retry in ");
  Serial.print(backoffMs_ / 1000);
  Serial.println("s if this attempt fails)...");
  WiFi.disconnect();
  WiFi.begin(ssid_, password_);

  nextAttemptMs_ = nowMs + jitteredBackoff(backoffMs_);
  backoffMs_ = (backoffMs_ * 2 > kMaxBackoffMs) ? kMaxBackoffMs : backoffMs_ * 2;
}

bool WifiConnection::isConnected() const { return WiFi.status() == WL_CONNECTED; }

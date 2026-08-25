#include "BackendClient.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>

namespace {
constexpr unsigned long kInitialBackoffMs = 3000;
constexpr unsigned long kMaxBackoffMs = 30000;
constexpr int kHttpTimeoutMs = 5000; // matches the simulator's fixed 5s timeout
}  // namespace

BackendClient::BackendClient(const String &baseUrl)
    : baseUrl_(baseUrl), registered_(false), nextAttemptMs_(0), backoffMs_(kInitialBackoffMs) {}

bool BackendClient::isRegistered() const { return registered_; }

void BackendClient::update(unsigned long nowMs, const String &hardwareId, const char *deviceType,
                            const char *deviceName) {
  if (registered_ || nowMs < nextAttemptMs_) {
    return;
  }

  JsonDocument doc;
  doc["hardware_id"] = hardwareId;
  doc["device_type"] = deviceType;
  if (deviceName != nullptr && strlen(deviceName) > 0) {
    doc["name"] = deviceName;
  }
  String body;
  serializeJson(doc, body);

  Serial.print("Registering with backend (");
  Serial.print(baseUrl_);
  Serial.println(")...");

  HTTPClient http;
  http.setTimeout(kHttpTimeoutMs);
  http.begin(baseUrl_ + "/api/v1/device/register");
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.POST(body);
  http.end();

  if (httpCode == 200) {
    registered_ = true;
    Serial.println("Registered with backend.");
    return;
  }

  Serial.print("Registration failed (HTTP ");
  Serial.print(httpCode);
  Serial.print("), retrying in ");
  Serial.print(backoffMs_ / 1000);
  Serial.println("s");

  nextAttemptMs_ = nowMs + backoffMs_;
  backoffMs_ = (backoffMs_ * 2 > kMaxBackoffMs) ? kMaxBackoffMs : backoffMs_ * 2;
}

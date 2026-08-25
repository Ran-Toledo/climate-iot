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

bool BackendClient::sendHeartbeat(const String &hardwareId) {
  JsonDocument doc;
  doc["hardware_id"] = hardwareId;
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.setTimeout(kHttpTimeoutMs);
  http.begin(baseUrl_ + "/api/v1/device/heartbeat");
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.POST(body);
  http.end();

  return httpCode == 200;
}

bool BackendClient::sendTelemetry(const String &hardwareId, float temperatureC,
                                   float humidityPercent) {
  JsonDocument doc;
  doc["hardware_id"] = hardwareId;
  doc["temperature"] = temperatureC;
  doc["humidity"] = humidityPercent;
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.setTimeout(kHttpTimeoutMs);
  http.begin(baseUrl_ + "/api/v1/device/telemetry");
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.POST(body);
  http.end();

  return httpCode == 201; // backend returns 201 Created for telemetry
}

CommandFetchResult BackendClient::getNextCommand(const String &hardwareId,
                                                  BackendCommand &outCommand) {
  HTTPClient http;
  http.setTimeout(kHttpTimeoutMs);
  http.begin(baseUrl_ + "/api/v1/device/commands/next?hardware_id=" + hardwareId);
  int httpCode = http.GET();

  if (httpCode != 200) {
    http.end();
    return CommandFetchResult::HttpError;
  }

  String body = http.getString();
  http.end();

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err || doc.isNull()) {
    return CommandFetchResult::None; // no pending command
  }

  if (doc["id"].isNull()) {
    return CommandFetchResult::None; // malformed/unexpected body -- treat as none
  }
  outCommand.id = doc["id"].as<long>();

  const char *type = doc["type"] | "";
  outCommand.typeSupported = (strcmp(type, "set_state") == 0);

  JsonObject payload = doc["payload"];
  outCommand.hasPower = !payload["power"].isNull();
  if (outCommand.hasPower) {
    outCommand.power = payload["power"].as<bool>();
  }
  outCommand.hasTargetTemperature = !payload["target_temperature"].isNull();
  if (outCommand.hasTargetTemperature) {
    outCommand.targetTemperature = payload["target_temperature"].as<float>();
  }

  return CommandFetchResult::Available;
}

bool BackendClient::submitCommandResult(long commandId, CommandResultStatus status,
                                         const AcDeviceState &resultState) {
  JsonDocument doc;
  doc["status"] = (status == CommandResultStatus::Completed) ? "completed" : "failed";

  JsonObject result = doc["result"].to<JsonObject>();
  if (resultState.power != PowerState::Unknown) {
    result["power"] = (resultState.power == PowerState::On);
  }
  if (resultState.targetTemperatureC >= 0) {
    result["target_temperature"] = resultState.targetTemperatureC;
  }

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.setTimeout(kHttpTimeoutMs);
  http.begin(baseUrl_ + "/api/v1/device/commands/" + String(commandId) + "/result");
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.POST(body);
  http.end();

  // 200 = acked; 409 = already resolved -- treat as handled, not an error
  // (e.g. our own earlier ack attempt actually landed even though we
  // didn't see the response, or genuine backend-side redelivery).
  return httpCode == 200 || httpCode == 409;
}

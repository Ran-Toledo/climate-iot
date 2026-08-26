#pragma once

#include <Arduino.h>
#include "DeviceState.h"

// A pending command fetched from GET /api/v1/device/commands/next.
// power/targetTemperature mirror the backend's sparse ClimateState
// payload — hasX flags distinguish "field absent" from "field present".
struct BackendCommand {
  long id = -1;
  bool typeSupported = false; // only "set_state" is handled
  bool hasPower = false;
  bool power = false;
  bool hasTargetTemperature = false;
  int targetTemperature = 0; // whole degrees C -- the API contract has no fractional setpoints
};

enum class CommandFetchResult { None, Available, HttpError };
enum class CommandResultStatus { Completed, Failed };

// Thin client for the discovered device API contract — mirrors
// device-simulator/device_simulator/api_client.py's ApiClient one method
// at a time. No auth (the backend has none for this API).
class BackendClient {
 public:
  explicit BackendClient(const String &baseUrl);

  // Registration: call every loop() once Wi-Fi is connected and not yet
  // registered. No-ops if already registered or the backoff interval
  // hasn't elapsed. Bounded exponential backoff, not a tight loop.
  void update(unsigned long nowMs, const String &hardwareId, const char *deviceType,
              const char *deviceName);
  bool isRegistered() const;

  // Heartbeat/telemetry/commands: plain single-attempt requests, each
  // blocking for up to the request timeout while in flight (a real
  // network call, not a tight loop). Callers gate call frequency
  // themselves (see HeartbeatReporter/TelemetryReporter/CommandProcessor).
  bool sendHeartbeat(const String &hardwareId);
  bool sendTelemetry(const String &hardwareId, float temperatureC, float humidityPercent);
  CommandFetchResult getNextCommand(const String &hardwareId, BackendCommand &outCommand);
  bool submitCommandResult(long commandId, CommandResultStatus status,
                            const AcDeviceState &resultState);

 private:
  String baseUrl_;
  bool registered_;
  unsigned long nextAttemptMs_;
  unsigned long backoffMs_;
};

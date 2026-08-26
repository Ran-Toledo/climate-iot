// Stage 6: adds telemetry and command handling on top of Stage 5's
// Wi-Fi/registration. Implements the remaining simulator-parity
// capabilities (see docs/esp32-firmware-status.md parity checklist):
// heartbeat, telemetry, command polling, and set_state -> IR translation.
//
// set_state commands are translated via AcTransmitter::sendState(), which
// uses IRElectraAc's own setPower()/setTemp() encoders rather than only
// replaying the 5 exact captured commands — this lets arbitrary requested
// temperatures be honored, at the cost of only 22/23C being physically
// hardware-verified (see AcTransmitter.h). This firmware also validates
// command payloads (type, presence, temperature range) before
// transmitting, which the Python simulator does not do.
//
// Wi-Fi credentials and the backend URL live in include/secrets.h
// (gitignored); copy include/secrets.example.h to create it.

#include <Arduino.h>
#include "ClimateSensor.h"
#include "AcTransmitter.h"
#include "DeviceState.h"
#include "SerialDiagnostics.h"
#include "DeviceIdentity.h"
#include "WifiConnection.h"
#include "BackendClient.h"
#include "HeartbeatReporter.h"
#include "TelemetryReporter.h"
#include "CommandProcessor.h"
#include "secrets.h"

#define DHT_PIN 4
#define DHT_TYPE DHT11
#define DHT_READ_INTERVAL_MS 2000

#define IR_SEND_PIN 6

#define DEVICE_TYPE "climate_controller" // backend contract default — see docs/esp32-firmware-plan.md

ClimateSensor climateSensor(DHT_PIN, DHT_TYPE, DHT_READ_INTERVAL_MS);
AcTransmitter acTransmitter(IR_SEND_PIN);
AcDeviceState acState;

WifiConnection wifi(WIFI_SSID, WIFI_PASSWORD);
BackendClient backendClient(BACKEND_BASE_URL);
HeartbeatReporter heartbeatReporter(backendClient);
TelemetryReporter telemetryReporter(backendClient);
CommandProcessor commandProcessor(backendClient, acTransmitter, acState);
String hardwareId;

bool hasClimateReading = false;
float lastTemperatureC = 0;
float lastHumidityPercent = 0;

void handleClimateSensor() {
  ClimateReading reading;
  if (!climateSensor.update(millis(), reading)) {
    return;
  }

  if (reading.status == ClimateReadStatus::Failed) {
    Serial.println("DHT11 read failed (sensor not responding or invalid data)");
    return;
  }

  hasClimateReading = true;
  lastTemperatureC = reading.temperatureC;
  lastHumidityPercent = reading.humidityPercent;

  Serial.print("Temperature: ");
  Serial.print(reading.temperatureC);
  Serial.print(" C  Humidity: ");
  Serial.print(reading.humidityPercent);
  Serial.println(" %");
}

void handleSerialCommand() {
  AcCommand command;
  if (!pollSerialCommand(command)) {
    return;
  }

  Serial.print("Transmitting: ");
  Serial.println(AcTransmitter::commandName(command));

  AcSendResult result = acTransmitter.send(command);
  if (result != AcSendResult::Ok) {
    Serial.println("Transmit failed: unknown command.");
    return;
  }

  applyCommandToState(acState, command);
  Serial.println("Transmit done.");
}

void handleNetworking() {
  unsigned long now = millis();
  wifi.update(now);
  if (!wifi.isConnected()) {
    return;
  }

  if (!backendClient.isRegistered()) {
    backendClient.update(now, hardwareId, DEVICE_TYPE, DEVICE_NAME);
    return;
  }

  heartbeatReporter.update(now, hardwareId);
  telemetryReporter.update(now, hardwareId, hasClimateReading, lastTemperatureC,
                            lastHumidityPercent);
  commandProcessor.update(now, hardwareId);
}

void setup() {
  Serial.begin(115200);
  delay(1000); // give the serial monitor time to attach

  climateSensor.begin();
  acTransmitter.begin();

  hardwareId = getHardwareId();
  Serial.print("Hardware ID: ");
  Serial.println(hardwareId);
  wifi.begin();

  Serial.println(
      "Stage 6: DHT11 + IR transmitter + Wi-Fi/registration + telemetry/commands starting...");
}

void loop() {
  handleClimateSensor();
  handleSerialCommand();
  handleNetworking();
}

// Stage 5: adds Wi-Fi connectivity and backend registration on top of the
// Stage 4 architecture. Registration follows the discovered backend
// contract exactly (POST /api/v1/device/register, no auth, idempotent) —
// see docs/esp32-firmware-plan.md. Wi-Fi credentials and the backend URL
// live in include/secrets.h (gitignored); copy include/secrets.example.h
// to create it.
//
// The ESP32 cannot reach "localhost" — that means the device itself, not
// your computer. BACKEND_BASE_URL in secrets.h must be your computer's
// LAN IP and the backend's port (e.g. "http://192.168.1.50:8000"), with
// the backend listening on 0.0.0.0 rather than 127.0.0.1.

#include <Arduino.h>
#include "ClimateSensor.h"
#include "AcTransmitter.h"
#include "DeviceState.h"
#include "SerialDiagnostics.h"
#include "DeviceIdentity.h"
#include "WifiConnection.h"
#include "BackendClient.h"
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
String hardwareId;

void handleClimateSensor() {
  ClimateReading reading;
  if (!climateSensor.update(millis(), reading)) {
    return;
  }

  if (reading.status == ClimateReadStatus::Failed) {
    Serial.println("DHT11 read failed (sensor not responding or invalid data)");
    return;
  }

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
  if (wifi.isConnected() && !backendClient.isRegistered()) {
    backendClient.update(now, hardwareId, DEVICE_TYPE, DEVICE_NAME);
  }
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
      "Stage 5: DHT11 (GPIO4) + IR transmitter (GPIO6) + Wi-Fi/registration starting...");
  printSerialHelp();
}

void loop() {
  handleClimateSensor();
  handleSerialCommand();
  handleNetworking();
}

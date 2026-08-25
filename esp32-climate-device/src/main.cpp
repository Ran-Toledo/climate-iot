// Stage 4: combined local firmware architecture. Refactors the validated
// Stage 1-3 hardware code into clear components (lib/ClimateSensor,
// lib/AcTransmitter, lib/DeviceState, lib/SerialDiagnostics) driven by a
// cooperative, non-blocking main loop. No Wi-Fi yet.
//
// The IR receiver (GPIO5, used for protocol discovery in Stages 2-3) is
// intentionally dropped here — the backend contract has no endpoint for
// the device to report AC state detected from a physical remote, so it
// has no role in the production architecture. GPIO5 is unused.

#include <Arduino.h>
#include "ClimateSensor.h"
#include "AcTransmitter.h"
#include "DeviceState.h"
#include "SerialDiagnostics.h"

#define DHT_PIN 4
#define DHT_TYPE DHT11
#define DHT_READ_INTERVAL_MS 2000

#define IR_SEND_PIN 6

ClimateSensor climateSensor(DHT_PIN, DHT_TYPE, DHT_READ_INTERVAL_MS);
AcTransmitter acTransmitter(IR_SEND_PIN);
AcDeviceState acState;

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

void setup() {
  Serial.begin(115200);
  delay(1000); // give the serial monitor time to attach

  climateSensor.begin();
  acTransmitter.begin();

  Serial.println(
      "Stage 4: DHT11 (GPIO4) + IR transmitter (GPIO6) — combined architecture starting...");
  printSerialHelp();
}

void loop() {
  handleClimateSensor();
  handleSerialCommand();
}

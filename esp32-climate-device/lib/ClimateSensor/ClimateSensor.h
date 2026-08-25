#pragma once

#include <Arduino.h>
#include <DHT.h>

enum class ClimateReadStatus { Ok, Failed };

struct ClimateReading {
  ClimateReadStatus status;
  float temperatureC;
  float humidityPercent;
};

// Non-blocking wrapper around the DHT11, gating reads on its own
// millis()-based interval instead of delay().
class ClimateSensor {
 public:
  ClimateSensor(uint8_t pin, uint8_t dhtType, uint32_t readIntervalMs);

  void begin();

  // Call every loop(). Returns true only on iterations where a read was
  // actually attempted (per readIntervalMs) and fills outReading; returns
  // false otherwise, in which case outReading is left untouched.
  bool update(unsigned long nowMs, ClimateReading &outReading);

 private:
  DHT dht_;
  uint32_t readIntervalMs_;
  unsigned long lastReadMs_;
};

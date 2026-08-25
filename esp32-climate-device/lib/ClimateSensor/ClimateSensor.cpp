#include "ClimateSensor.h"

ClimateSensor::ClimateSensor(uint8_t pin, uint8_t dhtType, uint32_t readIntervalMs)
    : dht_(pin, dhtType), readIntervalMs_(readIntervalMs), lastReadMs_(0) {}

void ClimateSensor::begin() { dht_.begin(); }

bool ClimateSensor::update(unsigned long nowMs, ClimateReading &outReading) {
  if (nowMs - lastReadMs_ < readIntervalMs_) {
    return false;
  }
  lastReadMs_ = nowMs;

  float humidity = dht_.readHumidity();
  float temperature = dht_.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    outReading.status = ClimateReadStatus::Failed;
    return true;
  }

  outReading.status = ClimateReadStatus::Ok;
  outReading.temperatureC = temperature;
  outReading.humidityPercent = humidity;
  return true;
}

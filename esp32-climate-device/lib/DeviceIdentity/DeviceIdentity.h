#pragma once

#include <Arduino.h>

// A stable per-device identifier derived from the ESP32's eFuse MAC
// (e.g. "esp32-a1b2c3d4e5f6") — the same value across reboots, which is
// what the backend's idempotent registration contract expects.
String getHardwareId();

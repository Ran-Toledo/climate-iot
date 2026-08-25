# esp32-climate-device

ESP32-S3 firmware for the Climate IoT smart-home controller: DHT11
temperature/humidity sensing plus IR receive/transmit for AC control,
eventually reporting telemetry and executing commands against the
[Climate IoT backend](../backend) over the same HTTP contract the Python
[device-simulator](../device-simulator) uses.

This is an independent PlatformIO Arduino project — it does not share code
or configuration with `esp32-led-test` (a separate, already-validated
NeoPixel test project) or with the backend/simulator.

## Status

Implementation proceeds in gated stages; only project scaffolding
(`platformio.ini` + this README) exists so far. See:

- [`../docs/esp32-firmware-plan.md`](../docs/esp32-firmware-plan.md) — full
  staged implementation plan, safety rules, hardware pinout, and the
  backend/simulator protocol contract discovered in Stage 0.
- [`../docs/esp32-firmware-status.md`](../docs/esp32-firmware-status.md) —
  current stage-by-stage progress and the simulator parity checklist.

## Hardware

- Board: ESP32-S3 dev board, module ESP32-S3-WROOM-1-N16R8
- PlatformIO board id: `esp32-s3-devkitc-1`
- Framework: Arduino
- Serial baud rate: 115200
- DHT11 data: GPIO4
- IR receiver output: GPIO5
- IR transmitter data: GPIO6
- Onboard RGB LED: GPIO48

## Build / upload / monitor

Standard PlatformIO commands, run from this directory (or via the
PlatformIO VS Code extension toolbar):

```
pio run                 # build
pio run --target upload # upload
pio device monitor      # serial monitor (115200 baud)
```

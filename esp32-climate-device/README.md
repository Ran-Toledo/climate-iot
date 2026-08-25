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

Implementation proceeds in gated stages. Stage 1 (DHT11 sensor test) is
confirmed working on hardware. Stage 2 (IR receiver) is implemented and
awaiting hardware verification. See:

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

## Stage 1 — DHT11 sensor test

`src/main.cpp` reads the DHT11 on GPIO4 every 2 seconds (respecting the
sensor's slow sampling interval) and prints temperature (°C) and humidity
(%) to serial. Failed/invalid reads are detected via `isnan()` and reported
without crashing or blocking subsequent reads.

Library used: `adafruit/DHT sensor library` (plus its
`Adafruit Unified Sensor` dependency), declared in `platformio.ini`.

Expected serial output once the monitor attaches:

```
DHT11 test starting on GPIO4...
Temperature: 23.00 C  Humidity: 45.00 %
Temperature: 23.00 C  Humidity: 45.00 %
...
```

If the sensor is disconnected or misreads, a line like
`DHT11 read failed (sensor not responding or invalid data)` prints instead,
and the loop keeps retrying every 2s.

### Verification checklist

- [ ] `pio run` builds without errors.
- [ ] `pio run --target upload` succeeds.
- [ ] Serial monitor at 115200 baud shows the startup message.
- [ ] Temperature/humidity readings print every ~2s and look plausible for
      ambient conditions.
- [ ] Briefly disconnecting/covering the sensor produces the failure
      message, not a crash/reboot.

## Stage 2 — IR receiver

`src/main.cpp` now also reads an IR receiver module on GPIO5 via
`IRremoteESP8266`, printing everything needed to reproduce a command later:
protocol name, bit count, decoded value or state bytes, a reproducible
raw/state source-code dump, and repeat-frame status. The DHT11 loop from
Stage 1 is unchanged and keeps running alongside it. **No transmission
happens in this stage** — GPIO6 (IR transmitter) is not used yet.

Library used: `crankyoldgit/IRremoteESP8266` (declared in
`platformio.ini`). The receiver uses a 1024-entry capture buffer with
resume-on-overflow, since AC remotes often send long stateful messages
rather than a simple 32-bit code — this avoids truncating them.

Expected serial output when you point a remote at the receiver and press a
button:

```
---- IR message received ----
Protocol  : <protocol name, or UNKNOWN>
Code      : 0x... (<N> bits)
...
Repeat: no
uint16_t rawData[...] = {...};  // or a decoded state array
------------------------------
```

For AC-specific protocols the library recognizes, an extra human-readable
line describing the settings (power/mode/temp/fan, etc.) will print above
the raw dump.

### Verification checklist

- [ ] `pio run` builds without errors (new `IRremoteESP8266` dependency
      fetches and compiles cleanly).
- [ ] DHT11 readings from Stage 1 continue to print every ~2s, unaffected.
- [ ] Pressing buttons on the actual AC remote (power, mode, temperature
      up/down) each produce a distinct, readable IR message in the serial
      monitor — not silence, not garbage/UNKNOWN for every button.
- [ ] Save/share the raw serial output for at least: power on, power off,
      and one temperature-change command — Stage 3 needs real captured
      data to reproduce, not invented placeholder commands.

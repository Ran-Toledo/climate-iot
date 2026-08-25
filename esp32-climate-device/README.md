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

Implementation proceeds in gated stages. Stages 1-3 (DHT11 sensor,
IR receiver, IR transmitter) are confirmed working on hardware. Stage 4
(combined local architecture) is implemented and awaiting hardware
verification. See:

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
- IR receiver output: GPIO5 — used for protocol discovery in Stages 2-3
  only; **not used by the firmware from Stage 4 onward** (see Stage 4
  notes below). The physical module can stay wired; it's just unused.
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

## Stage 3 — IR transmitter

`src/main.cpp` now also transmits on GPIO6 via the `IRElectraAc`
protocol-specific class (the AC unit's protocol, confirmed in Stage 2, is
ELECTRA_AC). It replays the exact 13-byte states captured from the real
remote in Stage 2 (see
[`captures/electra-ac-commands.md`](captures/electra-ac-commands.md)) —
nothing is invented or guessed. **Transmission only happens when you type
a command into the serial monitor — never on startup.**

While monitoring (`pio device monitor`), type one of these letters and
press Enter:

| Key | Command |
|---|---|
| `u` | temperature up (→23°C) |
| `d` | temperature down (→22°C) |
| `n` | power on |
| `o` | power off |
| `f` | fan level change |

The DHT11 (Stage 1) and IR receiver (Stage 2) keep running unchanged.
During a transmission, IR reception is briefly paused
(`irrecv.disableIRIn()` / `enableIRIn()`) so the receiver doesn't pick up
and re-print our own transmitted signal.

Library used: same `crankyoldgit/IRremoteESP8266` dependency — no new
`platformio.ini` entry needed, since `IRElectraAc` (`ir_Electra.h`) is
part of that library.

Expected serial output when you type e.g. `n` + Enter:

```
Transmitting: power on
Transmit done.
```

### Verification checklist

- [ ] `pio run` builds without errors.
- [ ] DHT11 and IR-receive behavior from Stages 1–2 are unaffected.
- [ ] Typing `u`/`d`/`n`/`o`/`f` + Enter each fire exactly one transmission
      and print the expected `Transmitting: ...` / `Transmit done.` lines.
- [ ] **The physical AC unit reacts correctly** to each command: `n` turns
      it on, `o` turns it off, `u`/`d` change the setpoint temperature (and
      the AC's own display, if it has one, should reflect this), `f`
      changes fan speed.
- [ ] No transmission happens on boot/reset — only on typed command.
- [ ] The IR receiver isn't stuck/confused by self-transmission (Stage 2
      behavior — reading a different real remote press afterward — still
      works).

## Stage 4 — Combined local firmware architecture

Refactors Stages 1-3 into clear PlatformIO library components, each with
an explicit result/error type, driven by a cooperative non-blocking
`loop()`. No Wi-Fi yet.

```
lib/
  ClimateSensor/      DHT11 read scheduling — ClimateReadStatus{Ok,Failed}
  AcTransmitter/       IR transmit — AcCommand enum, AcSendResult{Ok,UnknownCommand}
  DeviceState/          local best-effort AC state model
  SerialDiagnostics/    serial command parsing (u/d/n/o/f) + help text
src/main.cpp            orchestration only: wires components together in setup()/loop()
```

**The IR receiver is dropped from this and all later stages.** It was a
Stage 2/3 protocol-discovery tool, not a production capability: the
backend contract (Stage 0 findings) has no endpoint for a device to
report AC state it detected from a physical remote, so there was nothing
for a receiver to feed once transmission worked. GPIO5 is now unused;
`IRrecv`/`IRAcUtils`/`IRutils` are no longer included. This was an
explicit decision, not an oversight — see
[`../docs/esp32-firmware-status.md`](../docs/esp32-firmware-status.md)
Stage 4 notes.

`AcDeviceState` tracks only what this firmware has explicitly told the AC
(power, and 22/23°C target from the two temperature commands actually
captured) — there's no feedback channel to confirm the AC applied it, so
`power`/`targetTemperatureC` start `Unknown`/`-1` rather than an assumed
default. Fan speed isn't tracked; the Stage 2 capture never decoded a
different fan value across presses.

Behavior is otherwise identical to Stage 3: DHT11 prints every ~2s, and
typing `u`/`d`/`n`/`o`/`f` + Enter in the serial monitor transmits the
corresponding captured command. No dependency changes.

### Verification checklist

- [ ] `pio run` builds without errors.
- [ ] DHT11 readings print every ~2s, same as before.
- [ ] Typing `u`/`d`/`n`/`o`/`f` + Enter behaves identically to Stage 3
      (serial output and physical AC reaction).
- [ ] No regressions from the refactor — this stage should be invisible
      behaviorally aside from the receiver being gone.

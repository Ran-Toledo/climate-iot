# ESP32 Climate Device Firmware — Implementation Status

Tracks progress against `esp32-firmware-plan.md`. Update this file at the
end of each stage.

| Stage | Status | Date | Notes |
|---|---|---|---|
| 0 — Repository & protocol discovery | **Done** | 2026-08-25 | See findings below. No code created/changed. |
| 1 — PlatformIO project + DHT11 test | **Done** | 2026-08-25 | Confirmed working on hardware. See notes below. |
| 2 — IR receiver | **Done** | 2026-08-25 | Confirmed working on hardware. See notes below. |
| 3 — IR transmitter | **Done** | 2026-08-25 | Confirmed working on hardware. See notes below. |
| 4 — Combined local firmware architecture | Not started | | |
| 5 — Wi-Fi and backend registration | Not started | | |
| 6 — Telemetry and commands | Not started | | |
| 7 — Reliability and final documentation | Not started | | |

## Stage 0 — findings summary

- Transport is plain HTTP polling (`httpx` in the simulator); no MQTT/WS/SSE
  in the stack.
- No authentication exists in the device API today — trusts `hardware_id`
  in the request body. Confirmed in code (`backend/app/api/device.py`,
  `backend/app/schemas/device.py`) and README ("no auth" explicitly out of
  scope). Stage 5 will not invent a token scheme.
- Full endpoint/parity table captured in `esp32-firmware-plan.md` under
  "Discovered backend contract".
- No test suite exists anywhere in the repo outside `esp32-led-test`
  (which contains no tests either) — the README demo walkthrough plus
  actual service/route code are the only spec.
- `esp32-led-test/platformio.ini` requires
  `-DARDUINO_USB_MODE=1 -DARDUINO_USB_CDC_ON_BOOT=1` for serial monitor to
  work on this S3 board — noted for Stage 1, not modified.

## Stage 1 — notes

- `esp32-climate-device/platformio.ini`: added `lib_deps` for
  `adafruit/DHT sensor library@^1.4.6` and its
  `adafruit/Adafruit Unified Sensor@^1.1.14` dependency. USB CDC build
  flags carried forward unmodified from `esp32-led-test`, per plan.
- `esp32-climate-device/src/main.cpp`: reads DHT11 on GPIO4 every 2s via
  `millis()`-based non-blocking timing (no `delay()` in the read loop),
  prints temperature/humidity, and reports `isnan()` failures without
  crashing.
- `esp32-climate-device/README.md` updated with Stage 1 build/verify
  instructions and a checklist.
- Not built/uploaded/monitored by the assistant, per the plan's hardware
  interaction rule — user built, uploaded, and monitored themselves.
- Confirmed on real hardware: builds/uploads via the ESP32-S3's native USB
  port (enumerates as a generic "USB Serial Device", separate from the
  onboard CH343 UART-bridge port); DHT11 (3-pin module, onboard pull-up)
  reads plausible temperature/humidity every 2s once wiring was fixed.
- Root cause of initial "DHT11 read failed" output: a split breadboard
  power rail, not a firmware issue — sensor was unpowered. No code changes
  were needed.
- DHT11 hardware resolution is integer-only (±2°C / ±5% RH accuracy), so
  `.00` fractional digits in the float output are expected, not a bug.

## Stage 2 — notes

- `esp32-climate-device/platformio.ini`: added `lib_deps` entry
  `crankyoldgit/IRremoteESP8266@^2.9.0` (current stable as of 2026-01;
  includes ESP32 Arduino core 3.x support).
- `esp32-climate-device/src/main.cpp`: added `IRrecv` on GPIO5 with a
  1024-entry capture buffer and resume-on-overflow (`true`), sized for
  long stateful AC messages rather than assuming a 32-bit code. On each
  decode, prints `resultToHumanReadableBasic()`, the AC-specific decode via
  `IRAcUtils::resultAcToString()` when recognized, repeat-frame status, and
  a full reproducible raw/state dump via `resultToSourceCode()` — the data
  Stage 3 will need to reproduce the command, rather than an invented
  placeholder.
- DHT11 loop from Stage 1 preserved unchanged; `loop()` now calls
  `handleIr()` (non-blocking poll) and `handleDht()` (own `millis()` gate)
  every iteration.
- No transmission — GPIO6 untouched, per plan.
- Not built/uploaded/monitored by the assistant, per the plan's hardware
  interaction rule — user built, uploaded, and captured real remote
  commands themselves, saved to
  `esp32-climate-device/captures/electra-ac-commands.md` (tracked in git).
- Confirmed on real hardware: AC unit's protocol correctly identified as
  **ELECTRA_AC**, a 104-bit stateful protocol with full library AC decode
  support (power/mode/temp/fan/swing all correctly parsed). Captured
  commands: temperature up (23C), temperature down (22C), power off,
  power on, fan level change — five distinct real commands, each with a
  readable decode, a 13-byte state array, and a 211-entry raw timing
  fallback.
- This matters for Stage 3: `IRremoteESP8266` has a dedicated
  `IRElectraAc` protocol-specific send class (not just raw replay), so the
  transmitter can construct/send validated Electra AC state rather than
  only replaying raw timing — per the plan's preference for
  protocol-specific implementations when available.

## Stage 3 — notes

- `esp32-climate-device/src/main.cpp`: added `IRElectraAc irsend(6)` and
  five `const uint8_t[13]` state arrays copied verbatim from
  `captures/electra-ac-commands.md` (temp up, temp down, power on, power
  off, fan change) — no invented/placeholder command data, per plan.
- Transmission is fired only from `handleSerialCommand()`, which reads one
  character from `Serial` per loop iteration and maps `u`/`d`/`n`/`o`/`f`
  to a command; unrecognized input (other than line-ending characters)
  prints a help message instead of transmitting. Nothing transmits from
  `setup()`.
- `sendCommand()` calls `irrecv.disableIRIn()` before `irsend.send()` and
  `irrecv.enableIRIn()` after (with a 50ms gap), so the Stage 2 receiver
  doesn't decode/print our own transmission as if it were a real remote
  press.
- No new `platformio.ini` dependency — `IRElectraAc` (`ir_Electra.h`) is
  part of the already-declared `crankyoldgit/IRremoteESP8266` package.
- DHT11 (Stage 1) and IR receive (Stage 2) loops are otherwise unchanged.
- Not built/uploaded/monitored by the assistant, per the plan's hardware
  interaction rule — user built, uploaded, and tested against the real AC
  themselves.
- Confirmed on real hardware, with two fixes along the way:
  1. `n`/`o` (power on/off) worked immediately with a single-frame send;
     `u`/`d`/`f` (temp up/down, fan change) initially did not. Changed
     `irsend.send()` to `irsend.send(1)` (frame + one repeat, via the
     library's own protocol-correct repeat timing) as the likely fix,
     since the real remote plausibly sends those specific commands as two
     back-to-back frames.
  2. Remaining intermittent AC reception traced to IR transmitter
     range/aim (module was at longer range and/or an angle) — not a code
     or wiring defect. Pointing it directly at the AC's receiver eye at
     close range resolved it. No further code change needed for this.
- Confirms `IRElectraAc` + real captured state replay is a viable
  transmission path for Stage 6 command translation.

## Simulator parity checklist (living document — update in Stage 6)

| Capability | Simulator | Firmware |
|---|---|---|
| Device identity | Configurable string via env | Not yet implemented |
| Registration | `POST /device/register`, idempotent, infinite retry @3s | Not yet implemented |
| Auth/tokens | None (by design) | Not yet implemented |
| Heartbeat/status | `POST /device/heartbeat` every 10s | Not yet implemented |
| Telemetry payload | `POST /device/telemetry` temp/humidity/co2 every 5s | Not yet implemented |
| Command retrieval | `GET /device/commands/next` poll every 3s | Not yet implemented |
| Command types | `set_state` {power?, target_temperature?} | Not yet implemented |
| Command ack | `POST /device/commands/{id}/result` | Not yet implemented |
| Retry/timeout | Fixed 5s timeout, no backoff (except reg. loop) | Not yet implemented |
| Heartbeat/online derivation | Server-side, 30s threshold | N/A (server behavior) |

## Open questions for the user

None currently — Stage 0 fully resolved the backend/simulator contract.

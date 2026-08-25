# ESP32 Climate Device Firmware — Implementation Plan

This is the reference plan for building `esp32-climate-device` firmware that
replaces the Python `device-simulator` with real ESP32-S3 hardware
(DHT11 sensor + IR receive/transmit for AC control), speaking the same
backend contract. It is implemented in gated stages; each stage stops for
explicit human approval (and, for hardware stages, real test results) before
the next one begins. See `esp32-firmware-status.md` in this directory for
current progress against this plan.

## Safety and scope rules

- Do not modify, delete, rename, or overwrite the existing `esp32-led-test`
  directory.
- New firmware lives in an independent PlatformIO project:
  `esp32-climate-device/`.
- Do not modify the backend or Python device simulator unless explicitly
  approved.
- Never upload firmware, open a serial monitor, select a serial port, or
  otherwise interact with the physical device — the user builds, uploads,
  and monitors themselves via PlatformIO in VS Code.
- Never run a build unless explicitly asked.
- Implement exactly one approved stage at a time. Do not begin, partially
  implement, or prepare code for the next stage while waiting on results
  from the current one.
- Preserve all working behavior confirmed in earlier stages.
- Never invent backend endpoints, payloads, commands, or auth behavior —
  the backend and Python simulator (both inspected in Stage 0) are the
  spec, not assumptions.

## Hardware

- Board: ESP32-S3 dev board, module ESP32-S3-WROOM-1-N16R8
- PlatformIO board id: `esp32-s3-devkitc-1`
- Framework: Arduino
- Serial baud rate: 115200
- DHT11 data: GPIO4
- IR receiver output: GPIO5
- IR transmitter data: GPIO6
- Onboard RGB LED: GPIO48
- Sensor/IR modules are already wired and powered from 3.3V. Any additional
  wiring must be explained and approved before being assumed.
- Note: this S3 board needs `-DARDUINO_USB_MODE=1` and
  `-DARDUINO_USB_CDC_ON_BOOT=1` build flags for the native-USB serial
  monitor to attach (confirmed working setup in the existing
  `esp32-led-test` project — carried forward, not modified).

## Mandatory stage workflow

At the end of every stage, provide:

1. Concise summary of what was completed.
2. Files created or changed.
3. How the implementation works.
4. Libraries / PlatformIO dependencies used.
5. Exact PlatformIO commands / VS Code controls to build, upload, and open
   the serial monitor.
6. Expected serial output / physical behavior.
7. A short verification checklist.
8. Any questions or results needed back from the user.
9. An explicit statement that work has stopped and is waiting on the
   user's test results.

Never continue on the assumption that code "looks correct" — always wait
for an explicit go-ahead.

## Discovered backend contract (Stage 0 findings)

Transport: **plain HTTP polling** (no WebSocket/SSE/MQTT anywhere in the
stack). This is what the simulator (`device-simulator/device_simulator/`)
does and what the firmware must replicate.

| Capability | Contract |
|---|---|
| Identity | Free-form string `hardware_id`. No hardware-derived scheme mandated by the backend — a MAC-derived id (e.g. `esp32-<eFuse MAC>`) is safe and idempotent. |
| Registration | `POST /api/v1/device/register {hardware_id, device_type, name}`. Idempotent: re-registering an existing `hardware_id` just updates `device_type`/`name`. |
| Auth | **None.** The device API trusts `hardware_id` in the body. No token is issued or required — confirmed both in code and in the README ("no auth" is explicitly out of scope). Do not invent one. |
| Heartbeat / status | `POST /api/v1/device/heartbeat {hardware_id}`. Server derives `online` as `now - last_heartbeat_at < 30s` (hardcoded, not configurable). No richer status enum, no last-will message. |
| Telemetry | `POST /api/v1/device/telemetry {hardware_id, temperature, humidity}` — both required floats. No client timestamp. `co2` was removed from this contract at Stage 6 (backend + simulator change, explicitly approved) since no CO2 sensor exists in this project's hardware — see `esp32-firmware-status.md` Stage 6 notes. |
| Command retrieval | `GET /api/v1/device/commands/next?hardware_id=...` — returns the single oldest pending command or `null`. **Not marked in-flight on fetch** — redelivery is possible if polled twice before ack; dedupe on the client is worthwhile. |
| Command shape | Only `type: "set_state"` exists. Payload: `{power?: bool, target_temperature?: float}`, sparse/partial, merged server-side into device state. |
| Command ack | `POST /api/v1/device/commands/{id}/result {status: "completed"|"failed", result?: dict}`. Server 409s if the command was already resolved (guards double-ack, not double-delivery). |
| Retry/timeout | Simulator itself uses a fixed 5s timeout and no backoff except an indefinite 3s-interval registration retry loop. The firmware is expected to do *better* here per Stage 7 (bounded backoff), which does not conflict with the protocol. |

Simulator's default cadence (env-var driven, mirrored as firmware
defaults): heartbeat every 10s, telemetry every 5s, command poll every 3s.

Not determinable from the repo (do not assume): backend-side handling of a
`"failed"` command result beyond storing it; any API versioning/negotiation;
malformed-payload behavior beyond standard Pydantic 422s.

## Stage 1 — PlatformIO project and DHT11 test

- Create `esp32-climate-device` as an independent PlatformIO Arduino
  project (`platform = espressif32`, `board = esp32-s3-devkitc-1`,
  `framework = arduino`, `monitor_speed = 115200`).
- Add only the dependencies needed for this stage.
- Read DHT11 on GPIO4, print temperature + humidity every 2s, respecting
  the sensor's slow sampling interval.
- Detect and clearly report failed/invalid readings without crashing.
- Include a README and appropriate `.gitignore`.
- Stop and wait for build/upload/hardware results.

## Stage 2 — IR receiver

- Add IR receiver support on GPIO5, most likely via `IRremoteESP8266` if
  compatible.
- Print protocol, bit count, decoded value/state bytes, raw timing when
  necessary, and repeat status — enough to reproduce the command later.
- Do not assume AC commands fit in 32 bits — preserve long/stateful
  messages.
- Keep DHT11 working.
- Stop and wait for captured remote data before implementing transmission.

## Stage 3 — IR transmitter

- Add transmission on GPIO6, reproducing the captured command using the
  library's protocol-specific AC implementation when available, otherwise
  the full decoded state or raw timing sequence.
- Never invent/hardcode a placeholder command.
- Keep DHT11 and IR reception working; pause reception during transmission
  where practical to avoid self-triggering.
- Add a temporary serial command to deliberately trigger a test
  transmission — never transmit on startup.
- Stop and wait for confirmation the real AC reacted correctly.

## Stage 4 — Combined local firmware architecture

- Refactor validated hardware code into clear components: climate sensing,
  IR reception, IR transmission, device state, serial diagnostics.
- Cooperative non-blocking main loop based on `millis()`; avoid long
  production `delay()` calls.
- Define clear result/error types for hardware operations.
- No Wi-Fi yet.
- Stop and wait for local regression-test results.

## Stage 5 — Wi-Fi and backend registration

- Add Wi-Fi connectivity; keep credentials/backend config out of committed
  source (ignored local secrets file + committed example template).
- Explain that `localhost` won't reach a backend on the user's computer —
  the ESP32 needs the LAN IP (or whatever host the deployment actually
  uses).
- Bounded exponential backoff for reconnection, not a tight retry loop.
- Implement registration exactly as discovered above — no invented auth.
- Reuse a stable identifier (eFuse MAC) if compatible (it is).
- Persist a registration token via Preferences/NVS **only if** the backend
  contract requires it — it currently does not, so this will likely be
  skipped unless discovery changes.
- Never print Wi-Fi passwords or secrets to serial.
- Stop and wait for confirmed Wi-Fi connection + successful registration.

## Stage 6 — Telemetry and commands

- Implement every capability the Python simulator currently implements
  (see parity table above).
- Real DHT11 telemetry on the exact backend schema.
- Poll for commands using the same transport/cadence; validate names,
  fields, ranges, malformed payloads.
- Translate `set_state` commands into validated IR transmissions.
- Never acknowledge success before the IR transmission has actually been
  issued.
- Dedupe commands (the backend can redeliver, per the parity table).
- Keep sensor/IR responsiveness during network operations.
- Update the parity checklist with evidence for each implemented
  capability — no silent claims of parity.
- Stop and wait for end-to-end test results.

## Stage 7 — Reliability and final documentation

- Verify/add: Wi-Fi + backend reconnection, request timeouts, bounded
  retries with jitter/backoff, malformed-response handling, DHT11
  read-failure handling, command dedup, safe post-reboot behavior,
  diagnostics that don't leak secrets.
- Avoid unbounded queues, tight retry loops, excessive heap allocation.
- Document final architecture, execution flow, setup/build/upload/monitor/
  troubleshooting.
- Final ESP32-vs-simulator capability comparison; explicitly list any
  simulator behavior intentionally left unsupported.

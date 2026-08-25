# ESP32 Climate Device Firmware — Implementation Status

Tracks progress against `esp32-firmware-plan.md`. Update this file at the
end of each stage.

| Stage | Status | Date | Notes |
|---|---|---|---|
| 0 — Repository & protocol discovery | **Done** | 2026-08-25 | See findings below. No code created/changed. |
| 1 — PlatformIO project + DHT11 test | Not started | | |
| 2 — IR receiver | Not started | | |
| 3 — IR transmitter | Not started | | |
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

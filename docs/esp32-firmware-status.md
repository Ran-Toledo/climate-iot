# ESP32 Climate Device Firmware — Implementation Status

Tracks progress against `esp32-firmware-plan.md`. Update this file at the
end of each stage.

| Stage | Status | Date | Notes |
|---|---|---|---|
| 0 — Repository & protocol discovery | **Done** | 2026-08-25 | See findings below. No code created/changed. |
| 1 — PlatformIO project + DHT11 test | **Done** | 2026-08-25 | Confirmed working on hardware. See notes below. |
| 2 — IR receiver | **Done** | 2026-08-25 | Confirmed working on hardware. See notes below. |
| 3 — IR transmitter | **Done** | 2026-08-25 | Confirmed working on hardware. See notes below. |
| 4 — Combined local firmware architecture | **Done** | 2026-08-25 | Confirmed working on hardware. See notes below. |
| 5 — Wi-Fi and backend registration | **Done** | 2026-08-26 | Confirmed working end-to-end. See notes below. |
| 6 — Telemetry and commands | **Done** | 2026-08-26 | Confirmed working end-to-end. See notes below. |
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

## Stage 4 — notes

- Refactored into PlatformIO `lib/` components, each with an explicit
  result/error type:
  - `lib/ClimateSensor/`: `ClimateReadStatus{Ok,Failed}`,
    `ClimateSensor::update(nowMs, outReading)` — same DHT11 logic as
    Stage 1, just extracted with the read-interval gate as a member.
  - `lib/AcTransmitter/`: `AcCommand` enum (the 5 real captured commands),
    `AcSendResult{Ok,UnknownCommand}`, `AcTransmitter::send(command)` —
    the Stage 3 `IRElectraAc` + captured-state-array logic, extracted
    verbatim (including the `send(1)` repeat fix).
  - `lib/DeviceState/`: `AcDeviceState{power: PowerState, 
    targetTemperatureC: int8_t}`, new this stage. Deliberately starts
    `Unknown`/`-1` rather than an assumed default, since there's no
    feedback channel (receiver is gone) to confirm real AC state.
    `targetTemperatureC` is only ever set to 22 or 23 — the exact values
    decoded from the two captured temperature commands — not a synthesized
    +/-1 delta, since the firmware doesn't know the true general
    temperature-step semantics.
  - `lib/SerialDiagnostics/`: `pollSerialCommand()` /
    `printSerialHelp()` — the Stage 3 serial command parsing, extracted.
  - `src/main.cpp`: orchestration only now — wires the components together
    in `setup()`/`loop()`, no hardware logic of its own.
- **IR receiver dropped** per explicit user decision (this conversation):
  `IRrecv`/`IRAcUtils`/`IRutils` includes removed, GPIO5 unused. Rationale
  recorded in Stage 0/2 findings: the backend has no endpoint for a device
  to report AC state detected from a physical remote, so the receiver had
  no production role once transmission was validated in Stage 3. It
  remains documented and available in git history (Stages 2-3 commits) if
  ever needed again.
- Removed the artificial `delay(50)` that used to gate re-enabling the
  receiver after a transmission — no longer needed now that the receiver
  is gone, which also reduces blocking time per command.
- No `platformio.ini` dependency changes.
- Behavior is intended to be identical to Stage 3 (same commands, same
  DHT11 cadence) — this is a pure internal refactor plus the receiver
  removal, not a functional change to transmission or sensing.
- Not built/uploaded/monitored by the assistant, per the plan's hardware
  interaction rule — user built, uploaded, and tested against the real AC
  themselves.
- Initial test showed commands not reaching the AC. Diffed the refactored
  transmit path (`lib/AcTransmitter`) against the working Stage 3 code
  line-by-line and byte-for-byte against
  `captures/electra-ac-commands.md` — no discrepancy found, confirming
  this was not a code regression. Root cause was transmitter aim/range
  again (same class of issue as Stage 3) — worked once retested at close,
  direct range. No code change was needed.
- Confirmed on real hardware: all 5 commands work identically to Stage 3;
  DHT11 unaffected.

## Stage 5 — notes

- New `platformio.ini` dependency: `bblanchon/ArduinoJson@^7.4.3` (current
  stable) for building the registration JSON body. `WiFi.h`/`HTTPClient.h`
  are bundled with the ESP32 Arduino core — no separate dependency.
- New components: `lib/DeviceIdentity/` (`getHardwareId()` — stable ID
  from `ESP.getEfuseMac()`, format `esp32-<12 hex chars>`),
  `lib/WifiConnection/` (connect/reconnect state machine, bounded
  exponential backoff 1s→30s cap, never a tight loop), `lib/BackendClient/`
  (registration POST with the same backoff pattern, 3s→30s cap).
- Registration implemented exactly per the Stage 0 contract: `POST
  /api/v1/device/register {hardware_id, device_type, name}`, no auth.
  `device_type` hardcoded to `"climate_controller"` — matches
  `backend/app/schemas/device.py`'s own Pydantic default and the
  simulator's literal value (verified in
  `device-simulator/device_simulator/api_client.py`), not invented.
  `name` is read from `secrets.h`'s `DEVICE_NAME` and omitted from the
  payload entirely if empty (field is nullable in the schema).
- Credentials/config: `include/secrets.example.h` committed as the
  template; `include/secrets.h` is gitignored and was seeded locally
  with placeholder values (a straight copy of the example) — **the user
  must edit it with real Wi-Fi credentials and their backend's LAN IP**
  before this stage will actually connect to anything.
- No registration token persistence (Preferences/NVS) — confirmed still
  correct per Stage 0: the backend has no auth/token concept, so there is
  nothing to persist.
- DHT11 (Stage 1) and IR transmit/serial commands (Stages 3-4) are
  untouched and keep working during Wi-Fi/registration retries — neither
  `WifiConnection::update()` nor `BackendClient::update()` block beyond a
  single HTTP call's timeout (5s, matching the simulator's own timeout),
  gated by their own backoff timer rather than looping.
- No Wi-Fi password is ever passed to `Serial.print`/`println` anywhere in
  the new code (confirmed by inspection) — only SSID name, IP address, and
  backend URL are logged, none of which are the password.
- Not built/uploaded/monitored by the assistant, per the plan's hardware
  interaction rule — user built, uploaded, and monitored themselves.
- Confirmed end-to-end on real hardware: Wi-Fi connects, `Hardware ID:
  esp32-...` / `Registered with backend.` printed, and independently
  confirmed via backend logs (`POST /api/v1/device/register HTTP/1.1 200
  OK`).
- Along the way: the user initially edited the committed
  `include/secrets.example.h` template with real Wi-Fi credentials
  instead of the gitignored `include/secrets.h`. Caught before any commit
  — moved the real values to `secrets.h`, restored the template to
  placeholders. Nothing was ever pushed. Also caught a `BACKEND_BASE_URL`
  port mismatch (`secrets.h` had `:8000`, but the user's root `.env` maps
  `API_HOST_PORT=8080`) before it caused a connection failure.
- User asked about deleting a registered device; confirmed via
  `backend/app/services/device_service.py` that `POST
  /api/v1/device/register` is a true upsert (idempotent by design, not an
  error) — no firmware/backend change needed for that. The absence of a
  device-delete endpoint was logged as a deferred, non-blocking item in
  `../TODO.md` rather than implemented (backend change, out of scope
  without explicit approval).

## Stage 6 — notes

- **Backend change (explicitly approved by the user)**: `co2` removed
  entirely from the telemetry contract — no CO2 sensor exists in this
  project's hardware, and rather than send a fabricated value to satisfy
  a required field, it was dropped from
  `backend/app/schemas/telemetry.py` (`TelemetryIn`),
  `backend/app/models/telemetry.py` (`Telemetry`),
  `backend/app/services/telemetry_service.py`, a new Alembic migration
  (`backend/alembic/versions/0002_drop_telemetry_co2.py`), and the Python
  simulator (`device-simulator/device_simulator/{simulator,api_client}.py`)
  so it keeps working unchanged (just without generating/sending a fake
  co2 value). Root `README.md` and `esp32-firmware-plan.md`'s contract
  table updated to match. **Requires running the new migration**
  (`docker compose exec api python -m alembic upgrade head`) before
  telemetry will work against an existing database — not run by the
  assistant, since it mutates the user's running database.
- New components: `lib/HeartbeatReporter/` (10s interval, matches
  `HEARTBEAT_INTERVAL_SECONDS` default), `lib/TelemetryReporter/` (5s
  interval matching `TELEMETRY_INTERVAL_SECONDS`, sends the latest valid
  DHT11 reading — nothing sent before the first successful read),
  `lib/CommandProcessor/` (3s poll matching
  `COMMAND_POLL_INTERVAL_SECONDS`). `lib/BackendClient/` extended with
  `sendHeartbeat()`, `sendTelemetry()`, `getNextCommand()`,
  `submitCommandResult()` — mirrors
  `device-simulator/device_simulator/api_client.py`'s `ApiClient` method
  for method. None of these retry with backoff on failure (matching the
  simulator's own behavior exactly: log and resume at the normal
  interval) — only registration (Stage 5) uses backoff, since it alone
  must succeed before anything else can proceed.
- **Command translation — deliberate design choice (explicitly discussed
  with the user)**: `AcTransmitter::sendState(power, targetTemperatureC)`
  added, using `IRElectraAc`'s own `setPower()`/`setTemp()` encoders
  (seeded from the known-good `kStatePowerOn` captured baseline so
  mode/fan stay exactly as physically verified) rather than only
  replaying the 5 exact Stage 2 captures. This lets the firmware honor
  any backend-requested `target_temperature`, not just 22/23°C — the only
  two values physically confirmed against the real AC to date. Other
  values in the 16-30°C range rely on the library's tested encoder,
  **not yet independently hardware-verified by this project** — flagged
  here explicitly, not silently claimed as confirmed.
- **Command validation (a deliberate improvement beyond simulator
  parity — the simulator does none of this)**: `CommandProcessor`
  rejects (marks `failed`, never transmits) a command whose `type` isn't
  `set_state`, whose payload sets neither `power` nor
  `target_temperature`, or whose `target_temperature` falls outside a
  16-30°C sanity bound (a firmware-chosen bound, not a
  protocol-verified limit).
- **Command dedup**: a command id is remembered only after being both
  transmitted *and* successfully acknowledged (200 or 409 — 409 means
  "already resolved," treated as handled, not an error). A repeated
  fetch of the same id is skipped, not re-transmitted. Known limitation,
  explicitly not claimed as fully solved: if the AC transmission
  succeeds but only the acknowledgment POST fails, the next 3s poll will
  retry and could re-transmit. The plan's Stage 7 explicitly revisits
  command dedup as a reliability hardening pass — this is intentionally
  left there rather than over-engineered now.
- Commands are never acknowledged as `completed` before
  `AcTransmitter::sendState()` has actually been called and returned
  `Ok` — a `Failed` transmission result acks as `failed`, not
  `completed`.
- DHT11 (Stage 1) and IR transmit/serial commands (Stages 3-4) are
  unaffected — `HeartbeatReporter`/`TelemetryReporter`/`CommandProcessor`
  are each gated by their own `millis()` interval and never block beyond
  a single HTTP request's timeout (5s).

**Post-implementation addendum (2026-08-26, before hardware testing):**
Two further backend changes, both explicitly requested/approved by the
user before this stage was hardware-tested:
  - `target_temperature` narrowed from `float` to `int` in
    `ClimateState` (`backend/app/schemas/device_state.py`, and the
    simulator's own mirrored model in
    `device-simulator/device_simulator/models.py`). Rationale: no real
    AC hardware supports fractional-degree setpoints, so the API
    contract was narrowed to match reality rather than have the
    firmware silently discard precision nothing downstream could use.
    No DB migration needed — `desired_state`/`reported_state`/`payload`
    are untyped JSONB columns; only the Pydantic validation boundary
    changed. Firmware updated to match: `BackendCommand::targetTemperature`
    (`lib/BackendClient/BackendClient.h`) changed from `float` to `int`,
    parsed via `.as<int>()` instead of `.as<float>()`; `CommandProcessor`'s
    `kMinTempC`/`kMaxTempC` bounds changed from `float` to `int`; and the
    `+0.5f`-before-truncating rounding trick (needed only for fractional
    input) was removed since the contract no longer produces it.
    `device-simulator`'s own `Simulator.target_temperature` field
    likewise changed `float` -> `int` (`current_temperature` stays
    `float` — it's a continuously-converging simulated sensor reading,
    not a setpoint, and is unaffected).
  - Added `DELETE /api/v1/management/devices/{id}` (`backend/app/api/
    management.py`, `backend/app/services/management_service.py`) —
    closes the gap noted in `../TODO.md` during Stage 5. No new
    migration needed; related `device_states`/`telemetry`/`commands`
    rows cascade-delete via existing FK `ondelete="CASCADE"`.
  - Four further backend gaps noticed during this review (no automated
    tests, `CommandCreate.type` not restricted to a `Literal`,
    `CommandResultIn.result` untyped, no pagination on
    `GET /management/devices`) were intentionally **not** implemented —
    logged in `../TODO.md` instead, per explicit user instruction.
  - None of this has been hardware/network tested yet — bundled into
    the same pending verification pass as the rest of Stage 6.
- Not built/uploaded/monitored by the assistant, per the plan's hardware
  interaction rule — user built, uploaded, and tested themselves, after
  wiping the DB (`docker compose down -v` + fresh `up` + re-running both
  migrations) for a clean start on the new schema.
- **Confirmed end-to-end on real hardware, full pass:**
  - Registration: re-confirmed on the fresh DB, same stable
    `esp32-449dd98fcba4` hardware ID as before the wipe (eFuse-MAC
    derivation is unaffected by DB state, as expected).
  - Heartbeat: `GET /management/devices` showed `online: true` with a
    fresh `last_heartbeat_at`.
  - Telemetry: verified via direct DB query — real temperature/humidity
    rows landing every ~5s.
  - Commands: a `{"power": true, "target_temperature": 24}` command was
    pushed via the management API; firmware logged
    `Command: set power=on, target_temperature=24` / `Transmit done.`,
    the physical AC reacted correctly, and the command status flipped to
    `completed` with a matching `result` — all within one ~3s poll
    cycle.
  - Invalid-command rejection (`target_temperature: 99`, outside the
    16-30°C sanity bound) was also tested: firmware logged the
    rejection, did not transmit, and acked `failed`.
  - DHT11 readings and serial AC commands (`u`/`d`/`n`/`o`/`f`) continued
    working unaffected throughout.
  - This is also the first hardware confirmation of the Stage 6
    same-day follow-up changes (`target_temperature` as `int`,
    `co2` removal, `DELETE /devices/{id}`) — all exercised successfully
    as part of this same test pass.
- **Minor post-test cleanup**: removed the `printSerialHelp()` call from
  `setup()` (`src/main.cpp`) — the boot log no longer dumps the serial
  command cheat-sheet on every reset now that backend-driven commands are
  the primary path. Discoverability is preserved: `SerialDiagnostics`'s
  existing fallback still prints the same help text if an unrecognized
  key is typed.
- Debugging note for future reference: on this board (native USB CDC,
  no separate UART bridge chip), a hardware reset via the `EN`/`RST`
  button — not just an upload — also makes the USB peripheral
  disconnect/re-enumerate. `pio device monitor` does not always
  auto-recover from that; closing and reopening the monitor after a
  reset (or opening it *before* resetting) is the reliable way to catch
  full boot-sequence output.

## Simulator parity checklist (living document — update in Stage 6)

| Capability | Simulator | Firmware |
|---|---|---|
| Device identity | Configurable string via env | Stable eFuse-MAC-derived ID. **Confirmed on hardware** (Stage 5). |
| Registration | `POST /device/register`, idempotent, infinite retry @3s | Implemented exactly per contract, bounded backoff instead of infinite tight loop. **Confirmed on hardware** (Stage 5, backend logs verified 200 OK). |
| Auth/tokens | None (by design) | None — matches; nothing to invent. **Confirmed correct per Stage 0 discovery.** |
| Heartbeat/status | `POST /device/heartbeat` every 10s | Implemented, same interval (`lib/HeartbeatReporter/`). **Confirmed on hardware** — `online: true` via the management API. |
| Telemetry payload | `POST /device/telemetry` temp/humidity every 5s | Implemented, same interval, real DHT11 data (`lib/TelemetryReporter/`). `co2` removed from the contract this stage (no sensor exists) — see Stage 6 notes. **Confirmed on hardware** — real rows verified in the DB every ~5s. |
| Command retrieval | `GET /device/commands/next` poll every 3s | Implemented, same interval (`lib/CommandProcessor/`). **Confirmed on hardware.** |
| Command types | `set_state` {power?, target_temperature?: int} | Implemented via `IRElectraAc` semantic encoders, not just the 5 captured commands. **Confirmed on hardware** — a `{power: true, target_temperature: 24}` command correctly moved the real AC; 22/23°C remain the only individually pre-verified exact values, 24°C is now also confirmed working via the semantic encoder path. |
| Command ack | `POST /device/commands/{id}/result` | Implemented; never acks `completed` before transmission succeeds. **Confirmed on hardware** — status flipped to `completed` with a matching `result` within one poll cycle. |
| Command validation | None (simulator accepts any payload) | Firmware validates type/presence/temperature range before transmitting — a deliberate improvement beyond simulator parity, not required by the contract. **Confirmed on hardware** — an out-of-range command (`target_temperature: 99`) was rejected without transmitting and acked `failed`. |
| Command dedup | N/A (simulator has no redelivery concern) | Implemented (transmit-and-ack-based, see Stage 6 notes for the known partial-ack-failure edge case deferred to Stage 7). Exercised during testing (no duplicate transmissions observed); the partial-ack-failure edge case itself was not specifically forced/tested. |
| Retry/timeout | Fixed 5s timeout, no backoff (except reg. loop) | 5s HTTP timeout matches. Registration uses bounded backoff (Stage 5, confirmed). Heartbeat/telemetry/commands intentionally match the simulator's own no-backoff-on-failure behavior — Stage 7 is where the plan revisits this. |
| Heartbeat/online derivation | Server-side, 30s threshold | N/A (server behavior) |

## Open questions for the user

None currently — Stage 0 fully resolved the backend/simulator contract.

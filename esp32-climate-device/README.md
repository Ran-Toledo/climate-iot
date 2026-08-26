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

Implementation proceeds in gated stages. Stages 1-6 (DHT11 sensor, IR
receiver, IR transmitter, combined local architecture, Wi-Fi + backend
registration, telemetry and commands) are all confirmed working end-to-end
on hardware. Stage 7 (reliability hardening + final documentation) is
implemented and awaiting hardware verification. See:

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

## Architecture

```
lib/
  ClimateSensor/       DHT11 read scheduling (Stage 1) — ClimateReadStatus{Ok,Failed}
  AcTransmitter/       IR transmit on GPIO6 (Stage 3, extended Stage 6) — AcCommand enum
                        (5 captured commands) + AcSendResult, plus sendState() for
                        arbitrary backend-driven power/temperature via IRElectraAc's
                        own encoders
  DeviceState/         Firmware's local best-effort model of AC state (Stage 4) —
                        AcDeviceState{power, targetTemperatureC}; no feedback channel,
                        so this only reflects what was last commanded, not confirmed
  SerialDiagnostics/   Manual serial test commands u/d/n/o/f (Stage 3)
  DeviceIdentity/      getHardwareId() — stable ID from the ESP32's eFuse MAC (Stage 5)
  WifiConnection/      Connect/reconnect with jittered bounded exponential backoff
                        (Stage 5, jitter added Stage 7)
  BackendClient/       HTTP client for the full device API contract (Stage 5-6) —
                        register (backoff-until-success), heartbeat/telemetry/
                        commands (fixed-interval, no backoff — matches simulator)
  HeartbeatReporter/   POST /device/heartbeat every 10s (Stage 6)
  TelemetryReporter/   POST /device/telemetry every 5s, real DHT11 data (Stage 6)
  CommandProcessor/    GET /device/commands/next every 3s -> validate -> IR
                        transmit -> POST result (Stage 6, dedup hardened Stage 7)
src/main.cpp            Orchestration only — wires components together in
                        setup()/loop(); no hardware or network logic of its own
```

**Execution flow.** `setup()` runs once: starts serial, initializes the DHT11
and IR transmitter, derives the hardware ID, and kicks off the first Wi-Fi
connection attempt. Nothing blocks waiting for Wi-Fi/registration to
succeed — `loop()` starts immediately and runs cooperatively forever,
calling three functions every iteration:

1. `handleClimateSensor()` — asks `ClimateSensor` if 2s have elapsed since
   the last DHT11 read; if so, reads and prints it (or logs a failure).
2. `handleSerialCommand()` — checks for one buffered serial byte; if it's
   a recognized command key, transmits it immediately.
3. `handleNetworking()` — advances Wi-Fi's connection state machine, then
   (only once connected) either drives registration-until-success, or (once
   registered) drives heartbeat/telemetry/command-polling, each gated by
   its own interval timer so none of them fire more often than intended.

Every component that can block (Wi-Fi connect attempts, every HTTP call)
is bounded to a few seconds at most — a 5s HTTP timeout, capped backoff
between connection attempts — so DHT11 reads and serial AC commands never
stall for more than that, even during a total network/backend outage.
Nothing in this firmware uses `delay()` outside `setup()`'s one-time
1-second pause for the monitor to attach.

**Wi-Fi/backend recovery.** `WifiConnection` and `BackendClient`'s
registration both use jittered exponential backoff (capped at 30s) rather
than a tight retry loop. `backendClient.isRegistered()` never resets once
true, so a transient Wi-Fi drop-and-reconnect resumes heartbeat/telemetry/
commands immediately without re-registering — the device only needs to
register once per boot (registration itself being idempotent means even a
redundant one is harmless).

**State and persistence.** No state is persisted across reboots
(Preferences/NVS unused — see Stage 5 notes on why a registration token
isn't needed). A reboot mid-operation is safe by construction: identity
is re-derived deterministically from the eFuse MAC, registration is
idempotent, and any command that was still `pending` at reboot is simply
picked up fresh on the next poll — there's no local state that could be
inconsistent or need recovery logic.

## Troubleshooting

Issues actually hit during development of this project, in case they
recur:

- **Serial monitor never shows the boot sequence.** By the time
  `pio device monitor` attaches, the firmware has already booted and
  connected — nothing is buffered for you to catch up on. Open the
  monitor *first*, then reset the board (see next point), or use
  `pio run --target upload --target monitor` to minimize the gap.
- **The reset/`EN` button "does nothing."** On this board (native USB
  CDC, no separate UART bridge chip), a hardware reset makes the USB
  peripheral itself disconnect and re-enumerate — the same as during an
  upload. `pio device monitor` doesn't always auto-recover from that; if
  the port seems to hang, close and reopen the monitor.
- **Two different serial ports show up in Device Manager.** If your
  board has both a UART-bridge chip (e.g. CH343, shows as
  `USB-Enhanced-SERIAL ...`) *and* the ESP32-S3's native USB (shows as a
  generic `USB Serial Device`), use the **native USB** port — that's what
  the `ARDUINO_USB_CDC_ON_BOOT=1` build flag routes `Serial` to.
- **DHT11 reads fail 100% of the time.** Check the breadboard's power
  rail isn't split into two disconnected halves (common breadboard
  design) — verify with a multimeter or swap to direct jumpers from the
  ESP32's 3.3V/GND pins as a test.
- **IR commands reach the AC inconsistently.** Check transmitter aim and
  range before suspecting firmware — IR emitters are directional and
  lose reliability fast off-axis or at distance. Point it directly at the
  AC's receiver window (usually near the display/status LED on the front
  panel) from under a meter, then widen from there.
- **Backend unreachable from the ESP32.** `localhost`/`127.0.0.1` in
  `secrets.h` means the ESP32 itself, never your computer — use your
  computer's LAN IP. Also double-check the port: `docker-compose.yml`
  maps `API_HOST_PORT` (from the root `.env`) to the container's port,
  and those aren't always the same value.
- **Edited the wrong secrets file.** `include/secrets.example.h` is the
  *committed template* — never put real credentials there. Real values go
  in `include/secrets.h` (gitignored).

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

## Stage 5 — Wi-Fi and backend registration

Adds Wi-Fi connectivity and backend registration, implemented exactly per
the discovered contract (`POST /api/v1/device/register
{hardware_id, device_type, name}`, no auth). No telemetry/heartbeat/
commands yet — that's Stage 6.

```
lib/
  DeviceIdentity/   getHardwareId() — stable ID from the ESP32's eFuse MAC
  WifiConnection/   connect/reconnect, bounded exponential backoff (1s -> 30s cap)
  BackendClient/    registration POST, bounded exponential backoff (3s -> 30s cap)
```

**Setup required before this will work — one-time, local only:**

1. Copy `include/secrets.example.h` to `include/secrets.h` (already done
   for you this once, with placeholder values — **you must edit it**).
2. Edit `include/secrets.h` with your real Wi-Fi SSID/password and your
   backend's URL.
3. **The ESP32 cannot reach `localhost`** — that means the device itself,
   not your computer. Find your computer's LAN IP (`ipconfig` on
   Windows) and use `http://<that-ip>:8000` as `BACKEND_BASE_URL`. Make
   sure the backend is listening on `0.0.0.0`, not `127.0.0.1`, so it
   accepts connections from other devices on the network — check how
   it's started/configured (e.g. uvicorn's `--host` flag or equivalent)
   if unsure.
4. `include/secrets.h` is gitignored — it will never be committed.

The device's `hardware_id` is derived from the ESP32's eFuse MAC (e.g.
`esp32-a1b2c3d4e5f6`) — stable across reboots, satisfying the backend's
idempotent-registration contract without needing to persist anything.
`device_type` is hardcoded to `"climate_controller"`, matching the
backend's own schema default — not invented.

Both Wi-Fi reconnection and registration retries use bounded exponential
backoff (capped at 30s) rather than a tight loop or the simulator's
naive infinite 3s retry — DHT11 reads and serial AC commands keep working
throughout, since nothing here blocks longer than a single HTTP request's
timeout (5s, matching the simulator's own timeout).

**No Wi-Fi password is ever printed to serial.**

Expected serial output on a successful boot:

```
Hardware ID: esp32-a1b2c3d4e5f6
Wi-Fi connecting to <your-ssid>...
Wi-Fi connected, IP: 192.168.1.123
Registering with backend (http://192.168.1.50:8000)...
Registered with backend.
```

If Wi-Fi or the backend aren't reachable, you'll see periodic retry
messages with growing backoff intervals instead — DHT11/AC commands keep
working normally in the meantime.

### Verification checklist

- [ ] Edited `include/secrets.h` with real Wi-Fi credentials and your
      computer's LAN IP.
- [ ] `pio run` builds without errors.
- [ ] Serial monitor shows a stable `Hardware ID: esp32-...` line.
- [ ] Wi-Fi connects and prints its assigned IP.
- [ ] Registration succeeds (`Registered with backend.`) — confirm the
      device shows up via the backend's device list/API.
- [ ] Re-running registration (e.g. power-cycling the board) doesn't
      error — idempotent re-registration.
- [ ] Temporarily using a wrong Wi-Fi password or unreachable backend URL
      shows retry messages with growing backoff, not a crash or tight
      loop — then revert to correct values.
- [ ] DHT11 readings and serial AC commands (`u`/`d`/`n`/`o`/`f`) still
      work throughout, including while Wi-Fi/registration are retrying.
- [ ] No Wi-Fi password appears anywhere in the serial output.

## Stage 6 — Telemetry and commands

Implements the remaining simulator-parity capabilities: heartbeat,
telemetry, and command polling/execution. Runs after Wi-Fi connects and
registration succeeds.

```
lib/
  HeartbeatReporter/   POST /device/heartbeat every 10s
  TelemetryReporter/   POST /device/telemetry every 5s, using the latest real DHT11 reading
  CommandProcessor/    GET /device/commands/next every 3s -> validate -> IR transmit -> POST result
```

**Backend change made this stage (explicitly approved):** the telemetry
contract's `co2` field was removed entirely —
`{hardware_id, temperature, humidity}` only now. This project's hardware
has no CO2 sensor (only DHT11), and rather than fabricate a fake reading
to satisfy a required field, `co2` was dropped from
`backend/app/schemas/telemetry.py`, the `Telemetry` DB model, a new
Alembic migration (`0002_drop_telemetry_co2.py`), and the Python
simulator (`device-simulator/`). **Run the new migration before testing:**
`docker compose exec api python -m alembic upgrade head`.

**Command translation:** `set_state` commands
(`{power?: bool, target_temperature?: int}`) are validated (type must
be `set_state`; payload must set at least one field; `target_temperature`
must be 16-30°C) then transmitted via `AcTransmitter::sendState()`, which
uses `IRElectraAc`'s own `setPower()`/`setTemp()` encoders rather than
only replaying the 5 exact commands captured in Stage 2. This lets the
firmware honor any requested temperature in range, not just 22/23°C — but
only 22/23°C have been physically confirmed against the real AC; other
values rely on the library's tested encoder rather than firmware-specific
hardware verification. A command is never acknowledged as completed
before the IR transmission has actually been issued.

**Command dedup:** a fetched command's id is compared against the last
one this firmware successfully transmitted *and* acknowledged; a repeat
id is skipped rather than re-transmitted. (Stage 7 hardened this further
— see below.)

Expected serial output once running normally:

```
Command: set power=on, target_temperature=24
```

(Heartbeat/telemetry only print on failure — "quiet" success matches the
simulator's own logging style, avoiding log spam every 5-10s.)

### Verification checklist

- [ ] Ran `docker compose exec api python -m alembic upgrade head` after
      pulling the `co2`-removal migration.
- [ ] `pio run` builds without errors.
- [ ] Heartbeat: device shows as `online: true` via
      `GET /api/v1/management/devices` within ~30s of boot.
- [ ] Telemetry: `GET /api/v1/management/devices/{id}` or direct DB check
      shows real temperature/humidity values arriving every ~5s.
- [ ] Commands: push a command via
      `POST /api/v1/management/devices/{id}/commands` (see root
      `README.md`'s demo walkthrough) with `{"power": true,
      "target_temperature": 24}` and confirm:
      - [ ] The AC actually reacts (power on, temp changes).
      - [ ] Command status flips to `completed` within one poll cycle
            (~3s).
      - [ ] `result` in the command detail reflects what was actually
            sent.
- [ ] Push an invalid command (e.g. `target_temperature: 99`) — via
      direct API call, since the management API's own validation may
      block obviously-bad values first — and confirm the firmware logs a
      rejection and marks it `failed` rather than transmitting.
- [ ] DHT11 reads and serial AC commands (`u`/`d`/`n`/`o`/`f`) keep
      working throughout.
- [ ] Update the parity checklist in
      `../docs/esp32-firmware-status.md` with your test evidence.

## Stage 7 — Reliability and final documentation

The final stage: no new capabilities, just hardening what Stages 1-6
built, plus this file's Architecture/Troubleshooting sections above and
the final parity comparison below.

**What changed:**

- **Jittered backoff.** `WifiConnection` and `BackendClient`'s
  registration backoff both gained +/-20% random jitter on top of the
  existing exponential schedule (still capped at 30s) — avoids many
  devices retrying in perfect lockstep after a shared outage (e.g. the
  Wi-Fi router or backend restarting). Heartbeat/telemetry/command-poll
  intentionally keep their fixed intervals with no backoff at all — that
  already matches the simulator's own behavior and isn't a tight loop
  (bounded by the interval itself), so there was nothing to hardstop-count
  or fix there.
- **Command dedup hardened.** `CommandProcessor` now tracks "transmitted"
  and "acked" as two separate states instead of one. Previously, if the
  IR transmission succeeded but the acknowledgment POST itself failed
  (e.g. a network blip right after transmitting), the next poll would
  re-fetch the same still-pending command and transmit it *again*. Now,
  a re-fetched command that was already transmitted only retries the
  acknowledgment — it is never sent to the AC twice.
- **Verified, not changed** (already correct from earlier stages, audited
  again here): request timeouts (5s on every HTTP call), DHT11
  read-failure handling (Stage 1, unchanged), no Wi-Fi/secrets ever
  logged (confirmed by inspection — `password_` is only ever passed to
  `WiFi.begin()`), no unbounded queues or heap growth (all HTTP
  request/response objects are function-local, released every call), safe
  post-reboot behavior (see Architecture section above — nothing is
  persisted, so there's no stale/inconsistent state to recover from).

### Final ESP32-vs-simulator capability comparison

See `../docs/esp32-firmware-status.md`'s parity checklist for the
capability-by-capability table with hardware-test evidence for each row.
Summarized:

| | Simulator | ESP32 firmware |
|---|---|---|
| Sensing | Fabricated thermal model | Real DHT11 |
| AC control | No real device | Real IR transmission to a real Electra AC |
| Registration retry | Infinite tight loop @3s | Bounded jittered exponential backoff |
| Command validation | None — accepts any payload | Type/presence/range validated before transmitting |
| Command dedup | N/A (no redelivery risk in-process) | Transmit/ack tracked separately (Stage 7) |

**Intentionally unsupported / out of scope** (not gaps to close later —
deliberate decisions, each already discussed and confirmed with the
user during implementation):

- **AC capabilities beyond power/temperature** (fan speed selection,
  swing, turbo, quiet, clean, mode) — the backend's `ClimateState`
  contract only has `power`/`target_temperature`; nothing else to wire up
  without a backend contract change first. Explicitly deferred to a
  future step by the user's own request, to avoid complicating this
  firmware and its test surface further.
- **IR reception in production** — dropped after Stage 3. The backend has
  no endpoint for a device to report AC state detected from a physical
  remote, so a receiver would have nothing to feed.
- **Registration token persistence (Preferences/NVS)** — not implemented
  because the backend has no auth/token concept to persist.
- **Guaranteed exactly-once command delivery** — dedup (hardened this
  stage) eliminates the transmit-twice risk for the failure mode that was
  identified (ack POST fails after a successful transmission). A more
  exotic scenario — the backend receives and processes the ack, but its
  response never reaches the device, *and* the device also reboots before
  its next poll — would still show as unhandled after reboot and retry
  once more; this residual risk is accepted as out of scope rather than
  solved with persistent cross-reboot dedup state, which isn't justified
  by this project's scope.

### Verification checklist

- [ ] `pio run` builds without errors.
- [ ] Force a Wi-Fi outage (e.g. wrong password temporarily, or turn off
      the router briefly) and confirm reconnection still works with
      backoff — the retry intervals won't be identical every time now
      (jitter), which is expected.
- [ ] Regression-check everything from Stages 1-6 still works: DHT11
      reads, serial `u`/`d`/`n`/`o`/`f` commands, registration, heartbeat,
      telemetry, and a real command reaching the AC.
- [ ] If practical: simulate an ack failure (e.g. briefly block/kill the
      backend right after a command is sent but before the ack would
      normally land) and confirm via serial logs that the retry does
      **not** re-transmit to the AC, only retries the acknowledgment.
- [ ] No crash/hang observed across at least one full reboot cycle with a
      command left pending.

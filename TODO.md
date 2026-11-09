# Project TODOs

Deferred work noticed along the way, not currently blocking anything.

- ~~Backend: DELETE endpoint for devices~~ — done
  (`DELETE /api/v1/management/devices/{id}`).
- **Backend: tests cover only the device key and the listeners.**
  `backend/tests/` (run them as the README's "Tests" section shows) checks
  the `X-Device-Key` handling and which routes each listener serves. The
  trickiest logic is still untested: the desired/reported state merge
  (`management_service.create_command` /
  `command_service.apply_command_result`), command dedup semantics, and
  the telemetry window/bucketing in `telemetry_service`.
- ~~Backend: validate commands~~ — done. `CommandCreate` takes only
  `type: "set_state"` and a strict, closed payload (boolean `power`, whole
  `target_temperature` 16–30, at least one field, no unknown keys), and
  `CommandResultIn.result` is validated the same way, so a bad request is a
  422 instead of a queued command or a 500 (`backend/app/schemas/command.py`,
  tests in `backend/tests/test_command_validation.py`).
- **Backend: no pagination on `GET /management/devices`**
  (`backend/app/api/management.py`). Fine at current scale (one real
  device), but worth revisiting if the device list grows.
- ~~Infra: switch the database from PostgreSQL to SQLite~~ — done (see
  `docs/sqlite-migration-plan.md`).
- ~~Infra: Tailscale support for the frontend and API~~ — done. The
  frontend is served over tailnet HTTPS by `tailscale serve` on the host
  (port 9443), and the frontend proxies the API on its own origin (see the
  README's "Network access"). A possible follow-up is a
  `tailscale` sidecar container, so the app gets its own tailnet name
  instead of depending on the host's `tailscale serve` config.
- ~~Frontend: UI improvements~~ — done: redesign with light/dark tokens,
  device cards with sparklines, rename (app-side `display_name`), typed
  target temperature, graph ranges/target line/min-max markers, PWA
  icons and manifest, served by nginx.
- ~~Firmware: find the backend without a hard-coded IP~~ — done:
  mDNS, then the last good address in NVS, then `BACKEND_BASE_URL`
  (`lib/BackendResolver`).
- ~~Backend: device API reachable by anything on the LAN~~ — done: the
  LAN port serves only `/api/v1/device/*`, behind a shared
  `X-Device-Key`; the full API is internal-only.
- **Security: the device key travels over plain HTTP.** Anyone who can
  sniff the Wi-Fi can read it. TLS on the device port (or per-device
  keys that can be revoked) would close that; fine for a home LAN today.
- **Firmware: a backend lookup blocks the loop for up to 2 s** (the mDNS
  timeout), at boot and at most every 30 s while the backend is
  unreachable. Sensor reads and IR commands wait during it. An
  asynchronous mDNS query would avoid that.
- **Firmware: no automated tests** — only manual serial checks and the
  `test-wrong-host*` PlatformIO envs for the address fallbacks.

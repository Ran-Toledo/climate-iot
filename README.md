# Climate IoT — Backend MVP

A minimal backend for a smart-home climate controller: a FastAPI service, a
Postgres database, and a Python device simulator that stands in for a future
ESP32 controller. The simulator talks to the backend over plain HTTP — the
same contract the real device will use later, so swapping the simulator for
firmware requires no API changes.

## Architecture

```
Device Simulator --HTTP--> FastAPI Backend --> PostgreSQL
```

The core idea is that a device has two independent states:

- **Desired state** — what the user asked for (set via the management API).
- **Reported state** — what the device says it's actually doing (set when
  the device acknowledges a command).

They are allowed to disagree — e.g. right after you push a command, the
desired state changes instantly but the reported state only catches up once
the device (or simulator) executes it. Sensor readings (temperature,
humidity) are tracked separately as time-series `telemetry`, since a
device can *report* a new setpoint instantly while the *room* takes time to
actually get there.

## Prerequisites

- Docker Desktop / Docker Engine with Compose v2 (`docker compose version`)

## Quick start

```
cp .env.example .env
docker compose up --build -d
docker compose ps
```

Three services (`db`, `api`, `frontend`) should show as running (`db` as
`healthy`). The API's host port is controlled by `API_HOST_PORT` in `.env`
(default `8000`), and Postgres's host port by `POSTGRES_PORT` (default
`5432`) — if either port is already taken on your machine (e.g. by another
local Postgres install), change it in `.env` and re-run
`docker compose up -d`; no source changes needed.

The Python device simulator is opt-in (it's not something a real deployment
would run) — start it with:

```
docker compose --profile simulator up --build -d
```

which brings up `device-simulator` alongside the other three. Leave the
`--profile simulator` flag off and it stays stopped; to make it always start
without typing the flag, add `COMPOSE_PROFILES=simulator` to `.env` instead.

**Apply the database schema** (only needed once, or after a
`docker compose down -v`):

```
docker compose exec api python -m alembic upgrade head
```

Until this runs, the API is up but any endpoint touching the database
returns a 500 — if the `device-simulator` is running, it'll just log
registration failures and keep retrying every 3s, which is expected, not a
bug.

Check the API is up:

```
curl http://localhost:8080/health
```

## Explore the API

FastAPI generates interactive docs automatically:

- Swagger UI (try requests from the browser): http://localhost:8080/docs
- ReDoc (read-only reference): http://localhost:8080/redoc

## Frontend

A small React SPA (device list, device detail with desired/reported state
and controls, a temperature/humidity graph) lives in `frontend/` and is
already part of `docker compose up` above as the `frontend` service —
open http://localhost:5173 (or your `FRONTEND_HOST_PORT`) once it's up.

The one gotcha worth knowing: unlike every other setting in this project,
the frontend's API URL (`VITE_API_BASE_URL`) is baked into its static
bundle at **image build time**, not read at container start — a browser
runs the SPA outside the Docker network, so it needs a `localhost`-style
URL rather than the `http://api:8000` the device-simulator uses internally.
If you change `API_HOST_PORT` (or `VITE_API_BASE_URL` itself), the frontend
needs an explicit rebuild to pick it up:

```
docker compose up --build -d frontend
```

For local frontend development without rebuilding a container on every
change, run it outside Docker instead — see `frontend/README.md`.

**Testing from a phone, tablet, or another machine on your network**:
`localhost` in `VITE_API_BASE_URL` and `CORS_ALLOWED_ORIGINS` means "the
same machine the browser is on" — from another device it resolves to
*that device itself*, not this one, which is why it looks like the API is
unreachable rather than like a config problem. Use this machine's LAN IP
instead of `localhost` in both:

1. Find it (Windows: `ipconfig`; macOS/Linux: `ifconfig` or `ip addr`) —
   look for the adapter your other device actually shares a network with
   (e.g. Wi-Fi), not a VPN/virtual-machine/WSL adapter; a home LAN address
   usually looks like `192.168.x.x`.
2. In `.env`: `VITE_API_BASE_URL=http://<lan-ip>:${API_HOST_PORT}` and add
   `http://<lan-ip>:${FRONTEND_HOST_PORT}` to `CORS_ALLOWED_ORIGINS`
   (comma-separated — keep the `localhost` entries too, for browsing from
   this machine).
3. `docker compose up --build -d` (the frontend needs the rebuild from
   step above; the API just needs the new `CORS_ALLOWED_ORIGINS` picked up,
   which the same command handles).
4. Open `http://<lan-ip>:5173` on the other device — not `localhost`.

Same idea for `npm run dev` (see `frontend/README.md`): its `VITE_API_BASE_URL`
lives in `frontend/.env`, and the dev server itself already binds every
network interface (not just `localhost`), so step 4 works there too once
1-2 are done for that `.env` file.

**On a [Tailscale](https://tailscale.com) network** (recommended over the
LAN IP if you have it — works from anywhere your other device has
Tailscale connected, not just the same Wi-Fi, and the address doesn't
change when you switch networks): same three settings, just a Tailscale
address instead of a LAN IP.

1. Run `tailscale status` on this machine — it lists this device's
   MagicDNS name (e.g. `your-pc.your-tailnet.ts.net`) and Tailscale IP
   (`100.x.y.z`). Prefer the name — it's stable even if the IP ever
   changes, which a LAN IP can too but for a different reason (DHCP).
2. Same as LAN steps 2-3 above, but with the Tailscale address:
   `VITE_API_BASE_URL=http://your-pc.your-tailnet.ts.net:${API_HOST_PORT}`,
   same origin added to `CORS_ALLOWED_ORIGINS`, then
   `docker compose up --build -d`. All three origin styles (`localhost`,
   LAN, Tailscale) can coexist in `CORS_ALLOWED_ORIGINS` — comma-separated,
   nothing needs to be removed. Unlike the LAN IP, a hostname also needs
   Vite's own server to allow it (`server`/`preview.allowedHosts` in
   `frontend/vite.config.ts` — it 403s any Host header it doesn't
   recognize, as anti-DNS-rebinding protection; bare IPs are always
   allowed, hostnames aren't). Already handled here (`.ts.net` is
   allowlisted), so nothing to do for MagicDNS names — worth knowing only
   if you ever front this with a different custom hostname.
3. Open `http://your-pc.your-tailnet.ts.net:5173` on the other device
   (with Tailscale connected there too). If the name doesn't resolve,
   confirm MagicDNS is on for the tailnet and "Accept DNS" is on for that
   device (Tailscale settings) — or use the Tailscale IP instead, which
   needs neither; just add *that* as its own origin in
   `CORS_ALLOWED_ORIGINS` too (`http://100.x.y.z:5173`) — it's a different
   origin from the hostname as far as the browser and CORS are concerned,
   even though it's the same machine, so it doesn't inherit the name's
   entry. `VITE_API_BASE_URL` itself can stay on the hostname regardless of
   which address you load the frontend *from* — it only controls where the
   already-loaded page calls the API, which is independent of that.

## Demo walkthrough

This reproduces the full desired/reported state lifecycle from a clean
start. It needs the device simulator, which is opt-in (see Quick start) —
start it first:

```
docker compose --profile simulator up --build -d
```

It auto-registers itself and starts sending heartbeats and telemetry within
a few seconds.

**1. Confirm the simulated device registered itself**

```
curl -s http://localhost:8080/api/v1/management/devices | python -m json.tool
```

You should see one device, `sim-bedroom-001`, `online: true`. The list view
doesn't include state — check the detail view for that:

```
curl -s http://localhost:8080/api/v1/management/devices/1 | python -m json.tool
```

`device_state` starts with empty `desired_state`/`reported_state` — the
backend only knows what it's explicitly been told, even though the
simulator internally has its own default settings.

**2. Push a command via the management API**

```
curl -s -X POST http://localhost:8080/api/v1/management/devices/1/commands \
  -H "Content-Type: application/json" \
  -d '{"payload":{"power":true,"target_temperature":22}}' | python -m json.tool
```

This returns immediately with `status: "pending"`. Note the command id in
the response (e.g. `"id": 1`).

**3. Verify the command was executed**

```
curl -s http://localhost:8080/api/v1/management/commands/1 | python -m json.tool
```

Within one simulator poll cycle (a few seconds, `COMMAND_POLL_INTERVAL_SECONDS`
in `.env`) the status flips to `"completed"` with a `result` echoing the new
state.

**4. Confirm desired and reported state now agree**

```
curl -s http://localhost:8080/api/v1/management/devices/1 | python -m json.tool
```

`desired_state` and `reported_state` should both show
`{"power": true, "target_temperature": 22}`.

**5. Watch the room actually converge (not just the setting)**

```
docker compose logs -f device-simulator
```

You'll see `telemetry sent: {...}` lines every few seconds with the
simulated room temperature stepping toward 22 — this happens gradually,
separately from the instant setting acknowledgment in step 3. Press
Ctrl+C to stop following logs.

## API reference

**Device API** (called by the simulator / future ESP32 firmware; trusts
`hardware_id` in the request body, no auth):

| Method | Path | Body |
|---|---|---|
| POST | `/api/v1/device/register` | `{hardware_id, device_type?, name?}` |
| POST | `/api/v1/device/heartbeat` | `{hardware_id}` |
| POST | `/api/v1/device/telemetry` | `{hardware_id, temperature, humidity}` |
| GET | `/api/v1/device/commands/next?hardware_id=...` | — |
| POST | `/api/v1/device/commands/{id}/result` | `{status: completed\|failed, result?}` |

**Management API** (called by an operator / future web frontend):

| Method | Path | Body |
|---|---|---|
| GET | `/api/v1/management/devices` | — (each device includes `device_state` and `latest_telemetry`) |
| GET | `/api/v1/management/devices/{id}` | — (same shape as a list item) |
| DELETE | `/api/v1/management/devices/{id}` | — |
| POST | `/api/v1/management/devices/{id}/commands` | `{type?, payload: {power?, target_temperature?: int}}` |
| GET | `/api/v1/management/commands/{id}` | — |
| GET | `/api/v1/management/devices/{id}/telemetry?since=&until=&limit=` | — readings ordered oldest-first; if more than `limit` rows exist in the window, the *most recent* ones are kept (not the earliest); `since`/`until` are ISO 8601 timestamps (default: last 24h to now), `limit` defaults to 500 and is capped at 1000 |

## Environment variables

All configuration is env-var driven (see `.env`); nothing is hardcoded in
source. Key ones:

| Variable | Purpose |
|---|---|
| `API_HOST_PORT` | Host port the API is exposed on (container always listens on `APP_PORT`) |
| `POSTGRES_PORT` | Host port Postgres is exposed on, for tools like pgAdmin/psql (container always listens on 5432 internally) |
| `DATABASE_URL` | asyncpg connection string used by the API and Alembic |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API (e.g. the frontend's dev server); empty disables CORS entirely |
| `FRONTEND_HOST_PORT` | Host port the frontend is exposed on (container always listens on `FRONTEND_PORT`). Baked into the frontend's build alongside `API_HOST_PORT` — see "Frontend" above |
| `DEVICE_HARDWARE_ID` / `DEVICE_NAME` | Identity the simulator registers as |
| `HEARTBEAT_INTERVAL_SECONDS` / `TELEMETRY_INTERVAL_SECONDS` / `COMMAND_POLL_INTERVAL_SECONDS` | Simulator loop cadence |
| `AMBIENT_TEMPERATURE` / `STARTING_TEMPERATURE` / `TEMPERATURE_STEP` | Simulator's thermal model |

## Stopping / resetting

```
docker compose down        # stop containers, keep data
docker compose down -v     # stop containers and wipe the Postgres volume
```

## Out of scope (by design)

This is an interview-scope MVP, not production software. Deliberately not
implemented: authentication, MQTT/Redis/message brokers, automation
rules/schedules, command retry/timeout handling, multi-command batching, and
server-side telemetry aggregation (min/avg/max) — `GET .../telemetry` returns
raw readings; a consumer computes aggregates itself.

## Known simplifications

- No `Users` table — devices have no owner; a single implicit tenant is
  assumed.
- `Command.payload` and `DeviceState.desired_state`/`reported_state` are
  JSONB, validated at the Pydantic layer rather than by DB columns/constraints.
- `GET /commands/next` does not mark a command as "in flight" — if the
  simulator polls twice before acknowledging, the same command could be
  refetched (a 409 guard prevents a *second acknowledgment* from corrupting
  state, but doesn't prevent redelivery itself).
- The initial Alembic migration is hand-authored rather than autogenerated.
- `GET .../devices` fetches each device's `device_state` and
  `latest_telemetry` with two separate queries per device (no batched/windowed
  query) — fine at current scale (one real device), same tradeoff as the
  existing no-pagination simplification.
- `since`/`until` on `GET .../telemetry` are parsed as-is by Pydantic; a
  naive (no-offset) timestamp is not normalized to UTC before the query.
  Always pass an offset (e.g. `...Z` or `+00:00`) to avoid surprises.
- The frontend's Docker image serves its production build via `vite
  preview` rather than a dedicated static-file server (nginx, etc.) — not
  meant for real production traffic, but consistent with the rest of this
  MVP's "simple over optimized" posture, and it reuses the same toolchain
  already in `frontend/package.json` instead of adding a new one.

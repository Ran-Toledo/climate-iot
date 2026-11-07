# Climate IoT — Backend MVP

A minimal backend for a smart-home climate controller: a FastAPI service, a
SQLite database, and a Python device simulator that stands in for a future
ESP32 controller. The simulator talks to the backend over plain HTTP — the
same contract the real device will use later, so swapping the simulator for
firmware requires no API changes.

## Architecture

```
Browser --HTTPS (tailscale serve)--> frontend proxy --> api :8001 (full API) --+
ESP32 --HTTP :8080 + X-Device-Key -------------------> api :8000 (device API) --+--> SQLite file
Device Simulator (inside Docker) + X-Device-Key -----> api :8000 (device API) --+
```

The `api` container is one process with two listeners
(`backend/app/serve.py`). The **device listener** (`APP_PORT`, published on
the LAN as `API_HOST_PORT`) serves only `/api/v1/device/*`: anything else
is a 404, with no docs or OpenAPI schema. The **internal listener**
(`INTERNAL_API_PORT`, default 8001) serves the full API and isn't
published; only the frontend's proxy reaches it. Every device route also
needs the shared `X-Device-Key` header (see "Device key" below).

The database is a SQLite file inside the `api` container's `/data` volume,
so nothing else can reach it. See "Network access" below for who can reach
what.

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

Two services (`api`, `frontend`) should show as running. The frontend is
published on
`127.0.0.1:${FRONTEND_HOST_PORT}` (default `5173`) and the device API on
`${API_HOST_PORT}` (default `8000`) on every interface. Set
`DEVICE_API_KEY` in `.env` first (see "Device key"), or every device
request gets a 503.
If a port is already taken on your machine, change it in `.env` and re-run
`docker compose up -d`; no source changes needed.

The Python device simulator is opt-in (it's not something a real deployment
would run) — start it with:

```
docker compose --profile simulator up --build -d
```

which brings up `device-simulator` alongside the other two. Leave the
`--profile simulator` flag off and it stays stopped; to make it always start
without typing the flag, add `COMPOSE_PROFILES=simulator` to `.env` instead.

The database schema is applied automatically: the `api` container runs
`alembic upgrade head` on every start (a no-op when already current), so a
fresh volume needs no manual step.

Check the API is up (through the frontend's proxy, the only way in from
this machine):

```
curl http://localhost:5173/health
```

## Device key

Every `/api/v1/device/*` request must carry the header
`X-Device-Key: <DEVICE_API_KEY>`. The api compares it in constant time
(`hmac.compare_digest`) and answers **401** if it's missing or wrong. If
`DEVICE_API_KEY` isn't set, the api logs a warning at startup and answers
**503** to every device request (it fails closed). The key and the header
are never logged.

1. Generate a key:
   ```
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
2. Put it in `.env` as `DEVICE_API_KEY=...`. The simulator reads the same
   variable, through `docker-compose.yml`.
3. Put the same value in the ESP32's `include/secrets.h`:
   `#define DEVICE_API_KEY "..."`. The firmware won't build without it.
   Then rebuild and flash.
4. `docker compose up -d` to restart the api with the key.

The key is a shared secret on a plain-HTTP LAN: it keeps other devices on
the network off the device API, but anyone who can sniff the Wi-Fi
traffic can read it.

## Explore the API

FastAPI generates interactive docs automatically. The frontend proxies
them along with the API:

- Swagger UI (try requests from the browser): http://localhost:5173/docs
- ReDoc (read-only reference): http://localhost:5173/redoc

## Frontend

A small React SPA (device list, device detail with desired/reported state
and controls, a temperature/humidity graph) lives in `frontend/` and is
already part of `docker compose up` above as the `frontend` service —
open http://localhost:5173 (or your `FRONTEND_HOST_PORT`) once it's up.

The frontend container is nginx: it serves the built SPA and proxies
`/api`, `/health`, `/docs`, `/redoc` and `/openapi.json` to the `api`
container (see `frontend/nginx/default.conf.template`; `npm run dev` does
the same through `frontend/vite.config.ts`). The SPA calls the API with
relative URLs (`/api/...`), so there's no API URL to configure and no CORS
involved, and one image works from any address.

For local frontend development without rebuilding a container on every
change, run it outside Docker instead — see `frontend/README.md`.

## Network access

| Who | Address | Reaches |
|---|---|---|
| This machine | `http://localhost:5173` | Frontend, with the full API (and `/docs`) behind its proxy |
| Other tailnet devices | `https://<this-pc>.<tailnet>.ts.net:9443` | The same, over HTTPS via `tailscale serve` |
| ESP32 and anything else on the LAN or tailnet | `http://<lan-ip>:${API_HOST_PORT}` | The device API only, with `X-Device-Key` |
| Device simulator | `http://api:8000` | The device API only, inside the Docker network, with `X-Device-Key` |
| Frontend proxy | `http://api:8001` | The full API, inside the Docker network |

In particular:

- **The frontend is published on `127.0.0.1` only**, so it isn't reachable
  over Wi-Fi/LAN or on the plain-HTTP tailnet IP. Use the HTTPS address.
- **Only the device API is published on every interface**, so the ESP32
  can reach it over Wi-Fi. The management API and docs are reachable only
  through the frontend. In `esp32-climate-device/include/secrets.h`, set
  `BACKEND_BASE_URL` to `http://<this machine's LAN IP>:<API_HOST_PORT>`
  and `BACKEND_HOSTNAME` to this machine's name (lowercase, no
  `.local`). The ESP32 looks the backend up in this order: mDNS
  (`<BACKEND_HOSTNAME>.local`, accepted only on its own subnet), then the
  last mDNS address it saved in flash (NVS), then the host in
  `BACKEND_BASE_URL`. The port always comes from `BACKEND_BASE_URL`. It
  resolves at boot and again after 3 consecutive connection failures;
  serial lines starting `[backend]` show which source it used. Also set
  `DEVICE_API_KEY` there (see "Device key").
- **The database is a SQLite file** in the `api` container's `/data`
  volume, with no port at all. For a SQL shell, use
  `docker compose exec api python -m sqlite3 /data/climate_iot.db`.

**HTTPS over [Tailscale](https://tailscale.com).** `tailscale serve` runs on
the host, outside Docker, and forwards a tailnet-only HTTPS port to the
frontend's localhost port. Set it up once (it survives reboots):

```
tailscale serve --bg --https=9443 http://127.0.0.1:5173
```

Use your `FRONTEND_HOST_PORT` in place of `5173`, and any HTTPS port not
already in use (`tailscale serve status` lists them). Then open
`https://<this-pc>.<tailnet>.ts.net:9443` on a device with Tailscale
connected. Tailscale issues the certificate itself, but the tailnet needs
MagicDNS and HTTPS certificates turned on in the admin console. To remove
it: `tailscale serve --https=9443 off`.

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
curl -s http://localhost:5173/api/v1/management/devices | python -m json.tool
```

You should see one device, `sim-bedroom-001`, `online: true`. The list view
doesn't include state — check the detail view for that:

```
curl -s http://localhost:5173/api/v1/management/devices/1 | python -m json.tool
```

`device_state` starts with empty `desired_state`/`reported_state` — the
backend only knows what it's explicitly been told, even though the
simulator internally has its own default settings.

**2. Push a command via the management API**

```
curl -s -X POST http://localhost:5173/api/v1/management/devices/1/commands \
  -H "Content-Type: application/json" \
  -d '{"payload":{"power":true,"target_temperature":22}}' | python -m json.tool
```

This returns immediately with `status: "pending"`. Note the command id in
the response (e.g. `"id": 1`).

**3. Verify the command was executed**

```
curl -s http://localhost:5173/api/v1/management/commands/1 | python -m json.tool
```

Within one simulator poll cycle (a few seconds, `COMMAND_POLL_INTERVAL_SECONDS`
in `.env`) the status flips to `"completed"` with a `result` echoing the new
state.

**4. Confirm desired and reported state now agree**

```
curl -s http://localhost:5173/api/v1/management/devices/1 | python -m json.tool
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

**Device API** (called by the ESP32 and the simulator; every request needs
`X-Device-Key`, then `hardware_id` in the request is trusted). Served on
both listeners:

| Method | Path | Body |
|---|---|---|
| POST | `/api/v1/device/register` | `{hardware_id, device_type?, name?}` |
| POST | `/api/v1/device/heartbeat` | `{hardware_id}` |
| POST | `/api/v1/device/telemetry` | `{hardware_id, temperature, humidity}` |
| GET | `/api/v1/device/commands/next?hardware_id=...` | — |
| POST | `/api/v1/device/commands/{id}/result` | `{status: completed\|failed, result?}` |

**Management API** (called by the frontend; internal listener only, no
auth):

| Method | Path | Body |
|---|---|---|
| GET | `/api/v1/management/devices` | — (each device includes `device_state` and `latest_telemetry`) |
| GET | `/api/v1/management/devices/{id}` | — (same shape as a list item) |
| PATCH | `/api/v1/management/devices/{id}` | `{display_name: string \| null}` — the name the app shows; the device's own `name` (set at registration) is left alone. `null` or blank clears it |
| DELETE | `/api/v1/management/devices/{id}` | — |
| POST | `/api/v1/management/devices/{id}/commands` | `{type?, payload: {power?, target_temperature?: int}}` |
| GET | `/api/v1/management/commands/{id}` | — |
| GET | `/api/v1/management/devices/{id}/telemetry?since=&until=&limit=` | — readings ordered oldest-first; if more than `limit` rows exist in the window, the *most recent* ones are kept (not the earliest); `since`/`until` are ISO 8601 timestamps (default: last 24h to now), `limit` defaults to 500 and is capped at 1000 |

## Environment variables

All configuration is env-var driven (see `.env`); nothing is hardcoded in
source. Key ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLAlchemy URL used by the API and Alembic (`sqlite+aiosqlite:////data/climate_iot.db`) |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API cross-origin. Normally empty, since browsers reach the API through the frontend's proxy on the same origin |
| `FRONTEND_HOST_PORT` | Port the frontend is published on, on `127.0.0.1` only (container always listens on `FRONTEND_PORT`) |
| `API_HOST_PORT` | Host port the device listener is published on, on every interface (the container listens on `APP_PORT`) |
| `INTERNAL_API_PORT` | Port of the full-API listener inside the Docker network (default `8001`, not published; must differ from `APP_PORT`) |
| `DEVICE_API_KEY` | Shared secret for `X-Device-Key`; used by the api, the simulator and (via `secrets.h`) the ESP32. Unset = device API answers 503 |
| `DEVICE_HARDWARE_ID` / `DEVICE_NAME` | Identity the simulator registers as |
| `HEARTBEAT_INTERVAL_SECONDS` / `TELEMETRY_INTERVAL_SECONDS` / `COMMAND_POLL_INTERVAL_SECONDS` | Simulator loop cadence |
| `AMBIENT_TEMPERATURE` / `STARTING_TEMPERATURE` / `TEMPERATURE_STEP` | Simulator's thermal model |

## Tests

The backend tests (device key, and which routes each listener serves) run
in a throwaway container, so nothing needs to be installed locally:

```
docker run --rm -v "$PWD/backend:/src:ro" -w /src python:3.13-slim   sh -c "pip install -q -r requirements-dev.txt && python -m pytest -q -p no:cacheprovider"
```

## Stopping / resetting

```
docker compose down        # stop containers, keep data
docker compose down -v     # stop containers and wipe the database volume
```

## Out of scope (by design)

This is an interview-scope MVP, not production software. Deliberately not
implemented: user authentication (the device API has only a shared
device key), MQTT/Redis/message brokers, automation
rules/schedules, command retry/timeout handling, multi-command batching, and
server-side telemetry aggregation (min/avg/max) — `GET .../telemetry` returns
raw readings; a consumer computes aggregates itself.

## Known simplifications

- No `Users` table — devices have no owner; a single implicit tenant is
  assumed.
- `Command.payload` and `DeviceState.desired_state`/`reported_state` are
  JSON (text in SQLite), validated at the Pydantic layer rather than by DB
  columns/constraints.
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

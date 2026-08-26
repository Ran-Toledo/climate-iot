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

All three services (`db`, `api`, `device-simulator`) should show as running
(`db` as `healthy`). The API's host port is controlled by `API_HOST_PORT` in
`.env` (default `8000`), and Postgres's host port by `POSTGRES_PORT`
(default `5432`) — if either port is already taken on your machine (e.g. by
another local Postgres install), change it in `.env` and re-run
`docker compose up -d`; no source changes needed.

**Apply the database schema** (only needed once, or after a
`docker compose down -v`):

```
docker compose exec api python -m alembic upgrade head
```

Until this runs, the API is up but any endpoint touching the database
returns a 500 — the `device-simulator` will just log registration failures
and keep retrying every 3s, which is expected, not a bug.

Check the API is up:

```
curl http://localhost:8080/health
```

## Explore the API

FastAPI generates interactive docs automatically:

- Swagger UI (try requests from the browser): http://localhost:8080/docs
- ReDoc (read-only reference): http://localhost:8080/redoc

## Demo walkthrough

This reproduces the full desired/reported state lifecycle from a clean
start. The simulator auto-registers itself and starts sending heartbeats and
telemetry within a few seconds of `docker compose up`.

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
| GET | `/api/v1/management/devices` | — |
| GET | `/api/v1/management/devices/{id}` | — |
| DELETE | `/api/v1/management/devices/{id}` | — |
| POST | `/api/v1/management/devices/{id}/commands` | `{type?, payload: {power?, target_temperature?: int}}` |
| GET | `/api/v1/management/commands/{id}` | — |

## Environment variables

All configuration is env-var driven (see `.env`); nothing is hardcoded in
source. Key ones:

| Variable | Purpose |
|---|---|
| `API_HOST_PORT` | Host port the API is exposed on (container always listens on `APP_PORT`) |
| `POSTGRES_PORT` | Host port Postgres is exposed on, for tools like pgAdmin/psql (container always listens on 5432 internally) |
| `DATABASE_URL` | asyncpg connection string used by the API and Alembic |
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
rules/schedules, command retry/timeout handling, multi-command batching,
telemetry history/aggregation endpoints, and any frontend.

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

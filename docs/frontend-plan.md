# Climate IoT Frontend — Implementation Plan

Reference plan for building `frontend/`, a small React/TypeScript SPA against
the existing Management API. It renders the device list, device detail
(desired vs. reported state, controls), and a temperature/humidity graph with
a customizable time span. Mockups: see the "Climate IoT Mobile Mockups"
design canvas from this project's chat history (device list, device detail,
graph screens, mobile 390×844).

Built in stages; each stops for a quick look in the browser before the next
one begins — UI work isn't done until it's been seen running, not just typed.
See `frontend-status.md` in this directory for current progress against this
plan.

## Requirements this plan targets

**Functional** (see full list from the original requirements pass):
- Device list: name, hardware_id, device_type, online/offline, latest
  reading, quick power/target-temp glance.
- Device detail: desired vs. reported state side by side, power toggle,
  target-temperature stepper, last-command status, delete (confirmed).
- Graph: preset time ranges (1H/24H/7D/30D), separate temperature and
  humidity charts (never one dual-axis chart — different units), min/avg/max,
  and dashed rendering across any span with no recorded telemetry.

**Non-functional**: no auth, no WebSockets (polling only), clear
API-unreachable state, ships as a `docker compose` service alongside
`db`/`api`/`device-simulator`, no test suite (matches the backend's current
state — not introducing an inconsistent standard for the newest piece).

## Confirmed backend contract

All under `/api/v1/management` (no auth, single implicit tenant):

| Method | Path | Notes |
|---|---|---|
| GET | `/devices` | Each item includes `online`, `latest_telemetry: {temperature, humidity, recorded_at} \| null`. |
| GET | `/devices/{id}` | Adds `device_state: {desired_state, reported_state, updated_at} \| null`. |
| DELETE | `/devices/{id}` | Cascades commands/state/telemetry. |
| POST | `/devices/{id}/commands` | Body `{type?, payload: {power?, target_temperature?: int}}`. Returns the command with `status: "pending"`. |
| GET | `/commands/{id}` | Poll until `status` is `completed`/`failed`. |
| GET | `/devices/{id}/telemetry?since=&until=&limit=` | **New** (added alongside this plan). Raw readings, oldest-first. `since`/`until` are ISO 8601 with an explicit offset; omitted defaults to the last 24h. `limit` defaults to 500, capped at 1000. No server-side aggregation — the frontend computes min/avg/max and fills the axis; gaps in the returned series (a span with no rows) are exactly where the chart should render dashed. |

Time-range chips map to client-computed `since` values (`now - 1h/24h/7d/30d`);
`until` is omitted (defaults to now). "Custom" is a stretch goal — punt to a
follow-up unless asked for explicitly, since it needs a date-picker UI beyond
the mockup's chip row.

## Tech stack

React + Vite + TypeScript, TanStack Query (polling via `refetchInterval` for
device list / command status), Tailwind CSS, React Router (two routes: list,
detail — graph is a sub-view of detail). Types hand-mirrored off the Pydantic
schemas above so payload shapes can't silently drift. New `frontend/`
directory with its own `Dockerfile` and a `frontend` service in
`docker-compose.yml`, host port via a new `.env` var (`FRONTEND_HOST_PORT`)
following the existing `API_HOST_PORT`/`POSTGRES_PORT` pattern.

## Stage 1 — Scaffold and data layer

- `npm create vite@latest frontend -- --template react-ts`; add Tailwind,
  React Router, TanStack Query.
- Typed API client (`frontend/src/api/`): one function per endpoint above,
  request/response types matching the Pydantic schemas exactly (including
  `latest_telemetry`/`device_state` as nullable).
- `QueryClientProvider` + router shell; `.env`-driven API base URL (Vite
  `import.meta.env`), so the container's URL isn't hardcoded.
- Done when: an empty shell app builds and runs (`npm run dev`) and a
  hand-written smoke fetch to `/api/v1/management/devices` logs real data in
  the console.

## Stage 2 — Device list

- Route `/`: `useQuery(['devices'], listDevices, { refetchInterval: 5000 })`.
- Card per device: online dot (`online`), name, hardware_id/device_type,
  power + target temperature from `device_state` (now present on the list
  response, same as `latest_telemetry`).
- Empty state (`0` devices) and API-unreachable state (query `isError`).
- Done when: list renders against the real backend, including the
  offline/no-data case, seen in a browser.

## Stage 3 — Device detail

- Route `/devices/:id`: `useQuery(['device', id], () => getDevice(id))`.
- Desired/reported panel — render "both in agreement" vs a syncing
  indicator by comparing the two state objects field-by-field.
- Controls: power toggle and target-temperature stepper both call
  `POST /devices/{id}/commands`; on success, invalidate the device query and
  start polling `GET /commands/{id}` (`refetchInterval` until terminal
  status) to reflect completion.
- Delete: confirm dialog, `DELETE /devices/{id}`, navigate back to `/` on
  success.
- Done when: toggling power / changing target temp against the real backend
  (or the simulator) visibly moves through pending → completed and the
  reported state catches up, observed in a browser.

## Stage 4 — Graph

- Sub-view under device detail (`/devices/:id/graph` or a tab).
- Time-range chip row computing `since`; `useQuery(['telemetry', id, since], …)`.
- Two stacked single-series charts (temperature, humidity) — never combined
  on one axis. Split the returned series into contiguous runs by inspecting
  the gap between consecutive `recorded_at` values against the expected
  sampling interval; render the connecting segment between runs dashed (as
  in the mockup), solid within a run. Compute min/avg/max client-side.
- Hover/focus crosshair + tooltip per the dataviz interaction spec (this was
  a frozen illustration in the static mockup — here it's live).
- Done when: a real gap in telemetry (e.g. after `docker compose stop
  device-simulator` for a few minutes, then restart) renders visibly dashed,
  observed in a browser.

## Stage 5 — Polish

- Loading skeletons/spinners consistent across views.
- Shared error banner/toast for network failures.
- Responsive check at the mobile width the mockups were built at (390px)
  plus a quick look at a wider viewport, since the mockups only covered
  mobile.

## Stage 6 — Docker packaging

- `frontend/Dockerfile` (multi-stage: `vite build` → static served via
  `nginx` or `vite preview`, whichever stays simpler to keep the "minimal"
  ethos — decide at this stage, not before).
- Add `frontend` service + `FRONTEND_HOST_PORT` to `docker-compose.yml` and
  `.env.example`, matching the existing var-naming convention.
- Update the root README's Quick Start with the frontend URL, same style as
  the existing Swagger/ReDoc links.

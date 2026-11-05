# Project TODOs

Deferred work noticed along the way, not currently blocking anything.

- ~~Backend: DELETE endpoint for devices~~ — done
  (`DELETE /api/v1/management/devices/{id}`).
- **Backend: no automated tests anywhere in the repo.** Confirmed in
  Stage 0 discovery for the ESP32 firmware project — the biggest real
  gap for anything beyond interview-scope. Worth at least a handful of
  tests around the desired/reported state merge logic
  (`management_service.create_command` /
  `command_service.apply_command_result`) and command dedup semantics,
  since those are the trickiest parts to get right by inspection alone.
- **Backend: `CommandCreate.type` is a plain `str`, not
  `Literal["set_state"]`** (`backend/app/schemas/command.py`). The
  backend will currently store a command with any `type` value even
  though only `set_state` is ever handled — the ESP32 firmware
  defensively rejects unknown types itself, but the backend doesn't stop
  a bogus type from being created in the first place.
- **Backend: `CommandResultIn.result` is an untyped `dict`**
  (`backend/app/schemas/command.py`). Unlike the command payload, the
  result isn't validated against `ClimateState` shape, so a malformed
  result could get stored silently.
- **Backend: no pagination on `GET /management/devices`**
  (`backend/app/api/management.py`). Fine at current scale (one real
  device), but worth revisiting if the device list grows.
- **Infra: switch the database from PostgreSQL to SQLite.** The backend
  currently depends on Postgres-specific pieces that would need to change:
  `JSONB` columns (`backend/app/models/command.py`,
  `backend/app/models/device_state.py`), the native `ENUM` type and
  `JSONB` in the initial Alembic migration
  (`backend/alembic/versions/0001_initial_schema.py`), and the `asyncpg`
  driver (`backend/requirements.txt` → `aiosqlite`). The `db` service in
  `docker-compose.yml` would go away in favour of a volume-mounted SQLite
  file for the `api` service, and `DATABASE_URL` / `POSTGRES_*` in
  `.env.example` would need updating.
- ~~Infra: Tailscale support for the frontend and API~~ — done. The
  frontend is served over tailnet HTTPS by `tailscale serve` on the host
  (port 9443), and the frontend proxies the API on its own origin (see the
  README's "Network access"). A possible follow-up is a
  `tailscale` sidecar container, so the app gets its own tailnet name
  instead of depending on the host's `tailscale serve` config.
- **Frontend: UI improvements.** General polish pass on the web app:
  layout and styling, mobile usability, and clearer loading/error states.

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
- **Infra: built-in Tailscale support for the frontend and API.** Today
  Tailscale works only by hand: the README walks through finding the
  host's MagicDNS name, then setting `VITE_API_BASE_URL` and
  `CORS_ALLOWED_ORIGINS` to match. Proper support would give the app its
  own tailnet identity, for example a `tailscale` sidecar container in
  `docker-compose.yml` with `tailscale serve` in front of the frontend and
  API. The setup would then stop depending on the host's name and ports,
  and could serve over HTTPS.

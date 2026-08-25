# Project TODOs

Deferred work noticed along the way, not currently blocking anything.

- **Backend: DELETE endpoint for devices** (`backend/app/api/management.py`,
  `backend/app/services/management_service.py`). There's currently no way
  to remove a single registered device via the API — only wiping the
  entire DB (`docker compose down -v`) resets device state. Not urgent:
  `POST /api/v1/device/register` is idempotent (upserts by `hardware_id`),
  so the ESP32 firmware re-registering on every boot is expected,
  harmless behavior, not something this endpoint is needed to fix.

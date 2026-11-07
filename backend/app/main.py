"""Two ASGI apps over the same routers and database (see app/serve.py):

- `app`: everything (management API, device API, /health, /docs). Served
  on the internal port, which only the frontend's nginx reaches.
- `device_app`: only /api/v1/device/*. Served on the port published to the
  LAN for the ESP32; anything else is a 404, and there are no docs or
  OpenAPI schema to read.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.device import router as device_router
from app.api.management import router as management_router

app = FastAPI(title="Climate IoT API")

cors_origins = [origin.strip() for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if origin.strip()]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(device_router)
app.include_router(management_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


device_app = FastAPI(
    title="Climate IoT device API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
device_app.include_router(device_router)

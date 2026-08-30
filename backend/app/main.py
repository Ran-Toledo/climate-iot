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

from fastapi import FastAPI

from app.api.device import router as device_router
from app.api.management import router as management_router

app = FastAPI(title="Climate IoT API")

app.include_router(device_router)
app.include_router(management_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

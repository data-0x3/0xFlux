"""0xFLUX backend entrypoint. Developed by 0x3."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import (
    routes_capture, routes_discovery, routes_history, routes_monitor, routes_scan,
    routes_system, routes_tools,
)
from .core.config import settings
from .core.logging import get_logger
from .db.session import init_db
from .services.capture import capture
from .services.monitor import latency

log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    await init_db()
    latency.start()
    log.info("%s v%s ready on http://%s:%s", settings.app_name, settings.version,
             settings.host, settings.port)
    yield
    await latency.stop()
    if capture.running:
        capture.stop()
    log.info("Shutting down.")


app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for mod in (routes_system, routes_tools, routes_scan, routes_discovery,
            routes_monitor, routes_history, routes_capture):
    app.include_router(mod.router, prefix="/api")


def run() -> None:
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port, reload=False, log_level="info")


if __name__ == "__main__":
    run()

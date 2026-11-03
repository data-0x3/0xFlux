"""Network monitor: live stats over WebSocket, connections, latency history."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..services.monitor import latency, monitor

router = APIRouter(prefix="/monitor", tags=["monitor"])


@router.get("/connections")
async def connections() -> dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, monitor.connections)


@router.get("/latency")
async def latency_history() -> dict:
    return {"history": list(latency.history), "summary": latency.summary()}


@router.get("/snapshot")
async def snapshot() -> dict:
    monitor.sample()
    await asyncio.sleep(0.5)
    return monitor.sample()


@router.websocket("/ws")
async def monitor_ws(websocket: WebSocket):
    await websocket.accept()
    # Each socket keeps its own baseline so several pages can watch at once.
    from ..services.monitor import NetworkMonitor
    local = NetworkMonitor()
    local.sample()
    try:
        while True:
            await asyncio.sleep(1.0)
            await websocket.send_json({"type": "sample", **local.sample()})
    except (WebSocketDisconnect, asyncio.CancelledError, RuntimeError):
        pass

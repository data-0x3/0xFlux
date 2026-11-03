"""Traffic analyzer endpoints: interfaces, start/stop, status, live stream."""
from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from ..services.capture import CaptureError, capture

router = APIRouter(prefix="/capture", tags=["capture"])


class CaptureStart(BaseModel):
    iface: Optional[str] = None
    bpf: Optional[str] = Field(default=None, max_length=256)


@router.get("/interfaces")
async def interfaces() -> dict:
    return {"interfaces": capture.interfaces()}


@router.post("/start")
async def start(req: CaptureStart) -> dict:
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(None, capture.start, req.iface, (req.bpf or "").strip() or None)
    except CaptureError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/stop")
async def stop() -> dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, capture.stop)


@router.post("/clear")
async def clear() -> dict:
    capture.clear()
    return capture.stats()


@router.get("/status")
async def status() -> dict:
    return capture.stats()


@router.websocket("/ws")
async def stream(websocket: WebSocket):
    await websocket.accept()
    try:
        cursor = int(websocket.query_params.get("since", "0"))
    except ValueError:
        cursor = 0
    session = capture.session
    first = True
    try:
        while True:
            if capture.session != session:
                session, cursor = capture.session, 0
                await websocket.send_json({"type": "reset"})
            rows = capture.since(cursor, limit=1000 if first else 500)
            first = False
            if rows:
                cursor = rows[-1]["id"]
            await websocket.send_json({"type": "batch", "packets": rows, "stats": capture.stats()})
            await asyncio.sleep(0.5)
    except (WebSocketDisconnect, asyncio.CancelledError, RuntimeError):
        pass

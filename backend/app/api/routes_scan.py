"""Scan lifecycle endpoints + live progress WebSocket."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ..core.safety import TargetError
from ..db.models import Scan
from ..db.session import SessionLocal
from ..engine.base import ScanConfig
from ..engine.selector import chosen_engine
from ..services.scan_manager import scan_manager
from .schemas import ScanRequest, ScanStarted

router = APIRouter(prefix="/scan", tags=["scan"])


@router.post("", response_model=ScanStarted)
async def start_scan(req: ScanRequest):
    config = ScanConfig(
        target=req.target, authorized=req.authorized, profile=req.profile,
        ports=req.ports, detect_service=req.detect_service, detect_os=req.detect_os,
        udp=req.udp, timeout=req.timeout,
    )
    try:
        scan_id = await scan_manager.start(config)
    except TargetError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ScanStarted(scan_id=scan_id, engine=chosen_engine())


@router.post("/{scan_id}/cancel")
async def cancel_scan(scan_id: int) -> dict:
    return {"ok": scan_manager.cancel(scan_id), "scan_id": scan_id}


@router.websocket("/{scan_id}/ws")
async def scan_ws(websocket: WebSocket, scan_id: int):
    await websocket.accept()
    live = scan_manager.get_live(scan_id)
    if not live:
        # The scan may have finished before the socket connected: report its final state.
        async with SessionLocal() as s:
            scan = await s.get(Scan, scan_id)
        if scan is None:
            await websocket.send_json({"type": "error", "message": "Scan not found."})
        elif scan.status == "error":
            await websocket.send_json({"type": "error", "message": scan.error or "Scan failed."})
        else:
            await websocket.send_json({"type": "complete", "status": scan.status, "scan_id": scan_id})
        await websocket.close()
        return
    try:
        while True:
            event = await asyncio.wait_for(live.queue.get(), timeout=3600)
            if event.get("type") == "_eof":
                break
            await websocket.send_json(event)
    except (WebSocketDisconnect, asyncio.TimeoutError, RuntimeError):
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass

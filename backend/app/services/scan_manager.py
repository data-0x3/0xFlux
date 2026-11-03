"""Orchestrates scans: runs the hybrid engine, persists to SQLite, exposes
live progress over an async queue, and supports cancellation.
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any, Optional

from ..core.logging import get_logger
from ..core.safety import validate_target
from ..db.models import Host, Port, Scan
from ..db.session import SessionLocal
from ..engine.base import ScanConfig
from ..engine.selector import run_scan

log = get_logger("scan_manager")


@dataclass
class LiveScan:
    id: int
    cancel: asyncio.Event = field(default_factory=asyncio.Event)
    queue: "asyncio.Queue[dict]" = field(default_factory=asyncio.Queue)
    task: Optional[asyncio.Task] = None


class ScanManager:
    def __init__(self) -> None:
        self._live: dict[int, LiveScan] = {}

    async def start(self, config: ScanConfig) -> int:
        resolved = validate_target(config.target, authorized=config.authorized)

        async with SessionLocal() as s:
            scan = Scan(
                target=config.target, profile=config.profile.value,
                engine="pending", status="running",
                options_json=json.dumps({
                    "ports": config.ports, "detect_service": config.detect_service,
                    "detect_os": config.detect_os, "udp": config.udp,
                }),
            )
            s.add(scan)
            await s.commit()
            await s.refresh(scan)
            scan_id = scan.id

        live = LiveScan(id=scan_id)
        self._live[scan_id] = live
        live.task = asyncio.create_task(self._execute(live, resolved, config))
        return scan_id

    async def _execute(self, live: LiveScan, resolved, config: ScanConfig) -> None:
        async def progress(phase: str, done: int, total: int, msg: str) -> None:
            await live.queue.put({"type": "progress", "phase": phase,
                                  "done": done, "total": total, "message": msg})

        try:
            result = await run_scan(resolved, config, progress, live.cancel)
            await self._persist(live.id, result, config)
            status = "cancelled" if result.cancelled else "completed"
            await live.queue.put({"type": "complete", "status": status,
                                  "scan_id": live.id, "engine": result.engine,
                                  "duration_s": round(result.duration_s, 2),
                                  "hosts_up": sum(1 for h in result.hosts if h.state == "up"),
                                  "ports_open": sum(len(h.ports) for h in result.hosts),
                                  "notes": result.notes})
        except Exception as exc:
            log.exception("scan %s failed", live.id)
            await self._mark_error(live.id, str(exc))
            await live.queue.put({"type": "error", "scan_id": live.id, "message": str(exc)})
        finally:
            await live.queue.put({"type": "_eof"})
            self._live.pop(live.id, None)

    async def _persist(self, scan_id: int, result, config: ScanConfig) -> None:
        import datetime as dt
        async with SessionLocal() as s:
            scan = await s.get(Scan, scan_id)
            if scan is None:
                return
            scan.engine = result.engine
            scan.status = "cancelled" if result.cancelled else "completed"
            scan.duration_s = result.duration_s
            scan.finished_at = dt.datetime.now(dt.timezone.utc)
            kept = [h for h in result.hosts if h.state == "up" or h.ports]
            scan.hosts_up = sum(1 for h in kept if h.state == "up")
            scan.ports_open = sum(len([p for p in h.ports if p.state == "open"]) for h in kept)
            scan.notes = "\n".join(result.notes) if result.notes else None
            for h in kept:
                host = Host(scan_id=scan_id, ip=h.ip, hostname=h.hostname, mac=h.mac,
                            vendor=h.vendor, state=h.state, os_guess=h.os_guess,
                            latency_ms=h.latency_ms)
                for p in h.ports:
                    host.ports.append(Port(number=p.number, protocol=p.protocol,
                                           state=p.state, service=p.service, version=p.version))
                s.add(host)
            await s.commit()

    async def _mark_error(self, scan_id: int, error: str) -> None:
        async with SessionLocal() as s:
            scan = await s.get(Scan, scan_id)
            if scan:
                scan.status = "error"
                scan.error = error
                await s.commit()

    def cancel(self, scan_id: int) -> bool:
        live = self._live.get(scan_id)
        if not live:
            return False
        live.cancel.set()
        return True

    def get_live(self, scan_id: int) -> Optional[LiveScan]:
        return self._live.get(scan_id)


scan_manager = ScanManager()

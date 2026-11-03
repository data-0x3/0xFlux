"""Real-time network monitoring from actual system counters (psutil).

No random numbers, no fake activity. Speeds are deltas between real interface
counters; latency is a real TCP handshake time to a configurable target.
"""
from __future__ import annotations

import asyncio
import contextlib
import socket
import time
from collections import deque
from typing import Any, Optional

import psutil

from ..core.config import settings
from ..core.logging import get_logger

log = get_logger("monitor")


def _ipv4(addrs: list) -> Optional[str]:
    return next((a.address for a in addrs if a.family == socket.AF_INET), None)


def _mac(addrs: list) -> Optional[str]:
    # psutil.AF_LINK is a plain int on Windows (-1), an enum elsewhere: compare by value.
    return next((a.address for a in addrs if a.family == psutil.AF_LINK), None)


class NetworkMonitor:
    """Samples psutil counters and derives per-second rates."""

    def __init__(self) -> None:
        self._last: Optional[dict[str, Any]] = None

    def interfaces(self) -> list[dict[str, Any]]:
        stats = psutil.net_if_stats()
        addrs = psutil.net_if_addrs()
        out = []
        for name, st in stats.items():
            a = addrs.get(name, [])
            out.append({
                "name": name,
                "is_up": st.isup,
                "speed_mbps": st.speed or None,
                "mtu": st.mtu,
                "ipv4": _ipv4(a),
                "mac": _mac(a),
            })
        return out

    def sample(self) -> dict[str, Any]:
        now = time.perf_counter()
        c = psutil.net_io_counters()
        current = {"t": now, "sent": c.bytes_sent, "recv": c.bytes_recv}
        up_bps: Optional[float] = None
        down_bps: Optional[float] = None
        if self._last:
            dt = max(now - self._last["t"], 1e-6)
            up_bps = max((current["sent"] - self._last["sent"]) / dt, 0.0)
            down_bps = max((current["recv"] - self._last["recv"]) / dt, 0.0)
        self._last = current
        return {
            "upload_bps": up_bps,        # None on the very first sample (unknown, not zero)
            "download_bps": down_bps,
            "total_sent": c.bytes_sent,
            "total_recv": c.bytes_recv,
            "packets_sent": c.packets_sent,
            "packets_recv": c.packets_recv,
            "errors_in": c.errin,
            "errors_out": c.errout,
            "drops_in": c.dropin,
            "drops_out": c.dropout,
            "latency_ms": latency.latest(),
            "timestamp": time.time(),
        }

    def connections(self) -> dict[str, Any]:
        try:
            conns = psutil.net_connections(kind="inet")
        except (psutil.AccessDenied, PermissionError):
            return {"ok": False, "error": "Elevated privileges required to enumerate connections."}
        by_status: dict[str, int] = {}
        rows = []
        for c in conns:
            by_status[c.status] = by_status.get(c.status, 0) + 1
            if c.raddr:
                name = None
                if c.pid:
                    with contextlib.suppress(Exception):
                        name = psutil.Process(c.pid).name()
                rows.append({
                    "laddr": f"{c.laddr.ip}:{c.laddr.port}" if c.laddr else None,
                    "raddr": f"{c.raddr.ip}:{c.raddr.port}",
                    "status": c.status,
                    "pid": c.pid,
                    "process": name,
                })
        return {"ok": True, "by_status": by_status, "established": rows[:200], "total": len(conns)}


class LatencyProbe:
    """Measures TCP handshake latency to ``settings.latency_target`` every 2 s."""

    def __init__(self) -> None:
        self.history: deque[dict] = deque(maxlen=300)
        self._task: Optional[asyncio.Task] = None

    @staticmethod
    def target() -> tuple[str, int]:
        host, sep, port = settings.latency_target.rpartition(":")
        if not sep or not port.isdigit():
            return settings.latency_target, 443
        return host, int(port)

    async def measure(self) -> Optional[float]:
        host, port = self.target()
        start = time.perf_counter()
        try:
            _, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=2.0)
            elapsed = (time.perf_counter() - start) * 1000
            writer.close()
            return elapsed
        except ConnectionRefusedError:
            return (time.perf_counter() - start) * 1000  # the RST still proves a round trip
        except (asyncio.TimeoutError, OSError):
            return None

    async def _loop(self) -> None:
        while True:
            ms = await self.measure()
            self.history.append({"t": time.time(), "ms": round(ms, 2) if ms is not None else None})
            await asyncio.sleep(2.0)

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    def latest(self) -> Optional[float]:
        return self.history[-1]["ms"] if self.history else None

    def summary(self) -> dict[str, Any]:
        vals = [p["ms"] for p in self.history if p["ms"] is not None]
        n = len(self.history)
        return {
            "target": settings.latency_target,
            "samples": n,
            "avg_ms": round(sum(vals) / len(vals), 2) if vals else None,
            "min_ms": min(vals) if vals else None,
            "max_ms": max(vals) if vals else None,
            "loss_pct": round((n - len(vals)) / n * 100, 1) if n else None,
        }


monitor = NetworkMonitor()
latency = LatencyProbe()

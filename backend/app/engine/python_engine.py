"""Pure-Python scan engine — no external binaries required.

Asynchronous TCP-connect host discovery and port scanning, reverse-DNS
hostnames, and passive banner hints. It is the fallback in the hybrid design
(and the default on hosts without nmap).
"""
from __future__ import annotations

import asyncio
import socket
import time
from typing import Optional

from ..core.logging import get_logger
from ..core.safety import ResolvedTarget, expand_hosts
from .base import HostResult, PortResult, ProgressCb, ScanConfig, ScanResult
from .services import COMMON_SERVICES, grab_banner_hint

log = get_logger("engine.python")

DISCOVERY_PORTS = [80, 443, 22, 445, 139, 3389, 53, 8080]


def _ip_key(ip: str) -> tuple:
    try:
        return tuple(int(o) for o in ip.split("."))
    except ValueError:
        return (999, ip)


async def _probe_port(ip: str, port: int, timeout: float, banner: bool) -> Optional[PortResult]:
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(ip, port), timeout=timeout)
    except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
        return None
    service = COMMON_SERVICES.get(port, {}).get("name")
    version = await grab_banner_hint(reader, writer, port) if banner else None
    try:
        writer.close()
        await asyncio.wait_for(writer.wait_closed(), timeout=0.5)
    except Exception:
        pass
    return PortResult(number=port, state="open", service=service, version=version)


async def _host_is_up(ip: str, timeout: float) -> tuple[bool, Optional[float]]:
    """TCP-connect liveness: an RST (refused) still proves the host answered."""
    start = time.perf_counter()

    async def attempt(port: int) -> bool:
        try:
            _, w = await asyncio.wait_for(asyncio.open_connection(ip, port), timeout=timeout)
            w.close()
            return True
        except ConnectionRefusedError:
            return True
        except (asyncio.TimeoutError, OSError):
            return False

    tasks = [asyncio.create_task(attempt(p)) for p in DISCOVERY_PORTS]
    try:
        for fut in asyncio.as_completed(tasks):
            if await fut:
                return True, (time.perf_counter() - start) * 1000
        return False, None
    finally:
        for t in tasks:
            t.cancel()


def _reverse_dns(ip: str) -> Optional[str]:
    try:
        return socket.gethostbyaddr(ip)[0]
    except (socket.herror, socket.gaierror, OSError):
        return None


async def scan(
    resolved: ResolvedTarget,
    config: ScanConfig,
    progress: ProgressCb,
    cancel: asyncio.Event,
) -> ScanResult:
    start = time.perf_counter()
    targets = expand_hosts(resolved)
    single = len(targets) == 1
    ports = config.resolved_ports()
    banner = config.detect_service or config.profile.value in ("service_detection", "full_port_audit")
    found: dict[str, HostResult] = {}
    notes: list[str] = []
    if config.udp:
        notes.append("UDP scanning requires nmap with administrator rights — skipped by the Python engine.")

    def _result(cancelled: bool = False) -> ScanResult:
        hosts = sorted(found.values(), key=lambda h: _ip_key(h.ip))
        return ScanResult("python", hosts, time.perf_counter() - start, cancelled=cancelled, notes=notes)

    # ---- phase 1: host discovery (parallel) ----
    await progress("discovery", 0, len(targets), f"Probing {len(targets)} host(s)…")
    sem_d = asyncio.Semaphore(64)
    done = 0

    async def discover(ip: str) -> None:
        nonlocal done
        async with sem_d:
            if cancel.is_set():
                return
            up, lat = await _host_is_up(ip, min(config.timeout, 0.8))
        # A single explicit target is always port-scanned (like nmap -Pn):
        # many hosts drop discovery probes but still expose services.
        if up or single:
            found[ip] = HostResult(ip=ip, state="up" if up else "unknown", latency_ms=lat)
        done += 1
        await progress("discovery", done, len(targets), f"{ip}: {'up' if up else 'no response'}")

    await asyncio.gather(*[discover(ip) for ip in targets])
    if cancel.is_set():
        return _result(cancelled=True)

    loop = asyncio.get_running_loop()
    names = await asyncio.gather(*[loop.run_in_executor(None, _reverse_dns, ip) for ip in found])
    for h, name in zip(found.values(), names):
        h.hostname = name

    # ---- phase 2: port scan ----
    total = len(found) * len(ports)
    done = 0
    sem = asyncio.Semaphore(config.concurrency)
    await progress("portscan", 0, total, f"Scanning {len(ports)} port(s) on {len(found)} host(s)…")

    for host in list(found.values()):
        async def one(port: int, h: HostResult = host) -> None:
            nonlocal done
            async with sem:
                if cancel.is_set():
                    return
                pr = await _probe_port(h.ip, port, config.timeout, banner)
                if pr:
                    h.ports.append(pr)
            done += 1
            if done % 25 == 0 or done == total:
                await progress("portscan", done, total, f"{done}/{total} probes")

        await asyncio.gather(*[one(p) for p in ports])
        host.ports.sort(key=lambda p: p.number)
        if host.state == "unknown" and host.ports:
            host.state = "up"
        if cancel.is_set():
            return _result(cancelled=True)

    # drop single targets that never answered anything
    for ip in [ip for ip, h in found.items() if h.state == "unknown"]:
        found[ip].state = "down"
    await progress("done", total, total, "Scan complete.")
    return _result()

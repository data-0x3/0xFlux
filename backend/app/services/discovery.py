"""Local network discovery: route table + ARP cache + liveness sweep.

The gateway is read from the OS routing table and the subnet from the
interface that actually carries the default route — nothing is guessed.
Devices persist with first/last-seen timestamps; open ports come from the
most recent scan that covered each device.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import ipaddress
import platform
import re
import socket
from typing import Any, Optional

import psutil
from sqlalchemy import select

from ..core.logging import get_logger
from ..core.proc import IS_WINDOWS, run
from ..db.models import Device, Host, Scan
from ..db.session import SessionLocal
from .oui import lookup_vendor

log = get_logger("discovery")

MAX_SWEEP = 1024


async def default_gateway() -> Optional[str]:
    system = platform.system()
    if IS_WINDOWS:
        _, out = await run(["route", "print", "-4"], timeout=10)
        m = re.search(r"^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d{1,3}(?:\.\d{1,3}){3})", out, re.M)
    elif system == "Darwin":
        _, out = await run(["route", "-n", "get", "default"], timeout=10)
        m = re.search(r"gateway:\s*(\d{1,3}(?:\.\d{1,3}){3})", out)
    else:
        _, out = await run(["ip", "-4", "route", "show", "default"], timeout=10)
        m = re.search(r"default via (\d{1,3}(?:\.\d{1,3}){3})", out)
    return m.group(1) if m else None


def local_address() -> Optional[str]:
    """IP of the interface carrying the default route (no packet is sent)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("192.0.2.1", 9))  # TEST-NET-1: route lookup only
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


def local_subnet() -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (subnet, local_ip, interface_name) for the active interface."""
    ip = local_address()
    if not ip:
        return None, None, None
    for name, addrs in psutil.net_if_addrs().items():
        for a in addrs:
            if a.family == socket.AF_INET and a.address == ip and a.netmask:
                net = ipaddress.ip_network(f"{ip}/{a.netmask}", strict=False)
                if net.num_addresses > MAX_SWEEP:  # big LANs: sweep the local /24
                    net = ipaddress.ip_network(f"{ip}/24", strict=False)
                return str(net), ip, name
    return str(ipaddress.ip_network(f"{ip}/24", strict=False)), ip, None


async def read_arp() -> dict[str, str]:
    """Return {ip: mac} from the OS ARP/neighbour cache."""
    cmd = ["arp", "-a"] if IS_WINDOWS else ["arp", "-an"]
    rc, out = await run(cmd, timeout=10)
    if rc == 127 and not IS_WINDOWS:
        rc, out = await run(["ip", "neigh"], timeout=10)
    table: dict[str, str] = {}
    for ip, mac in re.findall(
        r"(\d{1,3}(?:\.\d{1,3}){3})\D[^\n]*?([0-9a-fA-F]{2}(?:[:-][0-9a-fA-F]{2}){5})", out
    ):
        mac = mac.replace("-", ":").lower()
        if mac in ("ff:ff:ff:ff:ff:ff", "00:00:00:00:00:00") or mac.startswith("01:00:5e"):
            continue
        table[ip] = mac
    return table


async def _tcp_ping(ip: str, timeout: float = 0.6) -> bool:
    async def attempt(port: int) -> bool:
        try:
            _, w = await asyncio.wait_for(asyncio.open_connection(ip, port), timeout=timeout)
            w.close()
            return True
        except ConnectionRefusedError:
            return True
        except (asyncio.TimeoutError, OSError):
            return False

    tasks = [asyncio.create_task(attempt(p)) for p in (80, 443, 445, 22, 139, 53)]
    try:
        for fut in asyncio.as_completed(tasks):
            if await fut:
                return True
        return False
    finally:
        for t in tasks:
            t.cancel()


def _reverse(ip: str) -> Optional[str]:
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return None


def _ip_key(ip: str) -> tuple[int, ...]:
    return tuple(int(o) for o in ip.split("."))


async def _ports_for(s, ip: str) -> list[int]:
    stmt = (select(Host).join(Scan).where(Host.ip == ip, Scan.status == "completed")
            .order_by(Scan.started_at.desc()).limit(1))
    host = (await s.execute(stmt)).scalars().first()
    return sorted(p.number for p in host.ports if p.state == "open") if host else []


async def discover(subnet: Optional[str] = None) -> dict[str, Any]:
    auto_subnet, local_ip, iface = local_subnet()
    subnet = subnet or auto_subnet
    if not subnet:
        return {"ok": False, "error": "Could not determine the local subnet (no active IPv4 interface).",
                "devices": []}
    try:
        net = ipaddress.ip_network(subnet, strict=False)
    except ValueError as exc:
        return {"ok": False, "error": f"Invalid subnet: {exc}", "devices": []}
    if not (net.is_private or net.is_link_local):
        return {"ok": False, "error": "Discovery is limited to private (local) networks.", "devices": []}
    if net.num_addresses > MAX_SWEEP:
        return {"ok": False, "error": f"Subnet too large for a sweep (max {MAX_SWEEP} addresses).",
                "devices": []}

    gateway = await default_gateway()
    hosts = {str(h) for h in net.hosts()}
    sem = asyncio.Semaphore(128)
    live: set[str] = set()

    async def probe(ip: str) -> None:
        async with sem:
            if await _tcp_ping(ip):
                live.add(ip)

    await asyncio.gather(*[probe(ip) for ip in hosts])
    arp = await read_arp()  # the sweep has just warmed the cache
    seen = sorted((live | set(arp)) & hosts | ({local_ip} if local_ip in hosts else set()), key=_ip_key)

    loop = asyncio.get_running_loop()
    names = await asyncio.gather(*[loop.run_in_executor(None, _reverse, ip) for ip in seen])
    now = dt.datetime.now(dt.timezone.utc)

    async with SessionLocal() as s:
        for ip, hostname in zip(seen, names):
            mac = arp.get(ip)
            existing = (await s.execute(select(Device).where(Device.ip == ip))).scalar_one_or_none()
            if existing:
                existing.last_seen = now
                existing.mac = mac or existing.mac
                existing.hostname = hostname or existing.hostname
                existing.vendor = lookup_vendor(mac) or existing.vendor
                existing.is_gateway = ip == gateway
            else:
                s.add(Device(ip=ip, mac=mac, hostname=hostname, vendor=lookup_vendor(mac),
                             first_seen=now, last_seen=now, is_gateway=ip == gateway))
        await s.commit()

    inv = await inventory(online=set(seen), local_ip=local_ip)
    return {"ok": True, "subnet": str(net), "gateway": gateway, "local_ip": local_ip,
            "interface": iface, "count": len(seen), "devices": inv["devices"]}


async def inventory(online: Optional[set[str]] = None, local_ip: Optional[str] = None) -> dict[str, Any]:
    async with SessionLocal() as s:
        rows = (await s.execute(select(Device))).scalars().all()
        rows = sorted(rows, key=lambda d: _ip_key(d.ip) if d.ip.count(".") == 3 else (999,))
        devices = []
        for d in rows:
            if online is None:
                status = "unknown"          # not swept in this session
            else:
                status = "up" if d.ip in online else "not seen"
            devices.append({
                "ip": d.ip, "mac": d.mac, "hostname": d.hostname, "vendor": d.vendor,
                "is_gateway": d.is_gateway, "is_self": d.ip == local_ip, "status": status,
                "first_seen": d.first_seen.isoformat(), "last_seen": d.last_seen.isoformat(),
                "open_ports": await _ports_for(s, d.ip),
            })
        return {"devices": devices}


async def forget_all() -> None:
    from sqlalchemy import delete
    async with SessionLocal() as s:
        await s.execute(delete(Device))
        await s.commit()

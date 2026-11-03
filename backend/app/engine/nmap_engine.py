"""Nmap-backed scan engine (used when the nmap binary is present).

Delegates to nmap for service/version detection, OS fingerprinting and UDP,
parsing its structured output. Nmap runs in a worker thread so it never blocks
the event loop. Privileged options (-O, -sU, -sS) are only requested when the
process actually has administrator rights.
"""
from __future__ import annotations

import asyncio
import shutil
import time

from ..core.capabilities import detect
from ..core.logging import get_logger
from ..core.safety import ResolvedTarget
from .base import (UDP_PORTS, HostResult, PortResult, Profile, ProgressCb, ScanConfig,
                   ScanResult)

log = get_logger("engine.nmap")


def nmap_available() -> bool:
    return shutil.which("nmap") is not None


def build_args(config: ScanConfig, is_admin: bool) -> tuple[str, list[str]]:
    notes: list[str] = []
    if config.profile == Profile.QUICK and not config.ports:
        parts = ["-T4", "-F"]
    else:
        parts = ["-T3"]
        tcp = ",".join(str(p) for p in config.resolved_ports())
        if config.udp and is_admin:
            parts += ["-sS", "-sU", f"-p T:{tcp},U:{','.join(map(str, UDP_PORTS))}"]
        else:
            if config.udp:
                notes.append("UDP scan skipped: it requires administrator rights.")
            parts.append(f"-p {tcp}")
    if config.detect_service or config.profile in (Profile.SERVICE, Profile.FULL):
        parts.append("-sV")
    if config.detect_os:
        if is_admin:
            parts.append("-O")
        else:
            notes.append("OS fingerprinting skipped: it requires administrator rights.")
    if config.profile == Profile.FULL:
        parts.append("--max-rate 300")  # conservative rate limit for the full audit
    return " ".join(parts), notes


def _run_nmap_sync(target: str, args: str) -> dict:
    import nmap  # python-nmap
    scanner = nmap.PortScanner()
    scanner.scan(hosts=target, arguments=args)
    out: dict = {"hosts": []}
    for ip in scanner.all_hosts():
        node = scanner[ip]
        addresses = node.get("addresses", {})
        mac = addresses.get("mac")
        host = {
            "ip": ip,
            "hostname": node.hostname() or None,
            "state": node.state(),
            "os_guess": node["osmatch"][0]["name"] if node.get("osmatch") else None,
            "mac": mac,
            "vendor": node.get("vendor", {}).get(mac) if mac else None,
            "ports": [],
        }
        for proto in node.all_protocols():
            for port in sorted(node[proto].keys()):
                p = node[proto][port]
                version = " ".join(x for x in (p.get("product", ""), p.get("version", ""),
                                               p.get("extrainfo", "")) if x).strip() or None
                host["ports"].append({"number": int(port), "protocol": proto,
                                      "state": p.get("state", ""),
                                      "service": p.get("name") or None, "version": version})
        out["hosts"].append(host)
    return out


async def scan(resolved: ResolvedTarget, config: ScanConfig, progress: ProgressCb,
               cancel: asyncio.Event) -> ScanResult:
    start = time.perf_counter()
    args, notes = build_args(config, detect().is_admin)
    await progress("portscan", 0, 1, f"nmap {args} {resolved.raw}")

    loop = asyncio.get_running_loop()
    task = loop.run_in_executor(None, _run_nmap_sync, resolved.raw, args)
    elapsed_msg = 0
    while not task.done():
        if cancel.is_set():
            # python-nmap has no mid-run kill; the result is discarded when it returns.
            return ScanResult("nmap", [], time.perf_counter() - start, cancelled=True, notes=notes)
        await asyncio.sleep(0.25)
        elapsed_msg += 1
        if elapsed_msg % 8 == 0:
            await progress("portscan", 0, 1, f"nmap running… {int(time.perf_counter() - start)}s")

    raw = await task
    hosts = [HostResult(ip=h["ip"], hostname=h["hostname"], mac=h["mac"], vendor=h["vendor"],
                        state=h["state"], os_guess=h["os_guess"],
                        ports=[PortResult(**p) for p in h["ports"]]) for h in raw["hosts"]]
    await progress("done", 1, 1, "Scan complete.")
    return ScanResult("nmap", hosts, time.perf_counter() - start, notes=notes)

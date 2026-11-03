"""Runtime capability detection for the hybrid network engine.

0xFLUX adapts to the host it runs on. Rather than pretending a feature works,
every module queries this registry and the frontend is told plainly what is
available, degraded, or unsupported.
"""
from __future__ import annotations

import ctypes
import os
import platform
import shutil
from dataclasses import asdict, dataclass
from functools import lru_cache

from .logging import get_logger

log = get_logger("capabilities")


@dataclass
class Capability:
    available: bool
    detail: str


@dataclass
class Capabilities:
    os: str
    os_release: str
    is_admin: bool
    nmap: Capability          # richer scanning / service+OS detection
    scapy: Capability         # low-level packet capture
    pcap: Capability          # libpcap / Npcap present
    raw_socket_icmp: Capability  # ping without external binary
    whois: Capability         # python-whois importable

    def to_dict(self) -> dict:
        d = asdict(self)
        for k in ("nmap", "scapy", "pcap", "raw_socket_icmp", "whois"):
            d[k] = asdict(getattr(self, k))
        return d


def _is_admin() -> bool:
    try:
        if os.name == "nt":
            return bool(ctypes.windll.shell32.IsUserAnAdmin())  # type: ignore[attr-defined]
        return os.geteuid() == 0  # type: ignore[attr-defined]
    except Exception:
        return False


def _nmap() -> Capability:
    binary = shutil.which("nmap")
    if not binary:
        return Capability(False, "nmap binary not found in PATH")
    try:
        import nmap  # noqa: F401  (python-nmap wrapper)
        return Capability(True, f"nmap at {binary} (python-nmap wrapper available)")
    except Exception:
        return Capability(True, f"nmap at {binary} (python-nmap wrapper missing; XML parse fallback)")


def _scapy() -> Capability:
    try:
        import scapy.all  # noqa: F401
        return Capability(True, "scapy importable")
    except Exception as exc:  # pragma: no cover - import guard
        return Capability(False, f"scapy not importable: {exc.__class__.__name__}")


def _pcap() -> Capability:
    system = platform.system()
    if system == "Windows":
        # Npcap installs these DLLs; their presence is a good proxy.
        import glob
        candidates = glob.glob(r"C:\Windows\System32\Npcap\wpcap.dll") + glob.glob(
            r"C:\Windows\System32\wpcap.dll"
        )
        if candidates:
            return Capability(True, "Npcap detected")
        return Capability(False, "Npcap not detected — install from npcap.com for capture")
    if system == "Darwin":
        return Capability(os.path.exists("/dev/bpf0"), "BPF devices (macOS)")
    # Linux: capture needs CAP_NET_RAW / root.
    return Capability(True, "libpcap path (requires root/CAP_NET_RAW at runtime)")


def _raw_socket() -> Capability:
    # Raw ICMP sockets need privileges on most OSes; TCP-connect ping always works.
    return Capability(_is_admin(), "raw ICMP needs admin; TCP-connect fallback always available")


def _whois() -> Capability:
    try:
        import whois  # noqa: F401
        return Capability(True, "python-whois importable")
    except Exception:
        return Capability(False, "python-whois not installed")


@lru_cache(maxsize=1)
def detect() -> Capabilities:
    caps = Capabilities(
        os=platform.system(),
        os_release=platform.release(),
        is_admin=_is_admin(),
        nmap=_nmap(),
        scapy=_scapy(),
        pcap=_pcap(),
        raw_socket_icmp=_raw_socket(),
        whois=_whois(),
    )
    log.info(
        "Capabilities: os=%s admin=%s nmap=%s scapy=%s pcap=%s",
        caps.os, caps.is_admin, caps.nmap.available, caps.scapy.available, caps.pcap.available,
    )
    return caps


def refresh() -> Capabilities:
    detect.cache_clear()
    return detect()

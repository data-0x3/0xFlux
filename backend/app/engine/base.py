"""Shared types and profiles for the scan engine."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Awaitable, Callable, Optional


class Profile(str, Enum):
    QUICK = "quick_discovery"
    STANDARD = "standard_scan"
    SERVICE = "service_detection"
    FULL = "full_port_audit"
    CUSTOM = "custom"


# Commonly inspected TCP ports for the Standard profile.
TOP_TCP_PORTS = [
    21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 993, 995,
    1723, 3306, 3389, 5900, 8080, 8443, 8000, 5432, 6379, 27017, 1433, 3000,
]


@dataclass
class ScanConfig:
    target: str
    authorized: bool = False
    profile: Profile = Profile.STANDARD
    ports: Optional[list[int]] = None          # explicit port list (CUSTOM/advanced)
    detect_service: bool = False
    detect_os: bool = False
    udp: bool = False
    timeout: float = 1.0
    concurrency: int = 200

    def resolved_ports(self) -> list[int]:
        if self.ports:
            return sorted(set(self.ports))
        if self.profile == Profile.QUICK:
            return [80, 443, 22, 445, 3389]
        if self.profile == Profile.STANDARD:
            return TOP_TCP_PORTS
        if self.profile == Profile.SERVICE:
            return TOP_TCP_PORTS
        if self.profile == Profile.FULL:
            return list(range(1, 1025)) + [1433, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017]
        return TOP_TCP_PORTS


@dataclass
class PortResult:
    number: int
    protocol: str = "tcp"
    state: str = "closed"
    service: Optional[str] = None
    version: Optional[str] = None


@dataclass
class HostResult:
    ip: str
    hostname: Optional[str] = None
    mac: Optional[str] = None
    vendor: Optional[str] = None
    state: str = "up"
    os_guess: Optional[str] = None
    latency_ms: Optional[float] = None
    ports: list[PortResult] = field(default_factory=list)


@dataclass
class ScanResult:
    engine: str
    hosts: list[HostResult] = field(default_factory=list)
    duration_s: float = 0.0
    cancelled: bool = False
    notes: list[str] = field(default_factory=list)


UDP_PORTS = [53, 67, 68, 69, 123, 137, 138, 161, 500, 514, 1900, 5353]


# progress callback: (phase, done, total, message)
ProgressCb = Callable[[str, int, int, str], Awaitable[None]]

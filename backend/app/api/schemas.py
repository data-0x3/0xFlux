"""Pydantic request/response schemas for the API."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator

from ..engine.base import Profile


class ScanRequest(BaseModel):
    target: str = Field(..., examples=["192.168.1.0/24", "scanme.nmap.org"])
    profile: Profile = Profile.STANDARD
    ports: Optional[list[int]] = None
    detect_service: bool = False
    detect_os: bool = False
    udp: bool = False
    authorized: bool = False
    timeout: float = Field(default=1.0, ge=0.2, le=10.0)

    @field_validator("ports")
    @classmethod
    def _ports_in_range(cls, v: Optional[list[int]]) -> Optional[list[int]]:
        if v is None:
            return v
        bad = [p for p in v if not 1 <= p <= 65535]
        if bad:
            raise ValueError(f"Ports must be between 1 and 65535 (got {bad[:5]}).")
        if len(v) > 65535:
            raise ValueError("Too many ports.")
        return v


class ScanStarted(BaseModel):
    scan_id: int
    engine: str


class DnsRequest(BaseModel):
    name: str
    type: str = "A"


class PingRequest(BaseModel):
    host: str
    count: int = 4


class TraceRequest(BaseModel):
    host: str
    max_hops: int = 20

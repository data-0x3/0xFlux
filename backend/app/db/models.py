"""ORM models for 0xFLUX: scans, hosts, ports, and discovered devices."""
from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    target: Mapped[str] = mapped_column(String(255), index=True)
    profile: Mapped[str] = mapped_column(String(64))
    engine: Mapped[str] = mapped_column(String(32))           # "nmap" | "python"
    status: Mapped[str] = mapped_column(String(16), default="running")  # running|completed|cancelled|error
    started_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    finished_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_s: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hosts_up: Mapped[int] = mapped_column(Integer, default=0)
    ports_open: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    options_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    hosts: Mapped[list["Host"]] = relationship(
        back_populates="scan", cascade="all, delete-orphan", lazy="selectin"
    )


class Host(Base):
    __tablename__ = "hosts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), index=True)
    ip: Mapped[str] = mapped_column(String(45), index=True)
    hostname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mac: Mapped[Optional[str]] = mapped_column(String(17), nullable=True)
    vendor: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    state: Mapped[str] = mapped_column(String(16), default="up")
    os_guess: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    scan: Mapped["Scan"] = relationship(back_populates="hosts")
    ports: Mapped[list["Port"]] = relationship(
        back_populates="host", cascade="all, delete-orphan", lazy="selectin"
    )


class Port(Base):
    __tablename__ = "ports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("hosts.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    protocol: Mapped[str] = mapped_column(String(8), default="tcp")
    state: Mapped[str] = mapped_column(String(16))           # open|closed|filtered
    service: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    version: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    host: Mapped["Host"] = relationship(back_populates="ports")


class Device(Base):
    """Persistent device inventory for Network Discovery (seen over time)."""
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ip: Mapped[str] = mapped_column(String(45), index=True)
    mac: Mapped[Optional[str]] = mapped_column(String(17), index=True, nullable=True)
    hostname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    vendor: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    first_seen: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    is_gateway: Mapped[bool] = mapped_column(default=False)

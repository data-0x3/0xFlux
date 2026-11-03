"""System / meta endpoints: health, capabilities, interfaces, port reference."""
from __future__ import annotations

from fastapi import APIRouter

from ..core.capabilities import detect, refresh
from ..core.config import settings
from ..engine.services import COMMON_SERVICES
from ..services.monitor import monitor

router = APIRouter(tags=["system"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "app": settings.app_name, "version": settings.version,
            "developer": settings.developer}


@router.get("/settings")
async def app_settings() -> dict:
    return {
        "latency_target": settings.latency_target,
        "restrict_to_private_by_default": settings.restrict_to_private_by_default,
        "data_dir": str(settings.data_dir),
        "api": f"http://{settings.host}:{settings.port}",
    }


@router.get("/capabilities")
async def capabilities() -> dict:
    return detect().to_dict()


@router.post("/capabilities/refresh")
async def capabilities_refresh() -> dict:
    return refresh().to_dict()


@router.get("/interfaces")
async def interfaces() -> dict:
    return {"interfaces": monitor.interfaces()}


@router.get("/ports/observed")
async def ports_observed() -> dict:
    """Open ports actually seen across completed scans (latest result per host)."""
    from sqlalchemy import select

    from ..db.models import Host, Port, Scan
    from ..db.session import SessionLocal

    async with SessionLocal() as s:
        stmt = (select(Host.ip, Port.number, Port.protocol, Port.state, Port.service,
                       Port.version, Scan.started_at)
                .join(Port, Port.host_id == Host.id).join(Scan, Scan.id == Host.scan_id)
                .where(Scan.status == "completed").order_by(Scan.started_at.desc()))
        rows = (await s.execute(stmt)).all()

    latest: dict[tuple, dict] = {}
    for ip, number, proto, state, service, version, when in rows:
        key = (ip, number, proto)
        if key not in latest:  # rows are newest-first
            latest[key] = {"state": state, "service": service, "version": version,
                           "seen": when.isoformat() if when else None}
    agg: dict[tuple, dict] = {}
    for (ip, number, proto), info in latest.items():
        if info["state"] != "open":
            continue
        a = agg.setdefault((number, proto), {"port": number, "protocol": proto, "hosts": [],
                                             "services": set(), "versions": set(), "last_seen": None})
        a["hosts"].append(ip)
        if info["service"]:
            a["services"].add(info["service"])
        if info["version"]:
            a["versions"].add(info["version"])
        if info["seen"] and (a["last_seen"] is None or info["seen"] > a["last_seen"]):
            a["last_seen"] = info["seen"]
    out = [{**a, "services": sorted(a["services"]), "versions": sorted(a["versions"])[:5]}
           for a in sorted(agg.values(), key=lambda x: (x["port"], x["protocol"]))]
    return {"ports": out}


@router.get("/ports/reference")
async def ports_reference() -> dict:
    rows = [{"port": p, "protocol": "tcp", **info} for p, info in sorted(COMMON_SERVICES.items())]
    return {"ports": rows}

"""Scan history, details, comparison, deletion, and exports (JSON/CSV/PDF)."""
from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from sqlalchemy import delete, select

from ..db.models import Host, Port, Scan
from ..db.session import SessionLocal
from ..services.report import build_pdf

router = APIRouter(prefix="/history", tags=["history"])


def _scan_to_dict(scan: Scan, full: bool = False) -> dict:
    d = {
        "id": scan.id, "target": scan.target, "profile": scan.profile,
        "engine": scan.engine, "status": scan.status,
        "started_at": scan.started_at.isoformat() if scan.started_at else None,
        "finished_at": scan.finished_at.isoformat() if scan.finished_at else None,
        "duration_s": scan.duration_s, "hosts_up": scan.hosts_up,
        "ports_open": scan.ports_open, "error": scan.error,
        "notes": scan.notes.split("\n") if scan.notes else [],
    }
    if full:
        d["hosts"] = [{
            "ip": h.ip, "hostname": h.hostname, "mac": h.mac, "vendor": h.vendor,
            "state": h.state, "os_guess": h.os_guess, "latency_ms": h.latency_ms,
            "ports": [{"number": p.number, "protocol": p.protocol, "state": p.state,
                       "service": p.service, "version": p.version} for p in h.ports],
        } for h in scan.hosts]
    return d


@router.get("")
async def list_scans(q: str | None = None, limit: int = 100) -> dict:
    async with SessionLocal() as s:
        stmt = select(Scan).order_by(Scan.started_at.desc()).limit(limit)
        if q:
            stmt = select(Scan).where(Scan.target.contains(q)).order_by(Scan.started_at.desc()).limit(limit)
        rows = (await s.execute(stmt)).scalars().all()
        return {"scans": [_scan_to_dict(r) for r in rows]}


@router.get("/{scan_id}")
async def get_scan(scan_id: int) -> dict:
    async with SessionLocal() as s:
        scan = await s.get(Scan, scan_id)
        if not scan:
            raise HTTPException(404, "Scan not found.")
        return _scan_to_dict(scan, full=True)


@router.get("/{a}/compare/{b}")
async def compare(a: int, b: int) -> dict:
    async with SessionLocal() as s:
        sa, sb = await s.get(Scan, a), await s.get(Scan, b)
        if not sa or not sb:
            raise HTTPException(404, "One or both scans not found.")
        da, db = _scan_to_dict(sa, True), _scan_to_dict(sb, True)
    def _port_set(d: dict) -> set[tuple[str, int]]:
        return {(h["ip"], p["number"]) for h in d["hosts"] for p in h["ports"] if p["state"] == "open"}
    pa, pb = _port_set(da), _port_set(db)
    return {
        "a": da, "b": db,
        "opened": [{"ip": ip, "port": pt} for ip, pt in sorted(pb - pa)],
        "closed": [{"ip": ip, "port": pt} for ip, pt in sorted(pa - pb)],
        "unchanged": len(pa & pb),
    }


@router.delete("/{scan_id}")
async def delete_scan(scan_id: int) -> dict:
    async with SessionLocal() as s:
        scan = await s.get(Scan, scan_id)
        if not scan:
            raise HTTPException(404, "Scan not found.")
        await s.delete(scan)
        await s.commit()
    return {"ok": True, "deleted": scan_id}


@router.delete("")
async def clear_history() -> dict:
    async with SessionLocal() as s:
        await s.execute(delete(Port))
        await s.execute(delete(Host))
        await s.execute(delete(Scan))
        await s.commit()
    return {"ok": True}


@router.get("/{scan_id}/export.json")
async def export_json(scan_id: int):
    data = await get_scan(scan_id)
    return Response(json.dumps(data, indent=2), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="0xflux_scan_{scan_id}.json"'})


@router.get("/{scan_id}/export.csv")
async def export_csv(scan_id: int):
    data = await get_scan(scan_id)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["host_ip", "hostname", "port", "protocol", "state", "service", "version"])
    for h in data["hosts"]:
        if not h["ports"]:
            w.writerow([h["ip"], h["hostname"] or "", "", "", h["state"], "", ""])
        for p in h["ports"]:
            w.writerow([h["ip"], h["hostname"] or "", p["number"], p["protocol"],
                        p["state"], p["service"] or "", p["version"] or ""])
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="0xflux_scan_{scan_id}.csv"'})


@router.get("/{scan_id}/export.pdf")
async def export_pdf(scan_id: int):
    data = await get_scan(scan_id)
    pdf_bytes = build_pdf(data)
    return Response(pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="0xflux_scan_{scan_id}.pdf"'})

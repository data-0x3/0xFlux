"""Network discovery endpoints."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from ..services import discovery

router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.post("/scan")
async def discover(subnet: Optional[str] = None) -> dict:
    return await discovery.discover(subnet)


@router.get("/inventory")
async def inventory() -> dict:
    return await discovery.inventory()


@router.get("/context")
async def context() -> dict:
    subnet, local_ip, iface = discovery.local_subnet()
    return {"subnet": subnet, "local_ip": local_ip, "interface": iface,
            "gateway": await discovery.default_gateway()}


@router.delete("/inventory")
async def clear_inventory() -> dict:
    await discovery.forget_all()
    return {"ok": True}

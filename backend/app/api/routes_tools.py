"""DNS & IP tools endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from ..services import netutils
from .schemas import DnsRequest, PingRequest, TraceRequest

router = APIRouter(prefix="/tools", tags=["tools"])


@router.post("/dns")
async def dns(req: DnsRequest) -> dict:
    return await netutils.dns_lookup(req.name, req.type)


@router.get("/reverse-dns")
async def reverse_dns(ip: str) -> dict:
    return await netutils.reverse_dns(ip)


@router.get("/resolve")
async def resolve(host: str) -> dict:
    return await netutils.resolve_hostname(host)


@router.get("/whois")
async def whois(domain: str) -> dict:
    return await netutils.whois_lookup(domain)


@router.post("/ping")
async def ping(req: PingRequest) -> dict:
    return await netutils.ping(req.host, req.count)


@router.post("/traceroute")
async def traceroute(req: TraceRequest) -> dict:
    return await netutils.traceroute(req.host, req.max_hops)


@router.get("/subnet")
async def subnet(cidr: str) -> dict:
    return netutils.subnet_calc(cidr)


@router.get("/ipinfo")
async def ipinfo(ip: str) -> dict:
    return netutils.ip_info(ip)

"""DNS & IP utilities — every function returns real results or a clear error.

Ping and traceroute shell out to the OS tools; their output is parsed in a
locale-independent way (English, French and Linux formats all work). Every
host argument is validated first so it can never be read as a command option.
"""
from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from typing import Any

from ..core.proc import IS_WINDOWS, run
from ..core.safety import _HOSTNAME_RE

_MS = r"(\d+(?:[.,]\d+)?)\s*ms"


def _valid_host(host: str) -> bool:
    host = (host or "").strip()
    if not host or host.startswith("-"):
        return False
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return bool(_HOSTNAME_RE.match(host))


def _num(s: str) -> float:
    return float(s.replace(",", "."))


# ---------------------------------------------------------------- DNS ----

async def dns_lookup(name: str, record: str = "A") -> dict[str, Any]:
    import dns.asyncresolver
    import dns.exception
    import dns.resolver
    record = record.upper()
    if record not in {"A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "PTR", "SRV", "CAA"}:
        return {"ok": False, "error": f"Unsupported record type: {record}"}
    if not _valid_host(name):
        return {"ok": False, "error": "Not a valid domain name."}
    try:
        answers = await dns.asyncresolver.resolve(name, record, lifetime=6)
        return {"ok": True, "name": name, "type": record,
                "records": [r.to_text() for r in answers],
                "ttl": answers.rrset.ttl if answers.rrset else None,
                "nameserver": answers.nameserver if hasattr(answers, "nameserver") else None}
    except dns.resolver.NXDOMAIN:
        return {"ok": False, "error": f"No such domain: {name}"}
    except dns.resolver.NoAnswer:
        return {"ok": False, "error": f"No {record} record for {name}"}
    except dns.exception.Timeout:
        return {"ok": False, "error": "DNS query timed out."}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


async def reverse_dns(ip: str) -> dict[str, Any]:
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        return {"ok": False, "error": "Not a valid IP address."}
    loop = asyncio.get_running_loop()
    try:
        host = await loop.run_in_executor(None, socket.gethostbyaddr, ip)
        return {"ok": True, "ip": ip, "hostname": host[0], "aliases": host[1]}
    except (socket.herror, socket.gaierror, OSError) as exc:
        return {"ok": False, "error": f"No PTR record ({exc})"}


async def resolve_hostname(name: str) -> dict[str, Any]:
    if not _valid_host(name):
        return {"ok": False, "error": "Not a valid hostname."}
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.run_in_executor(None, socket.getaddrinfo, name, None)
        addrs = sorted({i[4][0] for i in infos})
        return {"ok": True, "hostname": name, "addresses": addrs}
    except socket.gaierror as exc:
        return {"ok": False, "error": str(exc)}


async def whois_lookup(domain: str) -> dict[str, Any]:
    try:
        import whois  # python-whois
    except ImportError:
        return {"ok": False, "error": "WHOIS unsupported: python-whois not installed."}
    if not _valid_host(domain):
        return {"ok": False, "error": "Not a valid domain name."}
    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(None, whois.whois, domain)

        def _norm(v: Any) -> Any:
            if isinstance(v, (list, tuple, set)):
                return [str(x) for x in v]
            return str(v) if v is not None else None

        return {"ok": True, "domain": domain, "data": {
            "registrar": _norm(data.get("registrar")),
            "creation_date": _norm(data.get("creation_date")),
            "expiration_date": _norm(data.get("expiration_date")),
            "updated_date": _norm(data.get("updated_date")),
            "name_servers": _norm(data.get("name_servers")),
            "status": _norm(data.get("status")),
            "country": _norm(data.get("country")),
        }}
    except Exception as exc:
        return {"ok": False, "error": f"WHOIS failed: {exc}"}


# --------------------------------------------------------------- ICMP ----

def parse_ping(out: str, count: int) -> dict[str, Any]:
    reply_lines = [l for l in out.splitlines() if re.search(r"ttl", l, re.I)]
    times = []
    for line in reply_lines:
        m = re.search(r"[=<]\s*" + _MS, line)
        if m:
            times.append(_num(m.group(1)))
    loss = re.search(r"(\d+(?:[.,]\d+)?)\s*%", out)
    return {
        "sent": count,
        "received": len(times),
        "loss_pct": _num(loss.group(1)) if loss else (0.0 if len(times) == count else
                                                       round((count - len(times)) / count * 100, 1)),
        "rtt_min": min(times) if times else None,
        "rtt_avg": round(sum(times) / len(times), 2) if times else None,
        "rtt_max": max(times) if times else None,
        "replies": times,
    }


async def ping(host: str, count: int = 4) -> dict[str, Any]:
    if not _valid_host(host):
        return {"ok": False, "error": "Not a valid IP address or hostname."}
    count = max(1, min(int(count), 20))
    cmd = ["ping", "-n", str(count), host] if IS_WINDOWS else ["ping", "-c", str(count), host]
    rc, out = await run(cmd, timeout=count * 3 + 6)
    if rc == 127:
        return {"ok": False, "error": out}
    parsed = parse_ping(out, count)
    if not parsed["received"]:
        return {"ok": False, "error": f"No reply from {host} ({parsed['loss_pct']}% loss).", "raw": out.strip()}
    return {"ok": True, "host": host, "raw": out.strip(), **parsed}


def parse_traceroute(out: str) -> list[dict[str, Any]]:
    hops: list[dict[str, Any]] = []
    for line in out.splitlines():
        m = re.match(r"\s*(\d+)\s+(.*)", line)
        if not m:
            continue
        body = m.group(2)
        ips = re.findall(r"(\d{1,3}(?:\.\d{1,3}){3})", body)
        times = [_num(t) for t in re.findall(r"<?\s*" + _MS, body)]
        name = re.search(r"([A-Za-z0-9][\w.-]*\.[A-Za-z]{2,})\s*[\[(]", body)
        hops.append({
            "hop": int(m.group(1)),
            "ip": ips[0] if ips else None,
            "hostname": name.group(1) if name else None,
            "rtt_ms": round(sum(times) / len(times), 2) if times else None,
            "timeout": not ips,
        })
    return hops


async def traceroute(host: str, max_hops: int = 20) -> dict[str, Any]:
    if not _valid_host(host):
        return {"ok": False, "error": "Not a valid IP address or hostname."}
    max_hops = max(1, min(int(max_hops), 30))
    if IS_WINDOWS:
        cmd = ["tracert", "-d", "-h", str(max_hops), "-w", "1000", host]
    else:
        cmd = ["traceroute", "-n", "-m", str(max_hops), "-w", "1", host]
    rc, out = await run(cmd, timeout=max_hops * 4 + 10)
    if rc == 127:
        return {"ok": False, "error": out + (" Install the 'traceroute' package." if not IS_WINDOWS else "")}
    hops = parse_traceroute(out)
    return {"ok": bool(hops), "host": host, "hops": hops, "raw": out.strip(),
            **({} if hops else {"error": "Traceroute returned no hops."})}


# --------------------------------------------------------- subnet math ----

def subnet_calc(cidr: str) -> dict[str, Any]:
    try:
        net = ipaddress.ip_network(cidr.strip(), strict=False)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    total = net.num_addresses
    if net.version == 4:
        usable = total - 2 if net.prefixlen < 31 else total
        first = net.network_address + (1 if net.prefixlen < 31 else 0)
        last = net.broadcast_address - (1 if net.prefixlen < 31 else 0)
    else:
        usable = total
        first, last = net.network_address, net.broadcast_address
    return {
        "ok": True,
        "network": str(net.network_address),
        "netmask": str(net.netmask),
        "wildcard": str(net.hostmask),
        "broadcast": str(net.broadcast_address) if net.version == 4 else None,
        "prefix": net.prefixlen,
        "total_addresses": total,
        "usable_hosts": usable,
        "first_host": str(first),
        "last_host": str(last),
        "version": net.version,
        "is_private": net.is_private,
    }


def ip_info(ip: str) -> dict[str, Any]:
    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "ip": str(addr),
        "version": addr.version,
        "is_private": addr.is_private,
        "is_loopback": addr.is_loopback,
        "is_multicast": addr.is_multicast,
        "is_global": addr.is_global,
        "is_link_local": addr.is_link_local,
        "is_reserved": addr.is_reserved,
        "reverse_pointer": addr.reverse_pointer,
    }

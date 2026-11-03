"""0xFLUX backend tests. Run from backend/: `python -m pytest -q`."""
from __future__ import annotations

import asyncio
import struct

import pytest

from app.core.safety import TargetError, expand_hosts, validate_target
from app.engine.base import Profile, ScanConfig
from app.engine.nmap_engine import build_args
from app.engine.packet_parse import parse_http, parse_tls
from app.engine.services import COMMON_SERVICES
from app.services.netutils import _valid_host, ip_info, parse_ping, parse_traceroute, subnet_calc
from app.services.oui import lookup_vendor


# ------------------------------------------------------------------ safety --

def test_private_cidr_allowed():
    r = validate_target("192.168.1.0/24")
    assert r.kind == "cidr" and r.is_private


def test_public_target_requires_authorisation():
    with pytest.raises(TargetError):
        validate_target("8.8.8.8")
    assert validate_target("8.8.8.8", authorized=True).kind == "ip"


@pytest.mark.parametrize("bad", ["", "999.1.1.1", "-oN /tmp/x", "a b", "10.0.0.0/8"])
def test_bad_targets_rejected(bad):
    with pytest.raises(TargetError):
        validate_target(bad)


def test_expand_hosts():
    assert expand_hosts(validate_target("10.0.0.0/30")) == ["10.0.0.1", "10.0.0.2"]


# ------------------------------------------------------------------ engine --

def test_profiles():
    assert ScanConfig(target="x", profile=Profile.QUICK).resolved_ports() == [80, 443, 22, 445, 3389]
    assert 443 in ScanConfig(target="x", profile=Profile.STANDARD).resolved_ports()
    assert len(ScanConfig(target="x", profile=Profile.FULL).resolved_ports()) > 1000
    assert ScanConfig(target="x", ports=[80, 22, 80]).resolved_ports() == [22, 80]


def test_nmap_args_respect_privileges():
    cfg = ScanConfig(target="x", profile=Profile.STANDARD, detect_os=True, udp=True)
    args, notes = build_args(cfg, is_admin=False)
    assert "-O" not in args and "-sU" not in args and len(notes) == 2
    args, notes = build_args(cfg, is_admin=True)
    assert "-O" in args and "-sU" in args and "U:53" in args and not notes


def test_full_audit_is_rate_limited():
    args, _ = build_args(ScanConfig(target="x", profile=Profile.FULL), is_admin=False)
    assert "--max-rate" in args and "-sV" in args


# ---------------------------------------------------------------- netutils --

def test_valid_host_blocks_option_injection():
    assert _valid_host("example.com") and _valid_host("1.1.1.1")
    assert not _valid_host("-n") and not _valid_host("a;b") and not _valid_host("")


def test_subnet_calc():
    sc = subnet_calc("192.168.1.0/24")
    assert sc["usable_hosts"] == 254 and sc["broadcast"] == "192.168.1.255"
    assert sc["first_host"] == "192.168.1.1" and sc["last_host"] == "192.168.1.254"
    assert subnet_calc("10.0.0.0/8")["usable_hosts"] == 16777214  # no host enumeration
    assert subnet_calc("10.0.0.0/31")["usable_hosts"] == 2
    assert subnet_calc("nope")["ok"] is False


def test_ip_info():
    assert ip_info("127.0.0.1")["is_loopback"]
    assert ip_info("8.8.8.8")["is_global"]


PING_FR = """
Envoi d'une requête 'Ping'  1.1.1.1 avec 32 octets de données :
Réponse de 1.1.1.1 : octets=32 temps=12 ms TTL=57
Réponse de 1.1.1.1 : octets=32 temps=14 ms TTL=57
Réponse de 1.1.1.1 : octets=32 temps<1ms TTL=57
Délai d'attente de la demande dépassé.

Statistiques Ping pour 1.1.1.1:
    Paquets : envoyés = 4, reçus = 3, perdus = 1 (perte 25%),
Durée approximative des boucles en millisecondes :
    Minimum = 1ms, Maximum = 14ms, Moyenne = 9ms
"""

PING_LINUX = """
64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=11.8 ms
64 bytes from 1.1.1.1: icmp_seq=2 ttl=57 time=12.2 ms
--- 1.1.1.1 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1001ms
rtt min/avg/max/mdev = 11.8/12.0/12.2/0.2 ms
"""


def test_parse_ping_french_windows():
    r = parse_ping(PING_FR, 4)
    assert r["received"] == 3 and r["loss_pct"] == 25.0
    assert r["rtt_min"] == 1.0 and r["rtt_max"] == 14.0


def test_parse_ping_linux():
    r = parse_ping(PING_LINUX, 2)
    assert r["received"] == 2 and r["loss_pct"] == 0.0 and r["rtt_avg"] == 12.0


TRACERT_FR = """
Détermination de l'itinéraire vers 1.1.1.1 avec un maximum de 30 sauts.

  1    <1 ms    <1 ms    <1 ms  192.168.1.254
  2     8 ms     7 ms     9 ms  80.10.236.1
  3     *        *        *     Délai d'attente de la demande dépassé.
  4    12 ms    11 ms    12 ms  1.1.1.1

Itinéraire déterminé.
"""


def test_parse_traceroute_windows():
    hops = parse_traceroute(TRACERT_FR)
    assert [h["hop"] for h in hops] == [1, 2, 3, 4]
    assert hops[0]["ip"] == "192.168.1.254" and hops[0]["rtt_ms"] == 1.0
    assert hops[2]["timeout"] and hops[2]["ip"] is None
    assert hops[3]["ip"] == "1.1.1.1"


# --------------------------------------------------------- packet parsing --

def _client_hello(sni: str) -> bytes:
    name = sni.encode()
    server_name = struct.pack(">HBH", len(name) + 3, 0, len(name)) + name
    ext = struct.pack(">HH", 0x0000, len(server_name)) + server_name
    body = (b"\x03\x03" + b"\x00" * 32 + b"\x00"          # version, random, session id
            + b"\x00\x02\x13\x01" + b"\x01\x00"            # one cipher suite, null compression
            + struct.pack(">H", len(ext)) + ext)
    hs = b"\x01" + len(body).to_bytes(3, "big") + body
    return b"\x16\x03\x01" + struct.pack(">H", len(hs)) + hs


def test_tls_sni():
    r = parse_tls(_client_hello("example.com"))
    assert r == {"record": "Handshake", "version": "TLS 1.0", "handshake": "ClientHello", "sni": "example.com"}


def test_tls_application_data_and_garbage():
    assert parse_tls(b"\x17\x03\x03\x00\x10" + b"\x00" * 16)["record"] == "Application Data"
    assert parse_tls(b"GET / HTTP/1.1") is None
    assert parse_tls(b"\x16\x03") is None
    assert parse_tls(b"\x16\x03\x01\x00\x05\x01\x00") is not None  # truncated hello: no crash


def test_http_request_and_response():
    req = parse_http(b"GET /index.html HTTP/1.1\r\nHost: router.lan\r\nUser-Agent: x\r\n\r\n")
    assert req["method"] == "GET" and req["host"] == "router.lan" and req["path"] == "/index.html"
    resp = parse_http(b"HTTP/1.1 404 Not Found\r\nServer: nginx\r\n\r\n")
    assert resp["status"] == 404 and resp["server"] == "nginx"
    assert parse_http(b"\x16\x03\x01") is None and parse_http(b"") is None


# ------------------------------------------------------------- reference --

def test_services_and_oui():
    assert COMMON_SERVICES[443]["name"] == "https"
    assert lookup_vendor("b8:27:eb:12:34:56") == "Raspberry Pi Foundation"
    assert lookup_vendor("08-00-27-aa-bb-cc") == "VirtualBox"
    assert lookup_vendor(None) is None


# -------------------------------------------------------- python engine --

def test_python_engine_finds_local_listener():
    """End-to-end: open a real local port and scan 127.0.0.1 for it."""
    from app.engine import python_engine

    async def run():
        server = await asyncio.start_server(lambda r, w: w.close(), "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        events = []

        async def progress(*a):
            events.append(a)

        cfg = ScanConfig(target="127.0.0.1", profile=Profile.CUSTOM, ports=[port], timeout=0.5)
        res = await python_engine.scan(validate_target("127.0.0.1"), cfg, progress, asyncio.Event())
        server.close()
        return res, port, events

    res, port, events = asyncio.run(run())
    assert res.hosts and res.hosts[0].state == "up"
    assert [p.number for p in res.hosts[0].ports] == [port]
    assert events[-1][0] == "done"

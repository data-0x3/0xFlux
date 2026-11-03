"""Pure-bytes protocol metadata parsers (no third-party dependencies).

These read only what is observable in cleartext: HTTP/1.x request/status
lines and headers, and the unencrypted parts of a TLS handshake (record type,
version, handshake type, SNI). Encrypted payloads are never decoded.
"""
from __future__ import annotations

from typing import Optional

_HTTP_METHODS = (b"GET ", b"POST ", b"PUT ", b"DELETE ", b"HEAD ", b"OPTIONS ",
                 b"PATCH ", b"CONNECT ", b"TRACE ")

_TLS_VERSIONS = {0x0300: "SSL 3.0", 0x0301: "TLS 1.0", 0x0302: "TLS 1.1",
                 0x0303: "TLS 1.2", 0x0304: "TLS 1.3"}
_TLS_RECORDS = {0x14: "ChangeCipherSpec", 0x15: "Alert", 0x16: "Handshake",
                0x17: "Application Data"}
_TLS_HANDSHAKES = {0x01: "ClientHello", 0x02: "ServerHello", 0x0b: "Certificate",
                   0x0c: "ServerKeyExchange", 0x0e: "ServerHelloDone",
                   0x10: "ClientKeyExchange", 0x04: "NewSessionTicket"}


def _headers(lines: list[bytes]) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in lines:
        if not line:
            break
        if b":" in line:
            k, v = line.split(b":", 1)
            out[k.strip().lower().decode("latin-1")] = v.strip().decode("latin-1")[:200]
    return out


def parse_http(payload: bytes) -> Optional[dict]:
    """Return HTTP/1.x request or response metadata, or None."""
    if not payload:
        return None
    if payload.startswith(_HTTP_METHODS):
        head = payload.split(b"\r\n\r\n", 1)[0].split(b"\r\n")
        parts = head[0].split(b" ")
        if len(parts) < 3 or not parts[2].startswith(b"HTTP/"):
            return None
        h = _headers(head[1:])
        return {
            "kind": "request",
            "method": parts[0].decode("latin-1"),
            "path": parts[1].decode("latin-1", errors="replace")[:200],
            "version": parts[2].decode("latin-1"),
            "host": h.get("host"),
            "user_agent": h.get("user-agent"),
        }
    if payload.startswith(b"HTTP/1."):
        head = payload.split(b"\r\n\r\n", 1)[0].split(b"\r\n")
        parts = head[0].split(b" ", 2)
        if len(parts) < 2 or not parts[1].isdigit():
            return None
        h = _headers(head[1:])
        return {
            "kind": "response",
            "version": parts[0].decode("latin-1"),
            "status": int(parts[1]),
            "reason": parts[2].decode("latin-1", errors="replace") if len(parts) > 2 else "",
            "server": h.get("server"),
            "content_type": h.get("content-type"),
        }
    return None


def _sni_from_client_hello(data: bytes, pos: int) -> Optional[str]:
    """Walk a ClientHello body (starting after the 4-byte handshake header)."""
    try:
        pos += 2 + 32                         # client_version + random
        pos += 1 + data[pos]                  # session id
        pos += 2 + int.from_bytes(data[pos:pos + 2], "big")  # cipher suites
        pos += 1 + data[pos]                  # compression methods
        ext_end = pos + 2 + int.from_bytes(data[pos:pos + 2], "big")
        pos += 2
        while pos + 4 <= min(ext_end, len(data)):
            etype = int.from_bytes(data[pos:pos + 2], "big")
            elen = int.from_bytes(data[pos + 2:pos + 4], "big")
            pos += 4
            if etype == 0x0000:               # server_name
                # list length (2) · name type (1) · name length (2) · name
                name_len = int.from_bytes(data[pos + 3:pos + 5], "big")
                name = data[pos + 5:pos + 5 + name_len]
                return name.decode("ascii", errors="replace") or None
            pos += elen
    except (IndexError, ValueError):
        return None
    return None


def parse_tls(payload: bytes) -> Optional[dict]:
    """Return TLS record metadata (never payload contents), or None."""
    if len(payload) < 5:
        return None
    ctype = payload[0]
    if ctype not in _TLS_RECORDS or payload[1] != 0x03 or payload[2] > 0x04:
        return None
    version = int.from_bytes(payload[1:3], "big")
    out: dict = {"record": _TLS_RECORDS[ctype], "version": _TLS_VERSIONS.get(version, hex(version)),
                 "handshake": None, "sni": None}
    if ctype == 0x16 and len(payload) >= 6:
        hs = payload[5]
        out["handshake"] = _TLS_HANDSHAKES.get(hs, f"type {hs}")
        if hs == 0x01:
            out["sni"] = _sni_from_client_hello(payload, 9)
    return out

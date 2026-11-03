"""Service/port reference data and light banner hinting.

The COMMON_SERVICES table backs both the scanner's service naming and the
Port Explorer section. Banner hinting is a conservative, read-only grab of
whatever a service announces on connect — never an exploit or probe payload.
"""
from __future__ import annotations

import asyncio
from typing import Optional

COMMON_SERVICES: dict[int, dict[str, str]] = {
    20: {"name": "ftp-data", "desc": "FTP data transfer channel."},
    21: {"name": "ftp", "desc": "File Transfer Protocol control."},
    22: {"name": "ssh", "desc": "Secure Shell remote login."},
    23: {"name": "telnet", "desc": "Telnet remote login (unencrypted)."},
    25: {"name": "smtp", "desc": "Simple Mail Transfer Protocol."},
    53: {"name": "dns", "desc": "Domain Name System."},
    67: {"name": "dhcp", "desc": "DHCP server."},
    68: {"name": "dhcp", "desc": "DHCP client."},
    80: {"name": "http", "desc": "Hypertext Transfer Protocol."},
    110: {"name": "pop3", "desc": "Post Office Protocol v3."},
    111: {"name": "rpcbind", "desc": "ONC RPC portmapper."},
    123: {"name": "ntp", "desc": "Network Time Protocol."},
    135: {"name": "msrpc", "desc": "Microsoft RPC endpoint mapper."},
    137: {"name": "netbios-ns", "desc": "NetBIOS name service."},
    139: {"name": "netbios-ssn", "desc": "NetBIOS session service."},
    143: {"name": "imap", "desc": "Internet Message Access Protocol."},
    161: {"name": "snmp", "desc": "Simple Network Management Protocol."},
    389: {"name": "ldap", "desc": "Lightweight Directory Access Protocol."},
    443: {"name": "https", "desc": "HTTP over TLS."},
    445: {"name": "microsoft-ds", "desc": "SMB over TCP (file sharing)."},
    465: {"name": "smtps", "desc": "SMTP over TLS."},
    514: {"name": "syslog", "desc": "System logging."},
    587: {"name": "submission", "desc": "Mail submission (SMTP)."},
    631: {"name": "ipp", "desc": "Internet Printing Protocol."},
    993: {"name": "imaps", "desc": "IMAP over TLS."},
    995: {"name": "pop3s", "desc": "POP3 over TLS."},
    1433: {"name": "ms-sql", "desc": "Microsoft SQL Server."},
    1723: {"name": "pptp", "desc": "Point-to-Point Tunneling Protocol."},
    3306: {"name": "mysql", "desc": "MySQL database."},
    3389: {"name": "rdp", "desc": "Remote Desktop Protocol."},
    5432: {"name": "postgresql", "desc": "PostgreSQL database."},
    5900: {"name": "vnc", "desc": "Virtual Network Computing."},
    6379: {"name": "redis", "desc": "Redis key-value store."},
    8000: {"name": "http-alt", "desc": "Alternate HTTP (dev servers)."},
    8080: {"name": "http-proxy", "desc": "HTTP proxy / alternate HTTP."},
    8443: {"name": "https-alt", "desc": "Alternate HTTPS."},
    27017: {"name": "mongodb", "desc": "MongoDB database."},
}


async def grab_banner_hint(reader: asyncio.StreamReader, writer: asyncio.StreamWriter,
                           port: int) -> Optional[str]:
    """Read a short service banner if one is offered within a tight window.

    For HTTP-like ports we send a minimal, benign HEAD request. This is the
    same handshake any browser performs; it is not an attack payload.
    """
    try:
        if port in (80, 8080, 8000, 443, 8443):
            writer.write(b"HEAD / HTTP/1.0\r\n\r\n")
            await writer.drain()
        data = await asyncio.wait_for(reader.read(256), timeout=0.8)
        if not data:
            return None
        text = data.decode("latin-1", errors="replace")
        for line in text.splitlines():
            line = line.strip()
            if line.lower().startswith("server:"):
                return line.split(":", 1)[1].strip()[:120]
        first = text.splitlines()[0].strip() if text.splitlines() else ""
        return first[:120] or None
    except (asyncio.TimeoutError, OSError):
        return None

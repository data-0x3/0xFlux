"""Target validation and the authorisation guard.

The spec is explicit: scanning must be limited to networks and devices the
user owns or has permission to assess. We enforce a sane default here —
public targets require an explicit ``authorized`` acknowledgement — and we
normalise/validate every target before any network operation runs.
"""
from __future__ import annotations

import ipaddress
import re
import socket
from dataclasses import dataclass

from .config import settings

_HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$"
)


class TargetError(ValueError):
    """Raised when a target is malformed or not permitted."""


@dataclass
class ResolvedTarget:
    raw: str
    kind: str            # "ip" | "cidr" | "hostname"
    is_private: bool
    addresses: list[str]  # resolved IPs (for hostnames), or the IP/network itself


def _addr_is_private(addr: str) -> bool:
    try:
        return ipaddress.ip_address(addr).is_private or ipaddress.ip_address(addr).is_loopback
    except ValueError:
        return False


def validate_target(target: str, *, authorized: bool = False) -> ResolvedTarget:
    """Validate and classify a scan target.

    Raises :class:`TargetError` for malformed input, or for public targets
    when ``restrict_to_private_by_default`` is on and ``authorized`` is False.
    """
    target = (target or "").strip()
    if not target:
        raise TargetError("Empty target.")

    # CIDR range?
    if "/" in target:
        try:
            net = ipaddress.ip_network(target, strict=False)
        except ValueError as exc:
            raise TargetError(f"Invalid CIDR range: {exc}") from exc
        if net.num_addresses > 65536:
            raise TargetError("Range too large (max /16 = 65 536 hosts) to keep scans sane.")
        is_private = net.is_private or net.is_loopback
        _guard(is_private, authorized, target)
        return ResolvedTarget(target, "cidr", is_private, [str(net)])

    # Bare IP?
    try:
        ip = ipaddress.ip_address(target)
        is_private = ip.is_private or ip.is_loopback
        _guard(is_private, authorized, target)
        return ResolvedTarget(target, "ip", is_private, [str(ip)])
    except ValueError:
        pass

    # Hostname.
    if not _HOSTNAME_RE.match(target):
        raise TargetError("Not a valid IP address, CIDR range or hostname.")
    try:
        infos = socket.getaddrinfo(target, None)
        addrs = sorted({i[4][0] for i in infos})
    except socket.gaierror as exc:
        raise TargetError(f"Hostname does not resolve: {exc}") from exc
    is_private = all(_addr_is_private(a) for a in addrs)
    _guard(is_private, authorized, target)
    return ResolvedTarget(target, "hostname", is_private, addrs)


def _guard(is_private: bool, authorized: bool, target: str) -> None:
    if is_private:
        return
    if not settings.restrict_to_private_by_default:
        return
    if authorized:
        return
    raise TargetError(
        f"'{target}' is a public target. 0xFLUX scans owned/authorised networks by "
        "default. Re-send with authorized=true only if you have explicit permission "
        "to assess this host."
    )


def expand_hosts(resolved: ResolvedTarget, limit: int = 1024) -> list[str]:
    """Expand a target into individual host IPs (for sweeps)."""
    if resolved.kind == "cidr":
        net = ipaddress.ip_network(resolved.addresses[0], strict=False)
        hosts = [str(h) for h in net.hosts()] if net.num_addresses > 2 else [str(net.network_address)]
        return hosts[:limit]
    return resolved.addresses[:limit]

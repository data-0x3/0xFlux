"""Live packet capture — metadata only — via scapy's AsyncSniffer.

Requires a libpcap backend (Npcap on Windows) and, on most systems, elevated
privileges. When either is missing the service raises a clear CaptureError
instead of producing anything synthetic. Payloads are never stored: each
packet is reduced to addresses, ports, protocol, size, flags and the
cleartext metadata parsed in ``engine.packet_parse``.
"""
from __future__ import annotations

import threading
import time
from collections import Counter, deque
from typing import Any, Optional

from ..core.capabilities import detect
from ..core.logging import get_logger
from ..engine.packet_parse import parse_http, parse_tls

log = get_logger("capture")

_ICMP_TYPES = {0: "Echo reply", 3: "Destination unreachable", 5: "Redirect",
               8: "Echo request", 11: "Time exceeded"}


class CaptureError(Exception):
    pass


def _as_list(x: Any) -> list:
    if x is None:
        return []
    return list(x) if isinstance(x, list) else [x]


def _decode(v: Any) -> str:
    if isinstance(v, bytes):
        return v.decode("utf-8", errors="replace").rstrip(".")
    return str(v).rstrip(".")


def _dns_meta(dns: Any) -> tuple[str, dict]:
    qs = _as_list(dns.qd)
    q = qs[0] if qs else None
    qname = _decode(q.qname) if q is not None else None
    qtype = q.sprintf("%qtype%") if q is not None else None
    answers = []
    for rr in _as_list(dns.an)[:8]:
        try:
            answers.append(_decode(rr.rdata))
        except Exception:
            continue
    is_resp = bool(dns.qr)
    meta = {"kind": "response" if is_resp else "query", "qname": qname, "qtype": qtype,
            "answers": answers, "rcode": int(dns.rcode)}
    if is_resp:
        info = f"Response {qtype} {qname}" + (f" → {', '.join(answers[:3])}" if answers else "")
    else:
        info = f"Query {qtype} {qname}"
    return info, meta


def summarize(pkt: Any) -> dict:
    """Reduce a scapy packet to a JSON-safe metadata row."""
    from scapy.layers.dns import DNS
    from scapy.layers.inet import ICMP, IP, TCP, UDP
    from scapy.layers.inet6 import IPv6
    from scapy.layers.l2 import ARP

    row: dict[str, Any] = {"length": len(pkt), "protocol": "OTHER", "src": None, "dst": None,
                           "sport": None, "dport": None, "flags": None, "info": "", "meta": {}}

    if pkt.haslayer(ARP):
        a = pkt[ARP]
        row.update(protocol="ARP", src=a.psrc, dst=a.pdst)
        if a.op == 1:
            row["info"] = f"Who has {a.pdst}? Tell {a.psrc}"
        else:
            row["info"] = f"{a.psrc} is at {a.hwsrc}"
        row["meta"] = {"op": "request" if a.op == 1 else "reply", "hwsrc": a.hwsrc, "hwdst": a.hwdst}
        return row

    ip = pkt[IP] if pkt.haslayer(IP) else (pkt[IPv6] if pkt.haslayer(IPv6) else None)
    if ip is None:
        row["info"] = pkt.summary()[:160]
        return row
    row["src"], row["dst"] = ip.src, ip.dst
    row["meta"]["ttl"] = getattr(ip, "ttl", None) if pkt.haslayer(IP) else getattr(ip, "hlim", None)
    row["meta"]["ip_version"] = 4 if pkt.haslayer(IP) else 6

    if pkt.haslayer(ICMP):
        ic = pkt[ICMP]
        row["protocol"] = "ICMP"
        row["info"] = _ICMP_TYPES.get(int(ic.type), f"type {ic.type}") + f" (code {ic.code})"
        row["meta"].update(icmp_type=int(ic.type), icmp_code=int(ic.code))
        return row

    if pkt.haslayer(TCP):
        t = pkt[TCP]
        payload = bytes(t.payload)
        row.update(protocol="TCP", sport=int(t.sport), dport=int(t.dport), flags=str(t.flags))
        row["meta"].update(seq=int(t.seq), ack=int(t.ack), window=int(t.window),
                           payload_len=len(payload))
        if pkt.haslayer(DNS):
            row["protocol"] = "DNS"
            row["info"], row["meta"]["dns"] = _dns_meta(pkt[DNS])
            return row
        http = parse_http(payload)
        if http:
            row["protocol"] = "HTTP"
            row["meta"]["http"] = http
            row["info"] = (f"{http['method']} {http.get('host') or ''}{http['path']}"
                           if http["kind"] == "request" else f"{http['status']} {http['reason']}")
            return row
        tls = parse_tls(payload)
        if tls:
            row["protocol"] = "TLS"
            row["meta"]["tls"] = tls
            row["info"] = f"{tls['version']} {tls['handshake'] or tls['record']}" + (
                f" · SNI {tls['sni']}" if tls.get("sni") else "")
            return row
        if payload and 443 in (row["sport"], row["dport"]):
            row["protocol"] = "TLS"
            row["info"] = "Encrypted segment (continuation)"
            return row
        row["info"] = f"{row['sport']} → {row['dport']} [{row['flags']}] len={len(payload)}"
        return row

    if pkt.haslayer(UDP):
        u = pkt[UDP]
        row.update(protocol="UDP", sport=int(u.sport), dport=int(u.dport))
        if pkt.haslayer(DNS):
            row["protocol"] = "DNS"
            row["info"], row["meta"]["dns"] = _dns_meta(pkt[DNS])
            return row
        plen = len(bytes(u.payload))
        row["meta"]["payload_len"] = plen
        if 443 in (row["sport"], row["dport"]):
            row["info"] = f"QUIC / encrypted datagram len={plen}"
        else:
            row["info"] = f"{row['sport']} → {row['dport']} len={plen}"
        return row

    row["info"] = pkt.summary()[:160]
    return row


class CaptureService:
    MAX_BUFFER = 5000

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sniffer: Any = None
        self._buffer: deque[dict] = deque(maxlen=self.MAX_BUFFER)
        self._seq = 0
        self.session = 0
        self.iface: Optional[str] = None
        self.bpf: Optional[str] = None
        self.started_at: Optional[float] = None
        self.stopped_at: Optional[float] = None
        self.last_error: Optional[str] = None
        self._reset_stats()

    SIZE_BUCKETS = [(0, 63), (64, 127), (128, 255), (256, 511), (512, 1023),
                    (1024, 1517), (1518, 1 << 30)]
    IO_WINDOW = 300  # seconds of I/O timeline kept

    def _reset_stats(self) -> None:
        self.packets = 0
        self.bytes = 0
        self.protocols: Counter[str] = Counter()
        self.talkers: Counter[str] = Counter()
        # qui parle à qui — one row per bidirectional flow
        self.convos: dict[tuple, dict] = {}
        # per-IP totals
        self.hosts: dict[str, dict] = {}
        # per-second I/O buckets {second: [packets, bytes]}
        self.io: dict[int, list[int]] = {}
        # packet-length histogram
        self.sizes: list[int] = [0] * len(self.SIZE_BUCKETS)

    @staticmethod
    def _convo_key(row: dict) -> tuple:
        a = (row["src"], row["sport"])
        b = (row["dst"], row["dport"])
        return (a, b) if a <= b else (b, a)

    def _track(self, row: dict) -> None:
        """Update aggregate statistics for one packet (called under lock)."""
        length = row["length"]
        self.packets += 1
        self.bytes += length
        self.protocols[row["protocol"]] += 1

        # size histogram
        for i, (lo, hi) in enumerate(self.SIZE_BUCKETS):
            if lo <= length <= hi:
                self.sizes[i] += 1
                break

        # I/O timeline
        sec = int(row["t"])
        bucket = self.io.get(sec)
        if bucket is None:
            bucket = self.io[sec] = [0, 0]
            if len(self.io) > self.IO_WINDOW:
                for old in sorted(self.io)[:-self.IO_WINDOW]:
                    self.io.pop(old, None)
        bucket[0] += 1
        bucket[1] += length

        src, dst = row["src"], row["dst"]
        if src:
            self.talkers[src] += length
            h = self.hosts.get(src) or self.hosts.setdefault(
                src, {"packets": 0, "bytes": 0, "sent": 0, "recv": 0, "protocols": set()})
            h["packets"] += 1; h["bytes"] += length; h["sent"] += length
            h["protocols"].add(row["protocol"])
        if dst:
            h = self.hosts.get(dst) or self.hosts.setdefault(
                dst, {"packets": 0, "bytes": 0, "sent": 0, "recv": 0, "protocols": set()})
            h["packets"] += 1; h["bytes"] += length; h["recv"] += length
            h["protocols"].add(row["protocol"])

        # conversations (bidirectional)
        if src and dst:
            key = self._convo_key(row)
            c = self.convos.get(key)
            if c is None:
                (a_ip, a_port), (b_ip, b_port) = key
                c = self.convos[key] = {
                    "a_ip": a_ip, "a_port": a_port, "b_ip": b_ip, "b_port": b_port,
                    "protocol": row["protocol"], "packets": 0, "bytes": 0,
                    "a_to_b": 0, "b_to_a": 0, "first": row["t"], "last": row["t"],
                }
            c["packets"] += 1
            c["bytes"] += length
            c["last"] = row["t"]
            if row["protocol"] not in ("TCP", "UDP", "ARP", "OTHER"):
                c["protocol"] = row["protocol"]  # prefer an application protocol
            if (row["src"], row["sport"]) == key[0]:
                c["a_to_b"] += 1
            else:
                c["b_to_a"] += 1

    @property
    def running(self) -> bool:
        return self._sniffer is not None

    # ------------------------------------------------------------------ ifaces
    def interfaces(self) -> list[dict]:
        try:
            from scapy.all import conf
        except Exception:
            return []
        out = []
        for i in conf.ifaces.values():
            ident = getattr(i, "network_name", None) or i.name
            out.append({
                "id": ident,
                "name": i.name,
                "description": getattr(i, "description", None),
                "ip": getattr(i, "ip", None) or None,
                "mac": getattr(i, "mac", None) or None,
            })
        return out

    # --------------------------------------------------------------- lifecycle
    def start(self, iface: Optional[str], bpf: Optional[str]) -> dict:
        if self.running:
            raise CaptureError("A capture is already running. Stop it first.")
        caps = detect()
        if not caps.scapy.available:
            raise CaptureError("Packet capture needs scapy (pip install scapy).")
        if not caps.pcap.available:
            raise CaptureError("No capture driver found. On Windows install Npcap from npcap.com.")
        from scapy.all import AsyncSniffer

        with self._lock:
            self._buffer.clear()
            self._seq = 0
            self._reset_stats()
            self.session += 1
        self.iface, self.bpf, self.last_error = iface or None, bpf or None, None

        try:
            sniffer = AsyncSniffer(iface=self.iface, filter=self.bpf,
                                   prn=self._on_packet, store=False)
            sniffer.start()
        except Exception as exc:
            raise CaptureError(self._explain(exc)) from exc

        time.sleep(0.7)  # let the sniffer thread open its socket
        exc = getattr(sniffer, "exception", None)
        if exc is not None:
            raise CaptureError(self._explain(exc))
        self._sniffer = sniffer
        self.started_at, self.stopped_at = time.time(), None
        log.info("capture started iface=%s bpf=%s", self.iface, self.bpf)
        return self.stats()

    @staticmethod
    def _explain(exc: Exception) -> str:
        text = str(exc)
        low = text.lower()
        if isinstance(exc, PermissionError) or "permission" in low or "not permitted" in low:
            return "Capture requires administrator privileges. Restart 0xFLUX as Administrator (or with sudo)."
        if "filter" in low or "syntax" in low:
            return f"Invalid BPF filter: {text}"
        return f"Could not start capture: {text}"

    def stop(self) -> dict:
        sniffer, self._sniffer = self._sniffer, None
        if sniffer is not None:
            try:
                sniffer.stop()
            except Exception as exc:  # stop() raises if the thread already died
                log.warning("sniffer stop: %s", exc)
            self.stopped_at = time.time()
        return self.stats()

    def clear(self) -> None:
        with self._lock:
            self._buffer.clear()
            self._reset_stats()
            self.session += 1
            self._seq = 0

    # ------------------------------------------------------------------ data
    def _on_packet(self, pkt: Any) -> None:
        try:
            row = summarize(pkt)
        except Exception:
            return
        with self._lock:
            self._seq += 1
            row["id"] = self._seq
            row["t"] = float(getattr(pkt, "time", time.time()))
            self._buffer.append(row)
            self._track(row)

    def since(self, seq: int, limit: int = 500) -> list[dict]:
        with self._lock:
            rows = [r for r in self._buffer if r["id"] > seq]
        return rows[-limit:]

    def stats(self) -> dict:
        end = self.stopped_at or time.time()
        with self._lock:
            return {
                "running": self.running,
                "session": self.session,
                "iface": self.iface,
                "bpf": self.bpf,
                "started_at": self.started_at,
                "duration_s": round(end - self.started_at, 1) if self.started_at else None,
                "packets": self.packets,
                "bytes": self.bytes,
                "protocols": dict(self.protocols),
                "top_talkers": self.talkers.most_common(8),
                "convo_count": len(self.convos),
                "host_count": len(self.hosts),
                "error": self.last_error,
            }

    # ---------------------------------------------------------------- analytics
    def conversations(self, limit: int = 300) -> list[dict]:
        with self._lock:
            rows = sorted(self.convos.values(), key=lambda c: c["bytes"], reverse=True)[:limit]
            return [{**c, "duration": round(c["last"] - c["first"], 3)} for c in rows]

    def endpoints(self, limit: int = 300) -> list[dict]:
        with self._lock:
            rows = sorted(self.hosts.items(), key=lambda kv: kv[1]["bytes"], reverse=True)[:limit]
            return [{"ip": ip, "packets": h["packets"], "bytes": h["bytes"],
                     "sent": h["sent"], "recv": h["recv"],
                     "protocols": sorted(h["protocols"])} for ip, h in rows]

    def io_timeline(self) -> list[dict]:
        with self._lock:
            return [{"t": sec, "packets": pb[0], "bytes": pb[1]}
                    for sec, pb in sorted(self.io.items())]

    def size_distribution(self) -> list[dict]:
        labels = ["0–63", "64–127", "128–255", "256–511", "512–1023", "1024–1517", "1518+"]
        with self._lock:
            total = sum(self.sizes) or 1
            return [{"range": labels[i], "count": n, "pct": round(n / total * 100, 1)}
                    for i, n in enumerate(self.sizes)]

    def protocol_hierarchy(self) -> list[dict]:
        with self._lock:
            total = sum(self.protocols.values()) or 1
            items = sorted(self.protocols.items(), key=lambda kv: kv[1], reverse=True)
            return [{"protocol": p, "packets": n, "pct": round(n / total * 100, 1)} for p, n in items]

    def export_rows(self) -> list[dict]:
        with self._lock:
            return list(self._buffer)


capture = CaptureService()

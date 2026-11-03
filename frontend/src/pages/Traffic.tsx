import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Page } from "../components/Page";
import { Card, CardHead, Empty, useToast } from "../components/ui";
import { IconPlay, IconStop, IconTrash } from "../components/icons";
import { ProtocolBars } from "../components/ProtocolBars";
import { api, wsUrl, type CaptureIface, type CaptureStatus, type Packet } from "../lib/api";
import { useCaps } from "../lib/caps";
import { useMode } from "../lib/mode";
import { bytes } from "../lib/format";

const PROTOS = ["ALL", "TCP", "UDP", "DNS", "HTTP", "TLS", "ICMP", "ARP"];
const MAX_ROWS = 4000;
const RENDER_ROWS = 600;

function endpoint(ip: string | null, port: number | null): string {
  if (!ip) return "—";
  if (port == null) return ip;
  return ip.includes(":") ? `[${ip}]:${port}` : `${ip}:${port}`;
}

export default function Traffic() {
  const { caps } = useCaps();
  const { advanced } = useMode();
  const toast = useToast();
  const canCapture = !!(caps?.scapy.available && caps?.pcap.available);

  const [ifaces, setIfaces] = useState<CaptureIface[]>([]);
  const [iface, setIface] = useState("");
  const [bpf, setBpf] = useState("");
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [selected, setSelected] = useState<Packet | null>(null);
  const [proto, setProto] = useState("ALL");
  const [ipFilter, setIpFilter] = useState("");
  const [portFilter, setPortFilter] = useState("");
  const [follow, setFollow] = useState(true);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canCapture) return;
    api.captureInterfaces().then((r) => {
      setIfaces(r.interfaces);
      const preferred = r.interfaces.find((i) => i.ip && !i.ip.startsWith("127.") && !i.ip.startsWith("169.254"));
      setIface((cur) => cur || preferred?.id || r.interfaces[0]?.id || "");
    }).catch(() => {});

    const ws = new WebSocket(wsUrl("/capture/ws?since=0"));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "reset") { setPackets([]); setSelected(null); }
      if (m.packets?.length) {
        setPackets((prev) => {
          const next = prev.concat(m.packets as Packet[]);
          return next.length > MAX_ROWS ? next.slice(next.length - MAX_ROWS) : next;
        });
      }
      if (m.stats) {
        setStatus(m.stats);
        if (m.stats.running && m.stats.iface) setIface(m.stats.iface);
      }
    };
    return () => ws.close();
  }, [canCapture]);

  const filtered = useMemo(() => {
    const ip = ipFilter.trim();
    const port = parseInt(portFilter, 10);
    return packets.filter((p) =>
      (proto === "ALL" || p.protocol === proto) &&
      (!ip || p.src?.includes(ip) || p.dst?.includes(ip)) &&
      (Number.isNaN(port) || p.sport === port || p.dport === port));
  }, [packets, proto, ipFilter, portFilter]);

  const visible = filtered.length > RENDER_ROWS ? filtered.slice(filtered.length - RENDER_ROWS) : filtered;

  useEffect(() => {
    if (follow && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visible.length, follow]);

  async function start() {
    setBusy(true);
    try {
      const s = await api.captureStart(iface || null, advanced && bpf.trim() ? bpf.trim() : null);
      setStatus(s);
      setFollow(true);
      toast("ok", "Capture started.");
    } catch (e: any) {
      toast("err", e.message);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try { setStatus(await api.captureStop()); } catch (e: any) { toast("err", e.message); } finally { setBusy(false); }
  }

  async function clear() {
    await api.captureClear().then(setStatus).catch((e) => toast("err", e.message));
    setPackets([]);
    setSelected(null);
  }

  if (!canCapture) return <CaptureUnavailable />;

  const running = !!status?.running;
  const t0 = status?.started_at ?? packets[0]?.t ?? null;
  const pps = status?.duration_s ? status.packets / status.duration_s : null;

  return (
    <Page title="Traffic Analyzer" sub="Live packet metadata — payloads are never decrypted or stored."
      actions={
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={clear} disabled={busy || !packets.length}><IconTrash /> Clear</button>
          {running
            ? <button className="btn btn-danger" onClick={stop} disabled={busy}><IconStop /> Stop capture</button>
            : <button className="btn btn-primary" onClick={start} disabled={busy || !ifaces.length}><IconPlay /> Start capture</button>}
        </div>
      }>
      <Card className="mb">
        <div className="card-pad toolbar">
          <div className="field" style={{ minWidth: 220, flex: 1 }}>
            <label>Interface</label>
            <select className="select" value={iface} disabled={running} onChange={(e) => setIface(e.target.value)}>
              {ifaces.map((i) => (
                <option key={i.id} value={i.id}>{(i.description || i.name) + (i.ip ? ` — ${i.ip}` : "")}</option>
              ))}
            </select>
          </div>
          {advanced && (
            <div className="field" style={{ minWidth: 220, flex: 1 }}>
              <label>Capture filter (BPF)</label>
              <input className="input mono" placeholder="tcp port 443 or udp port 53" value={bpf}
                disabled={running} onChange={(e) => setBpf(e.target.value)} />
            </div>
          )}
          <div className="field" style={{ width: 160 }}>
            <label>IP contains</label>
            <input className="input mono" placeholder="192.168." value={ipFilter} onChange={(e) => setIpFilter(e.target.value)} />
          </div>
          <div className="field" style={{ width: 100 }}>
            <label>Port</label>
            <input className="input mono" placeholder="443" inputMode="numeric" value={portFilter}
              onChange={(e) => setPortFilter(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        <div className="card-pad" style={{ paddingTop: 0 }}>
          <div className="seg">
            {PROTOS.map((p) => (
              <button key={p} className={proto === p ? "on" : ""} onClick={() => setProto(p)}>
                {p === "ALL" ? "All" : p}
                {p !== "ALL" && status?.protocols[p] ? <span className="seg-count">{status.protocols[p]}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid stats-4 mb">
        <StatTile label="Packets" value={status ? status.packets.toLocaleString() : "—"} live={running} />
        <StatTile label="Data captured" value={status ? bytes(status.bytes) : "—"} />
        <StatTile label="Rate" value={pps != null ? `${pps.toFixed(1)} pkt/s` : "—"} />
        <StatTile label="Shown" value={`${filtered.length.toLocaleString()}${filtered.length > RENDER_ROWS ? ` (last ${RENDER_ROWS})` : ""}`} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 330px", alignItems: "start" }}>
        <Card>
          <div ref={scrollRef} className="pkt-scroll"
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
              if (atBottom !== follow) setFollow(atBottom);
            }}>
            {visible.length === 0 ? (
              <Empty title={running ? "Waiting for packets" : "No packets captured"}>
                {running ? "Traffic matching your filters will stream in here." : "Choose an interface and start a capture."}
              </Empty>
            ) : (
              <table className="table table-dense">
                <thead>
                  <tr><th style={{ width: 70 }}>Time</th><th>Source</th><th>Destination</th><th style={{ width: 64 }}>Proto</th><th style={{ width: 60 }}>Len</th><th>Info</th></tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.id} className={selected?.id === p.id ? "sel" : ""} onClick={() => setSelected(p)}>
                      <td className="num muted">{t0 ? (p.t - t0).toFixed(3) : "—"}</td>
                      <td className="num">{endpoint(p.src, p.sport)}</td>
                      <td className="num">{endpoint(p.dst, p.dport)}</td>
                      <td className="mono">{p.protocol}</td>
                      <td className="num muted">{p.length}</td>
                      <td className="ellipsis">{p.info}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!follow && visible.length > 0 && (
            <div className="follow-bar">
              <button className="btn btn-sm" onClick={() => setFollow(true)}>Jump to latest</button>
            </div>
          )}
        </Card>

        <div className="col">
          <Card>
            <CardHead title="Packet details" />
            <div className="card-pad">
              {selected ? <PacketDetail p={selected} advanced={advanced} t0={t0} /> : (
                <p className="muted small">Select a packet to inspect its metadata.</p>
              )}
            </div>
          </Card>
          <Card>
            <CardHead title="Protocols" hint="click to filter" />
            <div className="card-pad">
              <ProtocolBars protocols={status?.protocols ?? {}} active={proto}
                onPick={(p) => setProto((cur) => (cur === p ? "ALL" : p))} />
            </div>
          </Card>
          {advanced && (
            <Card>
              <CardHead title="Top talkers" hint="by bytes sent" />
              {status?.top_talkers.length ? (
                <table className="table table-dense">
                  <tbody>
                    {status.top_talkers.map(([ip, b]) => (
                      <tr key={ip} onClick={() => setIpFilter(ip)} style={{ cursor: "pointer" }}>
                        <td className="num">{ip}</td><td className="num muted" style={{ textAlign: "right" }}>{bytes(b)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="card-pad muted small">No traffic yet.</div>}
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function StatTile({ label, value, live }: { label: string; value: string; live?: boolean }) {
  return (
    <Card>
      <div className="stat">
        <div className="label" style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {live && <span className="cap-dot on pulse" />}{label}
        </div>
        <div className={`value mono ${value === "—" ? "na" : ""}`}>{value}</div>
      </div>
    </Card>
  );
}

function PacketDetail({ p, advanced, t0 }: { p: Packet; advanced: boolean; t0: number | null }) {
  const m = p.meta ?? {};
  return (
    <div className="col" style={{ gap: 14 }}>
      <dl className="kv kv-tight">
        <dt>No.</dt><dd>{p.id}</dd>
        <dt>Time</dt><dd>{new Date(p.t * 1000).toLocaleTimeString()}{t0 ? ` (+${(p.t - t0).toFixed(3)}s)` : ""}</dd>
        <dt>Protocol</dt><dd>{p.protocol}</dd>
        <dt>Source</dt><dd>{endpoint(p.src, p.sport)}</dd>
        <dt>Destination</dt><dd>{endpoint(p.dst, p.dport)}</dd>
        <dt>Length</dt><dd>{p.length} bytes</dd>
        {p.flags && <><dt>TCP flags</dt><dd>{p.flags}</dd></>}
        {m.ttl != null && <><dt>{m.ip_version === 6 ? "Hop limit" : "TTL"}</dt><dd>{m.ttl}</dd></>}
        {advanced && m.seq != null && <><dt>Seq / Ack</dt><dd>{m.seq} / {m.ack}</dd></>}
        {advanced && m.window != null && <><dt>Window</dt><dd>{m.window}</dd></>}
        {m.payload_len != null && <><dt>Payload</dt><dd>{m.payload_len} bytes (not stored)</dd></>}
      </dl>

      {m.dns && (
        <Section title="DNS">
          <dt>Kind</dt><dd>{m.dns.kind}</dd>
          <dt>Name</dt><dd>{m.dns.qname ?? "—"}</dd>
          <dt>Type</dt><dd>{m.dns.qtype ?? "—"}</dd>
          {m.dns.answers?.length > 0 && <><dt>Answers</dt><dd>{m.dns.answers.join(", ")}</dd></>}
          {m.dns.kind === "response" && <><dt>Rcode</dt><dd>{m.dns.rcode}</dd></>}
        </Section>
      )}
      {m.http && (
        <Section title="HTTP">
          {m.http.kind === "request" ? (
            <>
              <dt>Request</dt><dd>{m.http.method} {m.http.path}</dd>
              <dt>Host</dt><dd>{m.http.host ?? "—"}</dd>
              <dt>Version</dt><dd>{m.http.version}</dd>
              {advanced && m.http.user_agent && <><dt>User-Agent</dt><dd>{m.http.user_agent}</dd></>}
            </>
          ) : (
            <>
              <dt>Status</dt><dd>{m.http.status} {m.http.reason}</dd>
              <dt>Server</dt><dd>{m.http.server ?? "—"}</dd>
              <dt>Content-Type</dt><dd>{m.http.content_type ?? "—"}</dd>
            </>
          )}
        </Section>
      )}
      {m.tls && (
        <Section title="TLS">
          <dt>Record</dt><dd>{m.tls.record}</dd>
          <dt>Version</dt><dd>{m.tls.version}</dd>
          {m.tls.handshake && <><dt>Handshake</dt><dd>{m.tls.handshake}</dd></>}
          {m.tls.sni && <><dt>Server name</dt><dd>{m.tls.sni}</dd></>}
        </Section>
      )}
      {p.protocol === "ARP" && (
        <Section title="ARP">
          <dt>Operation</dt><dd>{m.op}</dd>
          <dt>Sender MAC</dt><dd>{m.hwsrc}</dd>
          <dt>Target MAC</dt><dd>{m.hwdst}</dd>
        </Section>
      )}
      <p className="muted small">{p.info}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="section-title">{title}</div>
      <dl className="kv kv-tight">{children}</dl>
    </div>
  );
}

function CaptureUnavailable() {
  const { caps, refresh } = useCaps();
  const win = caps?.os === "Windows";
  return (
    <Page title="Traffic Analyzer" sub="Packet capture and protocol analysis."
      actions={<button className="btn btn-sm" onClick={refresh}>Re-detect</button>}>
      <Card>
        <CardHead title="Capture is not available on this machine yet" />
        <div className="card-pad">
          <ol className="steps">
            <li className={caps?.pcap.available ? "done" : ""}>
              {win ? "Install Npcap from npcap.com (keep “WinPcap API-compatible mode” checked)." : "Install libpcap (e.g. apt install libpcap0.8)."}
              <span className="muted small"> — {caps?.pcap.detail ?? "unknown"}</span>
            </li>
            <li className={caps?.scapy.available ? "done" : ""}>
              Install scapy in the backend environment: <span className="mono">pip install scapy</span>
              <span className="muted small"> — {caps?.scapy.detail ?? "unknown"}</span>
            </li>
            <li className={caps?.is_admin ? "done" : ""}>
              {win ? "Run 0xFLUX as Administrator." : "Run the backend with sudo or grant CAP_NET_RAW."}
              <span className="muted small"> — currently {caps?.is_admin ? "elevated" : "standard user"}</span>
            </li>
          </ol>
          <p className="muted small" style={{ marginTop: 14 }}>
            0xFLUX only reads packet metadata (addresses, ports, protocols, sizes, flags, DNS names,
            TLS server names). It never decrypts TLS or stores payloads.
          </p>
        </div>
      </Card>
    </Page>
  );
}

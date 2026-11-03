import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Page } from "../components/Page";
import { Card, CardHead, Chip, Empty } from "../components/ui";
import {
  api, wsUrl, type Device, type Interface, type LatencySummary, type MonitorSample, type ScanSummary,
} from "../lib/api";
import { useCaps } from "../lib/caps";
import { bps, dateTime, ms, relTime, stateClass } from "../lib/format";

export default function Overview() {
  const { caps } = useCaps();
  const [sample, setSample] = useState<MonitorSample | null>(null);
  const [activity, setActivity] = useState<{ t: number; v: number }[]>([]);
  const [scans, setScans] = useState<ScanSummary[] | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [iface, setIface] = useState<Interface | null | undefined>(undefined);
  const [lat, setLat] = useState<LatencySummary | null>(null);

  useEffect(() => {
    api.history().then((r) => setScans(r.scans)).catch(() => setScans([]));
    api.inventory().then((r) => setDevices(r.devices)).catch(() => setDevices([]));
    Promise.all([api.interfaces(), api.discoveryContext()]).then(([r, ctx]) => {
      const active = r.interfaces.find((i) => i.name === ctx.interface)
        ?? r.interfaces.find((i) => i.is_up && i.ipv4 && !i.ipv4.startsWith("127.")) ?? null;
      setIface(active);
    }).catch(() => setIface(null));
    const loadLat = () => api.latency().then((r) => setLat(r.summary)).catch(() => {});
    loadLat();
    const id = setInterval(loadLat, 5000);

    const ws = new WebSocket(wsUrl("/monitor/ws"));
    ws.onmessage = (ev) => {
      const m: MonitorSample = JSON.parse(ev.data);
      setSample(m);
      setActivity((a) => [...a.slice(-59), { t: m.timestamp, v: (m.download_bps ?? 0) + (m.upload_bps ?? 0) }]);
    };
    return () => { ws.close(); clearInterval(id); };
  }, []);

  const completed = scans?.filter((s) => s.status === "completed") ?? [];
  const hosts = completed.reduce((a, s) => a + s.hosts_up, 0);
  const open = completed.reduce((a, s) => a + s.ports_open, 0);
  const onlineDevices = devices?.length ?? null;
  const netStatus = lat == null ? "—" : lat.samples === 0 ? "—" : lat.avg_ms != null ? "online" : "no connectivity";

  return (
    <Page title="Overview" sub="Network status at a glance.">
      <div className="grid stats-4 mb">
        <Stat label="Network status" value={netStatus}
          tone={netStatus === "online" ? "open" : netStatus === "no connectivity" ? "down" : undefined}
          hint={lat?.loss_pct != null ? `${lat.loss_pct}% probe loss` : undefined} />
        <Stat label="Active interface" value={iface === undefined ? "—" : iface?.name ?? "none"} mono
          hint={iface?.ipv4 ?? undefined} />
        <Stat label="Download" value={bps(sample?.download_bps)} mono />
        <Stat label="Upload" value={bps(sample?.upload_bps)} mono />
      </div>
      <div className="grid stats-4 mb">
        <Stat label="Known devices" value={onlineDevices == null ? "—" : String(onlineDevices)}
          hint={onlineDevices === 0 ? "run Network Discovery" : undefined} />
        <Stat label="Hosts discovered" value={scans == null ? "—" : String(hosts)} hint="across completed scans" />
        <Stat label="Open ports found" value={scans == null ? "—" : String(open)} hint="across completed scans" />
        <Stat label="Average latency" value={ms(lat?.avg_ms)} mono hint={lat ? `to ${lat.target}` : undefined} />
      </div>

      <Card className="mb">
        <CardHead title="Network activity" hint="combined throughput, last 60 s" />
        <div className="card-pad chart-120">
          {activity.length < 3 ? <Empty title="Collecting samples" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gAct" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={[0, "dataMax"]} />
                <Area type="monotone" dataKey="v" stroke="#fff" strokeWidth={1.25} fill="url(#gAct)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", alignItems: "start" }}>
        <Card>
          <CardHead title="Recent scans" right={<Link className="btn btn-ghost btn-sm" to="/history">View all</Link>} />
          {scans == null ? <Empty title="Loading…" /> : scans.length === 0 ? (
            <Empty title="No scans yet"><Link className="link" to="/scanner">Run your first scan</Link> to populate this view.</Empty>
          ) : (
            <table className="table">
              <thead><tr><th>Target</th><th>Status</th><th>Hosts</th><th>Open</th><th>When</th></tr></thead>
              <tbody>
                {scans.slice(0, 6).map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{s.target}</td>
                    <td><Chip state={stateClass(s.status)}>{s.status}</Chip></td>
                    <td className="num">{s.hosts_up}</td>
                    <td className="num">{s.ports_open}</td>
                    <td className="muted small">{dateTime(s.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <CardHead title="Environment" right={<Link className="btn btn-ghost btn-sm" to="/settings">Details</Link>} />
          <div className="card-pad">
            <dl className="kv kv-tight">
              <dt>System</dt><dd>{caps ? `${caps.os} ${caps.os_release}` : "—"}</dd>
              <dt>Privileges</dt><dd>{caps ? (caps.is_admin ? "administrator" : "standard user") : "—"}</dd>
              <dt>Scan engine</dt><dd>{caps ? (caps.nmap.available ? "nmap" : "python (built-in)") : "—"}</dd>
              <dt>Packet capture</dt>
              <dd style={{ color: caps?.pcap.available && caps?.scapy.available ? "var(--state-open)" : "var(--text-muted)" }}>
                {caps ? (caps.pcap.available && caps.scapy.available ? "available" : "unavailable") : "—"}
              </dd>
            </dl>
            {devices && devices.length > 0 && (
              <>
                <div className="divider" style={{ margin: "14px 0" }} />
                <div className="muted small" style={{ marginBottom: 6 }}>Most recently seen device</div>
                <div className="mono small">
                  {[...devices].sort((a, b) => b.last_seen.localeCompare(a.last_seen))[0].ip} · {relTime([...devices].sort((a, b) => b.last_seen.localeCompare(a.last_seen))[0].last_seen)}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
}

function Stat({ label, value, mono, hint, tone }: { label: string; value: string; mono?: boolean; hint?: string; tone?: "open" | "down" }) {
  const na = value === "—";
  return (
    <Card>
      <div className="stat">
        <div className="label">{label}</div>
        <div className={`value ${mono ? "mono" : ""} ${na ? "na" : ""}`}
          style={tone ? { color: tone === "open" ? "var(--state-open)" : "var(--state-down)" } : undefined}>{value}</div>
        {hint && <div className="delta">{hint}</div>}
      </div>
    </Card>
  );
}

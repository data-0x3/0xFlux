import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Page } from "../components/Page";
import { useI18n } from "../lib/i18n";
import { Card, CardHead, Empty } from "../components/ui";
import { ProtocolBars } from "../components/ProtocolBars";
import {
  api, wsUrl, type CaptureStatus, type Connections, type Interface, type LatencyPoint,
  type LatencySummary, type MonitorSample,
} from "../lib/api";
import { useMode } from "../lib/mode";
import { bps, bytes, ms } from "../lib/format";

interface Point { t: number; down: number | null; up: number | null; }

const tooltipStyle = {
  contentStyle: { background: "#161616", border: "1px solid #333", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "#929292" },
  itemStyle: { color: "#fff" },
};
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString();

export default function Monitor() {
  const { t } = useI18n();
  const { advanced } = useMode();
  const [sample, setSample] = useState<MonitorSample | null>(null);
  const [series, setSeries] = useState<Point[]>([]);
  const [lat, setLat] = useState<LatencyPoint[]>([]);
  const [latSummary, setLatSummary] = useState<LatencySummary | null>(null);
  const [ifaces, setIfaces] = useState<Interface[]>([]);
  const [conns, setConns] = useState<Connections | null>(null);
  const [capture, setCapture] = useState<CaptureStatus | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    api.interfaces().then((r) => setIfaces(r.interfaces)).catch(() => {});
    const ws = new WebSocket(wsUrl("/monitor/ws"));
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      const m: MonitorSample = JSON.parse(ev.data);
      setSample(m);
      setSeries((s) => [...s.slice(-119), { t: m.timestamp, down: m.download_bps, up: m.upload_bps }]);
    };

    const slow = () => {
      api.latency().then((r) => { setLat(r.history.slice(-150)); setLatSummary(r.summary); }).catch(() => {});
      api.connections().then(setConns).catch(() => {});
      api.captureStatus().then(setCapture).catch(() => setCapture(null));
    };
    slow();
    const id = setInterval(slow, 4000);
    return () => { ws.close(); clearInterval(id); };
  }, []);

  const totalBw = series.reduce((s, p) => s + (p.down ?? 0) + (p.up ?? 0), 0);

  return (
    <Page title={t("monitor.title")} sub={connected ? "Live — system counters sampled every second." : "Connecting to the monitor…"}>
      <div className="grid stats-4 mb">
        <Stat label="Download" value={bps(sample?.download_bps)} />
        <Stat label="Upload" value={bps(sample?.upload_bps)} />
        <Stat label="Latency" value={ms(sample?.latency_ms)} hint={latSummary ? `to ${latSummary.target}` : undefined} />
        <Stat label={`Transferred (last ${series.length}s)`} value={series.length ? bytes(totalBw) : "—"} />
      </div>

      <Card className="mb">
        <CardHead title="Throughput" hint="download (white) · upload (grey) — real interface deltas" />
        <div className="card-pad chart-240">
          {series.length < 3 ? (
            <Empty title="Collecting samples">The chart starts after a few seconds of measurements.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -6 }}>
                <defs>
                  <linearGradient id="gDown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tickFormatter={clock} tick={{ fill: "#606060", fontSize: 10 }} stroke="#252525" minTickGap={60} />
                <YAxis tickFormatter={(v) => bps(v)} width={70} tick={{ fill: "#606060", fontSize: 10 }} stroke="#252525" />
                <Tooltip {...tooltipStyle} labelFormatter={(t) => clock(t as number)}
                  formatter={(v: any, n) => [bps(v as number), n === "down" ? "Download" : "Upload"]} />
                <Area type="monotone" dataKey="down" stroke="#ffffff" strokeWidth={1.5} fill="url(#gDown)" isAnimationActive={false} connectNulls />
                <Area type="monotone" dataKey="up" stroke="#7a7a7a" strokeWidth={1.25} fill="none" isAnimationActive={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid cols-2 mb">
        <Card>
          <CardHead title="Latency history"
            hint={latSummary?.avg_ms != null
              ? `avg ${ms(latSummary.avg_ms)} · min ${ms(latSummary.min_ms)} · max ${ms(latSummary.max_ms)} · loss ${latSummary.loss_pct}%`
              : "TCP handshake time"} />
          <div className="card-pad chart-200">
            {lat.length < 2 ? (
              <Empty title="Measuring">Latency is probed every 2 seconds.</Empty>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lat} margin={{ top: 4, right: 4, bottom: 0, left: -6 }}>
                  <XAxis dataKey="t" tickFormatter={clock} tick={{ fill: "#606060", fontSize: 10 }} stroke="#252525" minTickGap={60} />
                  <YAxis tickFormatter={(v) => `${v} ms`} width={56} tick={{ fill: "#606060", fontSize: 10 }} stroke="#252525" />
                  <Tooltip {...tooltipStyle} labelFormatter={(t) => clock(t as number)}
                    formatter={(v: any) => [v == null ? "timeout" : ms(v as number), "Latency"]} />
                  <Line type="monotone" dataKey="ms" stroke="#ffffff" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Protocol distribution" hint={capture?.running ? "from the live capture" : undefined} />
          <div className="card-pad">
            {capture && capture.packets > 0 ? (
              <ProtocolBars protocols={capture.protocols} />
            ) : (
              <Empty title="No capture data">
                Protocol distribution comes from packet capture. <Link to="/traffic" className="link">Start a capture</Link> to see it here.
              </Empty>
            )}
          </div>
        </Card>
      </div>

      <div className="grid cols-2">
        <Card>
          <CardHead title="Connections" hint={conns?.ok ? `${conns.total} sockets` : undefined} />
          <div className="card-pad">
            {!conns ? <p className="muted small">Loading…</p> : !conns.ok ? (
              <p className="muted small">{conns.error}</p>
            ) : (
              <div className="conn-grid">
                {Object.entries(conns.by_status ?? {}).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                  <div key={s} className="conn-cell"><span className="mono">{n}</span><span className="muted small">{s.toLowerCase().replace(/_/g, " ")}</span></div>
                ))}
              </div>
            )}
          </div>
          {advanced && conns?.ok && (conns.established?.length ?? 0) > 0 && (
            <div className="scroll-240">
              <table className="table table-dense">
                <thead><tr><th>Remote</th><th>Local</th><th>State</th><th>Process</th></tr></thead>
                <tbody>
                  {conns.established!.slice(0, 60).map((c, i) => (
                    <tr key={i}>
                      <td className="num">{c.raddr}</td>
                      <td className="num muted">{c.laddr ?? "—"}</td>
                      <td className="small">{c.status.toLowerCase()}</td>
                      <td className="small muted">{c.process ?? (c.pid ? `pid ${c.pid}` : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Interfaces & packets" />
          <table className="table table-dense">
            <thead><tr><th>Interface</th><th>Status</th><th>IPv4</th>{advanced && <th>MTU</th>}</tr></thead>
            <tbody>
              {ifaces.map((i) => (
                <tr key={i.name}>
                  <td className="mono">{i.name}</td>
                  <td style={{ color: i.is_up ? "var(--state-open)" : "var(--text-muted)" }}>{i.is_up ? "up" : "down"}</td>
                  <td className="num">{i.ipv4 ?? "—"}</td>
                  {advanced && <td className="num">{i.mtu}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-pad">
            <dl className="kv kv-tight">
              <dt>Packets in / out</dt><dd>{sample ? `${sample.packets_recv.toLocaleString()} / ${sample.packets_sent.toLocaleString()}` : "—"}</dd>
              <dt>Total in / out</dt><dd>{sample ? `${bytes(sample.total_recv)} / ${bytes(sample.total_sent)}` : "—"}</dd>
              {advanced && <><dt>Errors in / out</dt><dd>{sample ? `${sample.errors_in} / ${sample.errors_out}` : "—"}</dd></>}
              {advanced && <><dt>Drops in / out</dt><dd>{sample ? `${sample.drops_in} / ${sample.drops_out}` : "—"}</dd></>}
            </dl>
          </div>
        </Card>
      </div>
    </Page>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div className="stat">
        <div className="label">{label}</div>
        <div className={`value mono ${value === "—" ? "na" : ""}`}>{value}</div>
        {hint && <div className="delta">{hint}</div>}
      </div>
    </Card>
  );
}

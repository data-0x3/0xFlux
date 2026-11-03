import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Page } from "../components/Page";
import { Card, CardHead, Empty, useToast } from "../components/ui";
import { IconDownload, IconPlay, IconStop, IconTrash } from "../components/icons";
import {
  api, downloadCapture, wsUrl, type CaptureIface, type CaptureStatistics,
  type CaptureStatus, type Conversation, type Endpoint, type Packet,
} from "../lib/api";
import { useCaps } from "../lib/caps";
import { useI18n } from "../lib/i18n";
import { useMode } from "../lib/mode";
import { bytes } from "../lib/format";

const MAX_ROWS = 4000;
const RENDER_ROWS = 600;
type Tab = "packets" | "convos" | "endpoints" | "stats";

function endpoint(ip: string | null, port: number | null): string {
  if (!ip) return "—";
  if (port == null) return ip;
  return ip.includes(":") ? `[${ip}]:${port}` : `${ip}:${port}`;
}

/** A tiny, forgiving display-filter language: protocol names, `ip <substr>`,
 *  `port <n>`, or a bare substring matched against addresses and info. */
function makeFilter(expr: string): (p: Packet) => boolean {
  const t = expr.trim().toLowerCase();
  if (!t) return () => true;
  const terms = t.split(/\s+/);
  const protos = new Set(["tcp", "udp", "dns", "http", "tls", "icmp", "arp"]);
  const preds: ((p: Packet) => boolean)[] = [];
  for (let i = 0; i < terms.length; i++) {
    const w = terms[i];
    if (protos.has(w)) { preds.push((p) => p.protocol.toLowerCase() === w); }
    else if (w === "ip" && terms[i + 1]) { const v = terms[++i]; preds.push((p) => !!(p.src?.includes(v) || p.dst?.includes(v))); }
    else if (w === "port" && terms[i + 1]) { const n = parseInt(terms[++i], 10); preds.push((p) => p.sport === n || p.dport === n); }
    else { preds.push((p) => (p.src ?? "").includes(w) || (p.dst ?? "").includes(w) || p.info.toLowerCase().includes(w)); }
  }
  return (p) => preds.every((f) => f(p));
}

export default function Traffic() {
  const { caps } = useCaps();
  if (!(caps?.scapy.available && caps?.pcap.available)) return <CaptureUnavailable />;
  return <TrafficLive />;
}

function TrafficLive() {
  const { t } = useI18n();
  const { advanced } = useMode();
  const toast = useToast();

  const [ifaces, setIfaces] = useState<CaptureIface[]>([]);
  const [iface, setIface] = useState("");
  const [bpf, setBpf] = useState("");
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [tab, setTab] = useState<Tab>("packets");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.captureInterfaces().then((r) => {
      setIfaces(r.interfaces);
      const pref = r.interfaces.find((i) => i.ip && !i.ip.startsWith("127.") && !i.ip.startsWith("169.254"));
      setIface((cur) => cur || pref?.id || r.interfaces[0]?.id || "");
    }).catch(() => {});

    const ws = new WebSocket(wsUrl("/capture/ws?since=0"));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "reset") setPackets([]);
      if (m.packets?.length) {
        setPackets((prev) => {
          const next = prev.concat(m.packets as Packet[]);
          return next.length > MAX_ROWS ? next.slice(next.length - MAX_ROWS) : next;
        });
      }
      if (m.stats) { setStatus(m.stats); if (m.stats.running && m.stats.iface) setIface(m.stats.iface); }
    };
    return () => ws.close();
  }, []);

  async function start() {
    setBusy(true);
    try {
      setStatus(await api.captureStart(iface || null, advanced && bpf.trim() ? bpf.trim() : null));
      toast("ok", t("tf.start"));
    } catch (e: any) { toast("err", e.message); } finally { setBusy(false); }
  }
  async function stop() {
    setBusy(true);
    try { setStatus(await api.captureStop()); } catch (e: any) { toast("err", e.message); } finally { setBusy(false); }
  }
  async function clear() {
    await api.captureClear().then(setStatus).catch((e) => toast("err", e.message));
    setPackets([]);
  }
  function follow(expr: string) { setFilter(expr); setTab("packets"); }

  const running = !!status?.running;
  const pps = status?.duration_s ? status.packets / status.duration_s : null;
  const pred = useMemo(() => makeFilter(filter), [filter]);
  const filtered = useMemo(() => packets.filter(pred), [packets, pred]);

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "packets", label: t("tf.tab.packets"), badge: status?.packets },
    { id: "convos", label: t("tf.tab.convos"), badge: status?.convo_count },
    { id: "endpoints", label: t("tf.tab.endpoints"), badge: status?.host_count },
    { id: "stats", label: t("tf.tab.stats") },
  ];

  return (
    <Page title={t("traffic.title")} sub={t("traffic.sub")}
      actions={
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => downloadCapture("csv").catch((e) => toast("err", e.message))} disabled={!status?.packets}><IconDownload /> CSV</button>
          <button className="btn btn-sm btn-ghost" onClick={() => downloadCapture("json").catch((e) => toast("err", e.message))} disabled={!status?.packets}>JSON</button>
          <button className="btn btn-sm btn-ghost" onClick={clear} disabled={busy || !packets.length}><IconTrash /> {t("tf.clear")}</button>
          {running
            ? <button className="btn btn-danger" onClick={stop} disabled={busy}><IconStop /> {t("tf.stop")}</button>
            : <button className="btn btn-primary" onClick={start} disabled={busy || !ifaces.length}><IconPlay /> {t("tf.start")}</button>}
        </div>
      }>
      <Card className="mb">
        <div className="card-pad toolbar">
          <div className="field" style={{ minWidth: 240, flex: 1 }}>
            <label>{t("tf.interface")}</label>
            <select className="select" value={iface} disabled={running} onChange={(e) => setIface(e.target.value)}>
              {ifaces.map((i) => <option key={i.id} value={i.id}>{(i.description || i.name) + (i.ip ? ` — ${i.ip}` : "")}</option>)}
            </select>
          </div>
          {advanced && (
            <div className="field" style={{ minWidth: 200, flex: 1 }}>
              <label>{t("tf.bpf")}</label>
              <input className="input mono" placeholder="tcp port 443 or udp port 53" value={bpf} disabled={running} onChange={(e) => setBpf(e.target.value)} />
            </div>
          )}
          <div className="field" style={{ minWidth: 220, flex: 1.5 }}>
            <label>{t("tf.filter")}</label>
            <input className="input mono" placeholder={t("tf.filter.ph")} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        </div>
      </Card>

      <div className="grid stats-4 mb">
        <StatTile label={t("tf.packets")} value={status ? status.packets.toLocaleString() : "—"} live={running} />
        <StatTile label={t("tf.data")} value={status ? bytes(status.bytes) : "—"} />
        <StatTile label={t("tf.rate")} value={pps != null ? `${pps.toFixed(1)} pkt/s` : "—"} />
        <StatTile label={t("tf.shown")} value={`${filtered.length.toLocaleString()}${filtered.length > RENDER_ROWS ? ` · ${RENDER_ROWS}` : ""}`} />
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((tb) => (
          <button key={tb.id} role="tab" aria-selected={tab === tb.id}
            className={`tab ${tab === tb.id ? "on" : ""}`} onClick={() => setTab(tb.id)}>
            {tb.label}{tb.badge ? <span className="tab-badge">{tb.badge > 999 ? "999+" : tb.badge}</span> : null}
            {tab === tb.id && <motion.span layoutId="tab-underline" className="tab-underline" />}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}>
          {tab === "packets" && <PacketsTab packets={filtered} running={running} />}
          {tab === "convos" && <ConversationsTab onFollow={follow} />}
          {tab === "endpoints" && <EndpointsTab onFollow={follow} />}
          {tab === "stats" && <StatsTab />}
        </motion.div>
      </AnimatePresence>
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

// ------------------------------------------------------------------ Packets --
function PacketsTab({ packets, running }: { packets: Packet[]; running: boolean }) {
  const { t } = useI18n();
  const { advanced } = useMode();
  const [selected, setSelected] = useState<Packet | null>(null);
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const visible = packets.length > RENDER_ROWS ? packets.slice(packets.length - RENDER_ROWS) : packets;
  const t0 = visible[0]?.t ?? null;

  useEffect(() => {
    if (follow && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visible.length, follow]);

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 330px", alignItems: "start" }}>
      <Card>
        <div ref={scrollRef} className="pkt-scroll"
          onScroll={(e) => {
            const el = e.currentTarget;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
            if (atBottom !== follow) setFollow(atBottom);
          }}>
          {visible.length === 0 ? (
            <Empty title={running ? t("tf.waiting") : t("tf.none")}>{running ? t("tf.waiting.body") : t("tf.none.body")}</Empty>
          ) : (
            <table className="table table-dense">
              <thead><tr><th style={{ width: 70 }}>{t("tf.col.time")}</th><th>{t("tf.col.source")}</th><th>{t("tf.col.dest")}</th><th style={{ width: 64 }}>{t("tf.col.proto")}</th><th style={{ width: 60 }}>{t("tf.col.len")}</th><th>{t("tf.col.info")}</th></tr></thead>
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
          <div className="follow-bar"><button className="btn btn-sm" onClick={() => setFollow(true)}>{t("tf.jump")}</button></div>
        )}
      </Card>
      <Card>
        <CardHead title={t("tf.details")} />
        <div className="card-pad">
          {selected ? <PacketDetail p={selected} advanced={advanced} t0={t0} /> : <p className="muted small">{t("tf.details.hint")}</p>}
        </div>
      </Card>
    </div>
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
        {m.payload_len != null && <><dt>Payload</dt><dd>{m.payload_len} bytes</dd></>}
      </dl>
      {m.dns && <Section title="DNS"><dt>Kind</dt><dd>{m.dns.kind}</dd><dt>Name</dt><dd>{m.dns.qname ?? "—"}</dd><dt>Type</dt><dd>{m.dns.qtype ?? "—"}</dd>{m.dns.answers?.length > 0 && <><dt>Answers</dt><dd>{m.dns.answers.join(", ")}</dd></>}</Section>}
      {m.http && <Section title="HTTP">{m.http.kind === "request" ? <><dt>Request</dt><dd>{m.http.method} {m.http.path}</dd><dt>Host</dt><dd>{m.http.host ?? "—"}</dd></> : <><dt>Status</dt><dd>{m.http.status} {m.http.reason}</dd><dt>Server</dt><dd>{m.http.server ?? "—"}</dd></>}</Section>}
      {m.tls && <Section title="TLS"><dt>Record</dt><dd>{m.tls.record}</dd><dt>Version</dt><dd>{m.tls.version}</dd>{m.tls.handshake && <><dt>Handshake</dt><dd>{m.tls.handshake}</dd></>}{m.tls.sni && <><dt>Server name</dt><dd>{m.tls.sni}</dd></>}</Section>}
      <p className="muted small">{p.info}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div><div className="section-title">{title}</div><dl className="kv kv-tight">{children}</dl></div>;
}

// ------------------------------------------------------------ Conversations --
function usePolled<T>(fn: () => Promise<T>, every = 1500): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => fn().then((d) => alive && setData(d)).catch(() => {});
    run();
    const id = setInterval(run, every);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}

function ConversationsTab({ onFollow }: { onFollow: (expr: string) => void }) {
  const { t } = useI18n();
  const data = usePolled(() => api.captureConversations());
  const rows = data?.conversations ?? [];
  return (
    <Card>
      <CardHead title={t("tf.tab.convos")} hint={t("tf.cv.explain")} />
      {rows.length === 0 ? <Empty title={t("tf.cv.empty")} /> : (
        <div className="table-wrap">
          <table className="table table-dense">
            <thead><tr><th>{t("tf.cv.a")}</th><th>{t("tf.cv.b")}</th><th>{t("tf.cv.proto")}</th><th style={{ textAlign: "right" }}>{t("tf.cv.packets")}</th><th style={{ textAlign: "right" }}>{t("tf.cv.bytes")}</th><th style={{ textAlign: "right" }}>{t("tf.cv.dir")}</th><th style={{ textAlign: "right" }}>{t("tf.cv.dur")}</th><th></th></tr></thead>
            <tbody>
              {rows.map((c: Conversation, i) => (
                <tr key={i}>
                  <td className="num">{endpoint(c.a_ip, c.a_port)}</td>
                  <td className="num">{endpoint(c.b_ip, c.b_port)}</td>
                  <td className="mono">{c.protocol}</td>
                  <td className="num" style={{ textAlign: "right" }}>{c.packets.toLocaleString()}</td>
                  <td className="num" style={{ textAlign: "right" }}>{bytes(c.bytes)}</td>
                  <td className="num muted" style={{ textAlign: "right" }}>{c.a_to_b} / {c.b_to_a}</td>
                  <td className="num muted" style={{ textAlign: "right" }}>{c.duration.toFixed(1)}s</td>
                  <td><button className="btn btn-ghost btn-sm" title={t("tf.follow")} onClick={() => onFollow(`ip ${c.a_ip} ip ${c.b_ip}`)}>↳</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// --------------------------------------------------------------- Endpoints --
function EndpointsTab({ onFollow }: { onFollow: (expr: string) => void }) {
  const { t } = useI18n();
  const data = usePolled(() => api.captureEndpoints());
  const rows = data?.endpoints ?? [];
  const max = rows.reduce((m, e) => Math.max(m, e.bytes), 0) || 1;
  return (
    <Card>
      <CardHead title={t("tf.tab.endpoints")} hint={t("tf.ep.explain")} />
      {rows.length === 0 ? <Empty title={t("tf.ep.empty")} /> : (
        <div className="table-wrap">
          <table className="table table-dense">
            <thead><tr><th>{t("tf.ep.ip")}</th><th style={{ textAlign: "right" }}>{t("tf.ep.packets")}</th><th>{t("tf.ep.bytes")}</th><th style={{ textAlign: "right" }}>{t("tf.ep.sent")}</th><th style={{ textAlign: "right" }}>{t("tf.ep.recv")}</th><th>{t("tf.ep.protos")}</th><th></th></tr></thead>
            <tbody>
              {rows.map((e: Endpoint) => (
                <tr key={e.ip}>
                  <td className="num">{e.ip}</td>
                  <td className="num" style={{ textAlign: "right" }}>{e.packets.toLocaleString()}</td>
                  <td style={{ minWidth: 150 }}>
                    <div className="ep-bar"><span style={{ width: `${(e.bytes / max) * 100}%` }} /><em className="mono">{bytes(e.bytes)}</em></div>
                  </td>
                  <td className="num muted" style={{ textAlign: "right" }}>{bytes(e.sent)}</td>
                  <td className="num muted" style={{ textAlign: "right" }}>{bytes(e.recv)}</td>
                  <td className="small muted">{e.protocols.join(", ")}</td>
                  <td><button className="btn btn-ghost btn-sm" title={t("tf.follow")} onClick={() => onFollow(`ip ${e.ip}`)}>↳</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// -------------------------------------------------------------- Statistics --
function StatsTab() {
  const { t } = useI18n();
  const data = usePolled(() => api.captureStatistics(), 2000);
  if (!data || (data.stats.packets ?? 0) === 0) return <Card><Empty title={t("tf.st.empty")} /></Card>;
  const { protocols, io, sizes } = data as CaptureStatistics;
  const maxProto = protocols[0]?.packets ?? 1;
  const maxSize = sizes.reduce((m, s) => Math.max(m, s.count), 0) || 1;
  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <Card>
        <CardHead title={t("tf.st.hierarchy")} />
        <div className="card-pad pbars">
          {protocols.map((p) => (
            <div key={p.protocol} className="pbar" style={{ cursor: "default" }}>
              <span className="pbar-name mono">{p.protocol}</span>
              <span className="pbar-track"><motion.span initial={{ width: 0 }} animate={{ width: `${(p.packets / maxProto) * 100}%` }} transition={{ duration: 0.4 }} /></span>
              <span className="pbar-val mono">{p.pct}%</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHead title={t("tf.st.sizes")} hint={t("tf.st.sizes.sub")} />
        <div className="card-pad pbars">
          {sizes.map((s) => (
            <div key={s.range} className="pbar" style={{ cursor: "default" }}>
              <span className="pbar-name mono" style={{ width: 72 }}>{s.range}</span>
              <span className="pbar-track"><motion.span initial={{ width: 0 }} animate={{ width: `${(s.count / maxSize) * 100}%` }} transition={{ duration: 0.4 }} /></span>
              <span className="pbar-val mono">{s.count}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card style={{ gridColumn: "1 / -1" }}>
        <CardHead title={t("tf.st.io")} hint={t("tf.st.io.sub")} />
        <div className="card-pad chart-200">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={io} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <defs><linearGradient id="gIo" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fff" stopOpacity={0.22} /><stop offset="100%" stopColor="#fff" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="t" tickFormatter={(s) => new Date(s * 1000).toLocaleTimeString()} tick={{ fill: "#606060", fontSize: 10 }} stroke="#252525" minTickGap={60} />
              <YAxis width={40} tick={{ fill: "#606060", fontSize: 10 }} stroke="#252525" />
              <Tooltip contentStyle={{ background: "#161616", border: "1px solid #333", borderRadius: 6, fontSize: 12 }} labelStyle={{ color: "#929292" }} itemStyle={{ color: "#fff" }}
                labelFormatter={(s) => new Date((s as number) * 1000).toLocaleTimeString()} formatter={(v: any) => [`${v} pkt/s`, ""]} />
              <Area type="monotone" dataKey="packets" stroke="#fff" strokeWidth={1.5} fill="url(#gIo)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------ Unavailable --
function CaptureUnavailable() {
  const { caps, refresh } = useCaps();
  const { t } = useI18n();
  const win = caps?.os === "Windows";
  return (
    <Page title={t("traffic.title")} sub={t("traffic.sub")}
      actions={<button className="btn btn-sm" onClick={refresh}>{t("tf.unavail.redetect")}</button>}>
      <Card>
        <CardHead title={t("tf.unavail.title")} />
        <div className="card-pad">
          <ol className="steps">
            <li className={caps?.pcap.available ? "done" : ""}>{win ? "Installez Npcap depuis npcap.com (gardez « WinPcap API-compatible mode »)." : "Install libpcap (e.g. apt install libpcap0.8)."}<span className="muted small"> — {caps?.pcap.detail ?? "unknown"}</span></li>
            <li className={caps?.scapy.available ? "done" : ""}>pip install scapy<span className="muted small"> — {caps?.scapy.detail ?? "unknown"}</span></li>
            <li className={caps?.is_admin ? "done" : ""}>{win ? "Lancez 0xFLUX en administrateur." : "Run the backend with sudo / CAP_NET_RAW."}<span className="muted small"> — {caps?.is_admin ? "elevated" : "standard user"}</span></li>
          </ol>
          <p className="muted small" style={{ marginTop: 14 }}>{t("tf.unavail.privacy")}</p>
        </div>
      </Card>
    </Page>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Page } from "../components/Page";
import { Card, Chip, Empty, Modal } from "../components/ui";
import { IconSearch } from "../components/icons";
import { api } from "../lib/api";
import { relTime } from "../lib/format";

interface RefRow { port: number; protocol: string; name: string; desc: string; }
interface Observed { port: number; protocol: string; hosts: string[]; services: string[]; versions: string[]; last_seen: string | null; }
interface Row { port: number; protocol: string; name: string; desc: string | null; observed: Observed | null; }

export default function Ports() {
  const [ref, setRef] = useState<RefRow[]>([]);
  const [obs, setObs] = useState<Observed[]>([]);
  const [q, setQ] = useState("");
  const [onlyDetected, setOnlyDetected] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);

  useEffect(() => {
    api.portsReference().then((r) => setRef(r.ports)).catch(() => {});
    fetchObserved().then(setObs).catch(() => {});
  }, []);

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const r of ref) map.set(`${r.port}/${r.protocol}`, { ...r, observed: null });
    for (const o of obs) {
      const k = `${o.port}/${o.protocol}`;
      const existing = map.get(k);
      if (existing) existing.observed = o;
      else map.set(k, { port: o.port, protocol: o.protocol, name: o.services[0] ?? "unknown", desc: null, observed: o });
    }
    return [...map.values()].sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol));
  }, [ref, obs]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!onlyDetected || r.observed) &&
      (!t || String(r.port) === t || String(r.port).startsWith(t) || r.name.toLowerCase().includes(t) ||
        (r.desc ?? "").toLowerCase().includes(t) || r.observed?.versions.some((v) => v.toLowerCase().includes(t))));
  }, [rows, q, onlyDetected]);

  return (
    <Page title="Port Explorer" sub="Common ports and services, with what your scans actually detected.">
      <Card>
        <div className="card-pad toolbar" style={{ paddingBottom: 12 }}>
          <div className="search" style={{ flex: 1, maxWidth: 420 }}>
            <IconSearch />
            <input className="input" placeholder="Search port, service, description or version…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="seg">
            <button className={!onlyDetected ? "on" : ""} onClick={() => setOnlyDetected(false)}>All ports</button>
            <button className={onlyDetected ? "on" : ""} onClick={() => setOnlyDetected(true)}>Detected ({obs.length})</button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <Empty title={onlyDetected && !obs.length ? "Nothing detected yet" : "No matches"}>
            {onlyDetected && !obs.length ? "Open ports found by your scans will be listed here." : `Nothing matches “${q}”.`}
          </Empty>
        ) : (
          <table className="table">
            <thead><tr><th style={{ width: 80 }}>Port</th><th style={{ width: 80 }}>Protocol</th><th style={{ width: 150 }}>Service</th><th>Description</th><th style={{ width: 150 }}>Detected</th><th>Detected version</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.port}/${r.protocol}`} onClick={() => setOpen(r)} style={{ cursor: "pointer" }}>
                  <td className="num">{r.port}</td>
                  <td>{r.protocol}</td>
                  <td className="mono">{r.name}</td>
                  <td style={{ color: "var(--text-2)" }}>{r.desc ?? <span className="muted">not in the reference list</span>}</td>
                  <td>{r.observed ? <Chip state="open">open on {r.observed.hosts.length}</Chip> : <span className="muted small">not seen</span>}</td>
                  <td className="small" style={{ color: "var(--text-2)" }}>{r.observed?.versions[0] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {open && (
        <Modal title={`Port ${open.port}/${open.protocol} — ${open.name}`} onClose={() => setOpen(null)} width={520}>
          <p className="small" style={{ color: "var(--text-2)", marginBottom: 14 }}>{open.desc ?? "No reference description for this port."}</p>
          {open.observed ? (
            <dl className="kv kv-tight">
              <dt>Open on</dt><dd>{open.observed.hosts.join(", ")}</dd>
              <dt>Services</dt><dd>{open.observed.services.join(", ") || "—"}</dd>
              <dt>Versions</dt><dd>{open.observed.versions.join(" · ") || "—"}</dd>
              <dt>Last seen</dt><dd>{relTime(open.observed.last_seen)}</dd>
            </dl>
          ) : <p className="muted small">No completed scan has found this port open.</p>}
        </Modal>
      )}
    </Page>
  );
}

async function fetchObserved(): Promise<Observed[]> {
  const res = await api.portsObserved();
  return res.ports;
}

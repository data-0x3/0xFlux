import { useEffect, useRef, useState } from "react";
import { Page } from "../components/Page";
import { Card, Chip, Empty, Modal, useToast } from "../components/ui";
import { IconDownload, IconSearch, IconTrash } from "../components/icons";
import { api, downloadExport, type ScanCompare, type ScanDetail, type ScanSummary } from "../lib/api";
import { dateTime, duration, stateClass } from "../lib/format";

export default function History() {
  const toast = useToast();
  const [scans, setScans] = useState<ScanSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<ScanDetail | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [compare, setCompare] = useState<ScanCompare | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const debounce = useRef<number | undefined>(undefined);

  const load = (search?: string) =>
    api.history(search).then((r) => setScans(r.scans)).catch((e) => { setScans([]); toast("err", e.message); });
  useEffect(() => { load(); }, []);

  function onSearch(v: string) {
    setQuery(v);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => load(v.trim() || undefined), 250);
  }

  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  }

  async function del(id: number) {
    try {
      await api.deleteScan(id);
      setScans((s) => s?.filter((x) => x.id !== id) ?? null);
      setPicked((p) => p.filter((x) => x !== id));
      toast("ok", "Scan deleted.");
    } catch (e: any) {
      toast("err", e.message);
    }
  }

  async function runCompare() {
    const [a, b] = [...picked].sort((x, y) => x - y);
    try { setCompare(await api.compare(a, b)); } catch (e: any) { toast("err", e.message); }
  }

  const exp = (id: number, f: "json" | "csv" | "pdf") => downloadExport(id, f).catch((e) => toast("err", e.message));

  return (
    <Page title="Scan History" sub="Every scan is saved locally and searchable."
      actions={
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm" disabled={picked.length !== 2} onClick={runCompare}
            title="Select two scans to compare">Compare {picked.length ? `(${picked.length}/2)` : ""}</button>
          <button className="btn btn-danger btn-sm" disabled={!scans?.length} onClick={() => setConfirmClear(true)}>
            <IconTrash /> Delete all
          </button>
        </div>
      }>
      <Card>
        <div className="card-pad" style={{ paddingBottom: 12 }}>
          <div className="search">
            <IconSearch />
            <input className="input" placeholder="Search by target…" value={query} onChange={(e) => onSearch(e.target.value)} />
          </div>
        </div>
        {scans == null ? <Empty title="Loading…" /> : scans.length === 0 ? (
          <Empty title={query ? "No matching scans" : "No scans recorded"}>
            {query ? `Nothing matches “${query}”.` : "Scans you run are listed here with their full results."}
          </Empty>
        ) : (
          <table className="table">
            <thead><tr><th style={{ width: 32 }}></th><th>Target</th><th>Profile</th><th>Engine</th><th>Status</th><th>Hosts</th><th>Open</th><th>Duration</th><th>Started</th><th></th></tr></thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s.id} className={picked.includes(s.id) ? "sel" : ""} style={{ cursor: "pointer" }}
                  onClick={() => api.scan(s.id).then(setDetail).catch((e) => toast("err", e.message))}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select scan ${s.id}`} checked={picked.includes(s.id)}
                      disabled={s.status !== "completed"} onChange={() => toggle(s.id)} />
                  </td>
                  <td className="mono">{s.target}</td>
                  <td style={{ color: "var(--text-2)" }}>{s.profile.replace(/_/g, " ")}</td>
                  <td><span className="badge-engine">{s.engine}</span></td>
                  <td><Chip state={stateClass(s.status)}>{s.status}</Chip></td>
                  <td className="num">{s.hosts_up}</td>
                  <td className="num">{s.ports_open}</td>
                  <td className="num">{duration(s.duration_s)}</td>
                  <td className="muted small">{dateTime(s.started_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row" style={{ gap: 2 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => exp(s.id, "json")} title="Export JSON" aria-label="Export JSON"><IconDownload /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => del(s.id)} title="Delete" aria-label="Delete scan"><IconTrash /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {detail && (
        <Modal title={`Scan #${detail.id} — ${detail.target}`} onClose={() => setDetail(null)} width={720}>
          <div className="row" style={{ gap: 8, marginBottom: 14 }}>
            {(["pdf", "csv", "json"] as const).map((f) => (
              <button key={f} className="btn btn-sm" onClick={() => exp(detail.id, f)}><IconDownload /> {f.toUpperCase()}</button>
            ))}
          </div>
          <dl className="kv kv-tight" style={{ marginBottom: 16 }}>
            <dt>Status</dt><dd>{detail.status}</dd>
            <dt>Engine</dt><dd>{detail.engine}</dd>
            <dt>Profile</dt><dd>{detail.profile.replace(/_/g, " ")}</dd>
            <dt>Duration</dt><dd>{duration(detail.duration_s)}</dd>
            <dt>Started</dt><dd>{dateTime(detail.started_at)}</dd>
            {detail.error && <><dt>Error</dt><dd className="err-text">{detail.error}</dd></>}
          </dl>
          {detail.notes.length > 0 && <div className="notes" style={{ marginBottom: 14 }}>{detail.notes.map((n) => <p key={n}>{n}</p>)}</div>}
          {detail.hosts.length === 0 && <p className="muted small">No live hosts recorded.</p>}
          {detail.hosts.map((h) => {
            const open = h.ports.filter((p) => p.state === "open");
            return (
              <div key={h.ip} style={{ marginBottom: 16 }}>
                <div className="mono" style={{ marginBottom: 6 }}>
                  {h.ip}{h.hostname && <span style={{ color: "var(--text-2)" }}> · {h.hostname}</span>}
                  {h.os_guess && <span className="muted"> · {h.os_guess}</span>}
                </div>
                {open.length ? (
                  <table className="table table-dense">
                    <tbody>
                      {open.map((p) => (
                        <tr key={`${p.protocol}-${p.number}`}>
                          <td className="num" style={{ width: 80 }}>{p.number}/{p.protocol}</td>
                          <td>{p.service ?? "—"}</td>
                          <td className="muted">{p.version ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="muted small">No open ports.</div>}
              </div>
            );
          })}
        </Modal>
      )}

      {compare && <CompareModal data={compare} onClose={() => setCompare(null)} />}

      {confirmClear && (
        <Modal title="Delete all scans?" onClose={() => setConfirmClear(false)} width={420}>
          <p className="small" style={{ color: "var(--text-2)", marginBottom: 16 }}>
            This permanently removes {scans?.length ?? 0} scan(s) and their results from this computer.
          </p>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-sm" onClick={() => setConfirmClear(false)}>Keep history</button>
            <button className="btn btn-sm btn-danger" onClick={async () => {
              await api.clearHistory().catch((e) => toast("err", e.message));
              setScans([]); setPicked([]); setConfirmClear(false); toast("ok", "History deleted.");
            }}><IconTrash /> Delete all scans</button>
          </div>
        </Modal>
      )}
    </Page>
  );
}

function CompareModal({ data, onClose }: { data: ScanCompare; onClose: () => void }) {
  const { a, b } = data;
  return (
    <Modal title={`Compare #${a.id} → #${b.id}`} onClose={onClose} width={720}>
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        {[a, b].map((s, i) => (
          <div key={s.id} className="compare-side">
            <div className="muted small">{i === 0 ? "Before" : "After"} · #{s.id}</div>
            <div className="mono" style={{ margin: "4px 0" }}>{s.target}</div>
            <div className="muted small">{dateTime(s.started_at)} · {s.hosts_up} host(s) · {s.ports_open} open</div>
          </div>
        ))}
      </div>
      <div className="grid stats-3" style={{ marginBottom: 16 }}>
        <div className="compare-stat"><span className="mono" style={{ color: "var(--state-open)" }}>+{data.opened.length}</span><span className="muted small">newly open</span></div>
        <div className="compare-stat"><span className="mono" style={{ color: "var(--state-down)" }}>−{data.closed.length}</span><span className="muted small">no longer open</span></div>
        <div className="compare-stat"><span className="mono">{data.unchanged}</span><span className="muted small">unchanged</span></div>
      </div>
      {data.opened.length === 0 && data.closed.length === 0 ? (
        <Empty title="No differences">Both scans found the same open ports.</Empty>
      ) : (
        <table className="table table-dense">
          <thead><tr><th>Change</th><th>Host</th><th>Port</th></tr></thead>
          <tbody>
            {data.opened.map((x) => (
              <tr key={`o-${x.ip}-${x.port}`}><td><Chip state="open">opened</Chip></td><td className="num">{x.ip}</td><td className="num">{x.port}</td></tr>
            ))}
            {data.closed.map((x) => (
              <tr key={`c-${x.ip}-${x.port}`}><td><Chip state="down">closed</Chip></td><td className="num">{x.ip}</td><td className="num">{x.port}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

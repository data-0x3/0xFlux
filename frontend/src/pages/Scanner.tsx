import { useMemo, useState } from "react";
import { Page } from "../components/Page";
import { Card, CardHead, Chip, Empty, useToast } from "../components/ui";
import { IconDownload, IconPlay, IconStop } from "../components/icons";
import { downloadExport, type HostRow } from "../lib/api";
import { useScan } from "../hooks/useScan";
import { useCaps } from "../lib/caps";
import { useMode } from "../lib/mode";
import { duration, ms, stateClass } from "../lib/format";

const PROFILES = [
  { id: "quick_discovery", name: "Quick Discovery", desc: "Active hosts and a few key ports." },
  { id: "standard_scan", name: "Standard Scan", desc: "Hosts plus commonly used TCP ports." },
  { id: "service_detection", name: "Service Detection", desc: "Identify services and versions where possible." },
  { id: "full_port_audit", name: "Full Port Audit", desc: "Ports 1–1024 and common high ports, rate-limited." },
];

/** Parse "22,80,8000-8010" into a port list, or return an error message. */
function parsePorts(text: string): { ports: number[] | null; error: string | null } {
  const t = text.trim();
  if (!t) return { ports: null, error: null };
  const out = new Set<number>();
  for (const part of t.split(",").map((s) => s.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = +range[1], b = +range[2];
      if (a < 1 || b > 65535 || a > b) return { ports: null, error: `Invalid range “${part}”.` };
      if (b - a > 20000) return { ports: null, error: `Range “${part}” is too wide (max 20 000 ports).` };
      for (let p = a; p <= b; p++) out.add(p);
    } else if (/^\d+$/.test(part) && +part >= 1 && +part <= 65535) {
      out.add(+part);
    } else {
      return { ports: null, error: `“${part}” is not a valid port.` };
    }
  }
  return { ports: [...out].sort((a, b) => a - b), error: null };
}

export default function Scanner() {
  const toast = useToast();
  const { caps } = useCaps();
  const { advanced } = useMode();
  const { running, progress, result, error, start, cancel } = useScan();
  const [target, setTarget] = useState("");
  const [profile, setProfile] = useState("standard_scan");
  const [authorized, setAuthorized] = useState(false);
  const [customPorts, setCustomPorts] = useState("");
  const [detectOs, setDetectOs] = useState(false);
  const [udp, setUdp] = useState(false);
  const [timeout, setTimeout_] = useState("1.0");

  const parsed = useMemo(() => parsePorts(customPorts), [customPorts]);
  const nmap = !!caps?.nmap.available;
  const admin = !!caps?.is_admin;
  const privileged = nmap && admin;

  function launch() {
    if (advanced && parsed.error) { toast("err", parsed.error); return; }
    start({
      target: target.trim(), profile, authorized,
      ports: advanced ? parsed.ports : null,
      detect_service: profile === "service_detection",
      detect_os: advanced && privileged && detectOs,
      udp: advanced && privileged && udp,
      timeout: advanced ? Math.min(Math.max(parseFloat(timeout) || 1, 0.2), 10) : 1,
    });
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Page title="Network Scanner" sub="Scan networks and devices you own or are authorised to assess.">
      <div className="grid" style={{ gridTemplateColumns: "360px minmax(0,1fr)", alignItems: "start" }}>
        <Card>
          <CardHead title="Scan configuration" hint={`engine: ${nmap ? "nmap" : "python (built-in)"}`} />
          <form className="card-pad col" onSubmit={(e) => { e.preventDefault(); if (!running && target.trim()) launch(); }}>
            <div className="field">
              <label htmlFor="target">Target — IP, hostname or CIDR range</label>
              <input id="target" className="input mono" placeholder="192.168.1.0/24" value={target}
                onChange={(e) => setTarget(e.target.value)} disabled={running} autoComplete="off" spellCheck={false} />
            </div>

            <div className="field">
              <label>Scan profile</label>
              <div className="col" style={{ gap: 6 }}>
                {PROFILES.map((p) => (
                  <button type="button" key={p.id} onClick={() => setProfile(p.id)} disabled={running}
                    className={`choice ${profile === p.id ? "on" : ""}`} aria-pressed={profile === p.id}>
                    <span className="choice-title">{p.name}</span>
                    <span className="choice-desc">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {advanced && (
              <div className="col adv-block">
                <div className="field">
                  <label htmlFor="ports">Custom ports — overrides the profile</label>
                  <input id="ports" className="input mono" placeholder="22,80,443,8000-8100" value={customPorts}
                    onChange={(e) => setCustomPorts(e.target.value)} disabled={running} />
                  {parsed.error ? <span className="field-err">{parsed.error}</span>
                    : parsed.ports ? <span className="muted small">{parsed.ports.length} port(s)</span> : null}
                </div>
                <div className="field">
                  <label htmlFor="timeout">Probe timeout (seconds)</label>
                  <input id="timeout" className="input mono" value={timeout} inputMode="decimal"
                    onChange={(e) => setTimeout_(e.target.value)} disabled={running} style={{ width: 100 }} />
                </div>
                <label className="check">
                  <input type="checkbox" checked={detectOs} onChange={(e) => setDetectOs(e.target.checked)} disabled={running || !privileged} />
                  OS fingerprinting {!privileged && <span className="muted">(needs nmap + administrator)</span>}
                </label>
                <label className="check">
                  <input type="checkbox" checked={udp} onChange={(e) => setUdp(e.target.checked)} disabled={running || !privileged} />
                  Include common UDP ports {!privileged && <span className="muted">(needs nmap + administrator)</span>}
                </label>
              </div>
            )}

            <label className="check">
              <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
              <span>I own this target or have explicit permission to scan it. Required for public addresses.</span>
            </label>

            {running ? (
              <button type="button" className="btn btn-danger" onClick={cancel}><IconStop /> Cancel scan</button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={!target.trim()}><IconPlay /> Start scan</button>
            )}
          </form>
        </Card>

        <div className="col">
          {running && progress && (
            <Card>
              <div className="card-pad col" style={{ gap: 10 }}>
                <div className="row-between small">
                  <span className="scan-live"><span className="cap-dot on pulse" /> {progress.message}</span>
                  <span className="mono muted">{progress.phase === "discovery" ? "discovery" : "ports"} · {pct}%</span>
                </div>
                <div className="progress"><span style={{ width: `${pct}%` }} /></div>
              </div>
            </Card>
          )}

          {error && <Card><div className="card-pad err-text">{error}</div></Card>}

          {!running && !result && !error && (
            <Card><Empty title="No scan yet">Enter a target and start a scan. Progress and results appear here as they arrive.</Empty></Card>
          )}

          {result && (
            <Card>
              <CardHead title={`Results — ${result.target}`}
                hint={`${result.status} · ${result.engine} engine · ${duration(result.duration_s)} · ${result.hosts_up} host(s) up · ${result.ports_open} open port(s)`}
                right={
                  <div className="row" style={{ gap: 6 }}>
                    {(["pdf", "csv", "json"] as const).map((f) => (
                      <button key={f} className="btn btn-sm" onClick={() => downloadExport(result.id, f).catch((e) => toast("err", e.message))}>
                        <IconDownload /> {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                } />
              {result.notes.length > 0 && (
                <div className="card-pad notes">{result.notes.map((n) => <p key={n}>{n}</p>)}</div>
              )}
              {result.hosts.length === 0 ? (
                <Empty title="No live hosts found">Nothing answered on the probed ports. Hosts with a firewall that drops probes can look offline.</Empty>
              ) : (
                result.hosts.map((h) => <HostBlock key={h.ip} host={h} advanced={advanced} />)
              )}
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function HostBlock({ host, advanced }: { host: HostRow; advanced: boolean }) {
  const shown = advanced ? host.ports : host.ports.filter((p) => p.state === "open");
  return (
    <div className="host-block">
      <div className="card-pad" style={{ paddingBottom: 10 }}>
        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="mono" style={{ fontSize: "var(--t-md)" }}>{host.ip}</span>
          <Chip state={stateClass(host.state)}>{host.state}</Chip>
          {host.hostname && <span className="small" style={{ color: "var(--text-2)" }}>{host.hostname}</span>}
          {host.latency_ms != null && <span className="mono muted small">{ms(host.latency_ms)}</span>}
          {host.os_guess && <span className="badge-engine">{host.os_guess}</span>}
          {host.mac && <span className="mono muted small">{host.mac}</span>}
          {host.vendor && <span className="muted small">{host.vendor}</span>}
        </div>
      </div>
      {shown.length > 0 ? (
        <table className="table">
          <thead><tr><th style={{ width: 80 }}>Port</th><th style={{ width: 70 }}>Proto</th><th style={{ width: 110 }}>State</th><th>Service</th><th>Version</th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={`${p.protocol}-${p.number}`}>
                <td className="num">{p.number}</td>
                <td>{p.protocol}</td>
                <td><Chip state={stateClass(p.state)}>{p.state}</Chip></td>
                <td>{p.service ?? "—"}</td>
                <td style={{ color: "var(--text-2)" }}>{p.version ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="card-pad muted small" style={{ paddingTop: 0 }}>No open ports among those probed.</div>
      )}
    </div>
  );
}

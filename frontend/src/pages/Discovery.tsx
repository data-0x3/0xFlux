import { useEffect, useState } from "react";
import { Page } from "../components/Page";
import { useI18n } from "../lib/i18n";
import { Card, CardHead, Chip, Empty, useToast } from "../components/ui";
import { IconRefresh, IconSpinner, IconTrash } from "../components/icons";
import { api, type Device } from "../lib/api";
import { useMode } from "../lib/mode";
import { relTime } from "../lib/format";

export default function Discovery() {
  const { t } = useI18n();
  const toast = useToast();
  const { advanced } = useMode();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [ctx, setCtx] = useState<{ subnet: string | null; local_ip: string | null; interface: string | null; gateway: string | null } | null>(null);
  const [subnet, setSubnet] = useState("");
  const [scanning, setScanning] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    api.inventory().then((r) => setDevices(r.devices)).catch(() => setDevices([]));
    api.discoveryContext().then((c) => { setCtx(c); setSubnet((s) => s || c.subnet || ""); }).catch(() => {});
  }, []);

  async function scan() {
    setScanning(true);
    try {
      const r = await api.discover(advanced && subnet.trim() ? subnet.trim() : undefined);
      if (!r.ok) { toast("err", r.error ?? "Discovery failed."); return; }
      setDevices(r.devices);
      setCtx((c) => ({ subnet: r.subnet ?? c?.subnet ?? null, local_ip: r.local_ip ?? null, interface: r.interface ?? null, gateway: r.gateway ?? null }));
      toast("ok", `${r.count} device(s) answered on ${r.subnet}.`);
    } catch (e: any) {
      toast("err", e.message);
    } finally {
      setScanning(false);
    }
  }

  async function forget() {
    await api.clearInventory().catch((e) => toast("err", e.message));
    setDevices([]);
  }

  const up = devices?.filter((d) => d.status === "up").length ?? 0;

  return (
    <Page title={t("discovery.title")}
      sub={ctx?.subnet ? `Local network ${ctx.subnet}${ctx.gateway ? ` · gateway ${ctx.gateway}` : " · gateway not found"}` : "Find the devices on your local network."}
      actions={
        <div className="row" style={{ gap: 8 }}>
          {advanced && devices && devices.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={forget} disabled={scanning}><IconTrash /> Forget devices</button>
          )}
          <button className="btn btn-primary" onClick={scan} disabled={scanning}>
            {scanning ? <IconSpinner /> : <IconRefresh />} {scanning ? "Scanning network…" : "Scan local network"}
          </button>
        </div>
      }>
      {advanced && (
        <Card className="mb">
          <div className="card-pad toolbar">
            <div className="field" style={{ width: 240 }}>
              <label htmlFor="subnet">Subnet to sweep (private ranges only)</label>
              <input id="subnet" className="input mono" value={subnet} placeholder={ctx?.subnet ?? "192.168.1.0/24"}
                onChange={(e) => setSubnet(e.target.value)} disabled={scanning} />
            </div>
            <dl className="kv kv-tight" style={{ flex: 1 }}>
              <dt>Interface</dt><dd>{ctx?.interface ?? "—"}</dd>
              <dt>This computer</dt><dd>{ctx?.local_ip ?? "—"}</dd>
            </dl>
          </div>
        </Card>
      )}

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 340px", alignItems: "start" }}>
        <Card>
          <CardHead title="Devices" hint={devices ? `${devices.length} known${devices.some((d) => d.status !== "unknown") ? ` · ${up} online now` : ""}` : undefined} />
          {devices == null ? <Empty title="Loading…" /> : devices.length === 0 ? (
            <Empty title="No devices yet">Scan your local network to build the inventory. Each device keeps its first and last seen times.</Empty>
          ) : (
            <div className="table-wrap">
            <table className="table">
              <thead><tr><th>IP address</th><th>Status</th><th>Hostname</th><th>MAC</th><th>Vendor</th>{advanced && <th>Open ports</th>}<th>First seen</th><th>Last seen</th></tr></thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.ip} className={focus === d.ip ? "sel" : ""} onMouseEnter={() => setFocus(d.ip)} onMouseLeave={() => setFocus(null)}>
                    <td className="num nowrap">
                      {d.ip}
                      {d.is_gateway && <span className="tag">gateway</span>}
                      {d.is_self && <span className="tag">this PC</span>}
                    </td>
                    <td>{d.status === "unknown" ? <span className="muted small">not checked</span>
                      : <Chip state={d.status === "up" ? "open" : "closed"}>{d.status}</Chip>}</td>
                    <td style={{ color: "var(--text-2)" }}>{d.hostname ?? "—"}</td>
                    <td className="num muted">{d.mac ?? "—"}</td>
                    <td style={{ color: "var(--text-2)" }}>{d.vendor ?? (d.mac ? "unknown" : "—")}</td>
                    {advanced && <td className="num small">{d.open_ports.length ? d.open_ports.slice(0, 6).join(", ") + (d.open_ports.length > 6 ? "…" : "") : <span className="muted">—</span>}</td>}
                    <td className="muted small">{relTime(d.first_seen)}</td>
                    <td className="muted small">{relTime(d.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Topology" hint="gateway → devices on this segment" />
          <div className="card-pad">
            {!devices || devices.length === 0 ? <Empty title="Nothing to map yet" /> : (
              <Topology devices={devices} focus={focus} setFocus={setFocus} />
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
}

/** Radial map. Edges are drawn only from a known gateway to devices on the
 *  same segment — the one relationship discovery can actually establish. */
function Topology({ devices, focus, setFocus }: { devices: Device[]; focus: string | null; setFocus: (ip: string | null) => void }) {
  const size = 300, cx = size / 2, cy = size / 2;
  const gw = devices.find((d) => d.is_gateway) ?? null;
  const nodes = devices.filter((d) => !d.is_gateway).slice(0, 40);
  const r = nodes.length > 20 ? 122 : 108;
  const focused = devices.find((d) => d.ip === focus);

  return (
    <div>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" role="img" aria-label="Network topology">
        {nodes.map((d, i) => {
          const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          const on = focus === d.ip;
          const online = d.status !== "not seen";
          return (
            <g key={d.ip} onMouseEnter={() => setFocus(d.ip)} onMouseLeave={() => setFocus(null)} style={{ cursor: "pointer" }}>
              {gw && <line x1={cx} y1={cy} x2={x} y2={y} stroke={on ? "#ffffff" : "#252525"} strokeWidth={on ? 1.2 : 0.8}
                strokeDasharray={online ? undefined : "2 3"} />}
              <circle cx={x} cy={y} r={on ? 6.5 : d.is_self ? 5.5 : 4.5}
                fill={on || d.is_self ? "#ffffff" : online ? "#2a2a2a" : "#101010"} stroke={online ? "#606060" : "#333"} strokeWidth={1} />
            </g>
          );
        })}
        {gw ? (
          <g onMouseEnter={() => setFocus(gw.ip)} onMouseLeave={() => setFocus(null)}>
            <circle cx={cx} cy={cy} r={10} fill="#ffffff" />
            <circle cx={cx} cy={cy} r={15} fill="none" stroke="#333" />
          </g>
        ) : (
          <text x={cx} y={cy} fill="#606060" fontSize={10} textAnchor="middle">gateway unknown</text>
        )}
      </svg>
      <div className="topo-caption">
        {focused ? (
          <>
            <span className="mono">{focused.ip}</span>
            <span className="muted small">{focused.hostname ?? focused.vendor ?? (focused.is_gateway ? "gateway" : "device")}</span>
          </>
        ) : <span className="muted small">Hover a node or a row to identify it.</span>}
      </div>
    </div>
  );
}

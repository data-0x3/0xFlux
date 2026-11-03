import { useState } from "react";
import { Page } from "../components/Page";
import { useI18n } from "../lib/i18n";
import { Card, CardHead } from "../components/ui";
import { IconSpinner } from "../components/icons";
import { api } from "../lib/api";
import { useCaps } from "../lib/caps";
import { useMode } from "../lib/mode";

type Tab = "dns" | "reverse" | "resolve" | "whois" | "ping" | "trace" | "subnet" | "ipinfo";

const TABS: { id: Tab; label: string }[] = [
  { id: "dns", label: "DNS Lookup" },
  { id: "reverse", label: "Reverse DNS" },
  { id: "resolve", label: "Resolve Host" },
  { id: "whois", label: "WHOIS" },
  { id: "ping", label: "Ping" },
  { id: "trace", label: "Traceroute" },
  { id: "subnet", label: "Subnet Calc" },
  { id: "ipinfo", label: "IP Info" },
];

export default function Tools() {
  const { t } = useI18n();
  const { caps } = useCaps();
  const { advanced } = useMode();
  const [tab, setTab] = useState<Tab>("dns");
  const [input, setInput] = useState("");
  const [extra, setExtra] = useState("A");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null); setResult(null);
    try {
      let r: any;
      switch (tab) {
        case "dns": r = await api.dns(input, extra); break;
        case "reverse": r = await api.reverseDns(input); break;
        case "resolve": r = await api.resolve(input); break;
        case "whois": r = await api.whois(input); break;
        case "ping": r = await api.ping(input, 4); break;
        case "trace": r = await api.traceroute(input, 20); break;
        case "subnet": r = await api.subnet(input); break;
        case "ipinfo": r = await api.ipinfo(input); break;
      }
      if (r.ok === false) setError(r.error ?? "Lookup failed.");
      else setResult(r);
    } catch (e: any) {
      setError(e.message ?? "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  const placeholder: Record<Tab, string> = {
    dns: "example.com", reverse: "8.8.8.8", resolve: "example.com", whois: "example.com",
    ping: "1.1.1.1 or hostname", trace: "1.1.1.1 or hostname",
    subnet: "192.168.1.0/24", ipinfo: "192.168.1.1",
  };

  return (
    <Page title={t("tools.title")} sub={t("tools.sub")}>
      <div className="seg" style={{ marginBottom: "var(--r-4)", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""}
            onClick={() => { setTab(t.id); setResult(null); setError(null); }}>{t.label}</button>
        ))}
      </div>

      <Card>
        <div className="card-pad">
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1 }}>
              <label>{tab === "subnet" ? "CIDR range" : tab === "whois" ? "Domain" : tab === "reverse" || tab === "ipinfo" ? "IP address" : "Target"}</label>
              <input className="input mono" value={input} placeholder={placeholder[tab]}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && input && run()} />
            </div>
            {tab === "dns" && (
              <div className="field" style={{ width: 120 }}>
                <label>Record</label>
                <select className="select" value={extra} onChange={(e) => setExtra(e.target.value)}>
                  {["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA"].map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            )}
            <button className="btn btn-primary" disabled={!input || busy} onClick={run}>
              {busy ? <IconSpinner /> : null} Run
            </button>
          </div>

          {tab === "whois" && !caps?.whois.available && (
            <p style={{ color: "var(--text-muted)", fontSize: "var(--t-sm)", marginTop: 10 }}>
              WHOIS support is unavailable on this host (python-whois not installed).
            </p>
          )}
        </div>
      </Card>

      {(result || error) && (
        <Card className="">
          <CardHead title="Result" />
          <div className="card-pad">
            {error ? (
              <p style={{ color: "var(--state-down)", fontSize: "var(--t-base)" }}>{error}</p>
            ) : (
              <>
                <ResultView tab={tab} data={result} />
                {advanced && result?.raw && <pre className="raw">{result.raw}</pre>}
              </>
            )}
          </div>
        </Card>
      )}
    </Page>
  );
}

function ResultView({ tab, data }: { tab: Tab; data: any }) {
  if (tab === "dns") {
    return (
      <dl className="kv">
        <dt>Name</dt><dd>{data.name}</dd>
        <dt>Type</dt><dd>{data.type}</dd>
        <dt>TTL</dt><dd>{data.ttl ?? "—"}</dd>
        <dt>Records</dt><dd>{data.records.join(", ")}</dd>
      </dl>
    );
  }
  if (tab === "ping") {
    return (
      <dl className="kv">
        <dt>Host</dt><dd>{data.host}</dd>
        <dt>Packets</dt><dd>{data.received}/{data.sent} received</dd>
        <dt>Loss</dt><dd>{data.loss_pct}%</dd>
        <dt>RTT min/avg/max</dt><dd>{data.rtt_min ?? "—"} / {data.rtt_avg ?? "—"} / {data.rtt_max ?? "—"} ms</dd>
      </dl>
    );
  }
  if (tab === "trace") {
    return (
      <table className="table">
        <thead><tr><th style={{ width: 60 }}>Hop</th><th>IP</th><th>RTT</th></tr></thead>
        <tbody>
          {data.hops.map((h: any) => (
            <tr key={h.hop}>
              <td className="num">{h.hop}</td>
              <td className="num">{h.ip ?? <span className="muted">no reply</span>}</td>
              <td className="num">{h.rtt_ms != null ? `${h.rtt_ms} ms` : <span className="muted">*</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (tab === "subnet") {
    return (
      <dl className="kv">
        <dt>Network</dt><dd>{data.network}/{data.prefix}</dd>
        <dt>Netmask</dt><dd>{data.netmask}</dd>
        <dt>Wildcard</dt><dd>{data.wildcard}</dd>
        {data.broadcast && <><dt>Broadcast</dt><dd>{data.broadcast}</dd></>}
        <dt>Usable hosts</dt><dd>{data.usable_hosts.toLocaleString()}</dd>
        <dt>Range</dt><dd>{data.first_host} – {data.last_host}</dd>
        <dt>Private</dt><dd>{String(data.is_private)}</dd>
      </dl>
    );
  }
  if (tab === "ipinfo") {
    return (
      <dl className="kv">
        {Object.entries(data).filter(([k]) => k !== "ok").map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}><dt>{k.replace(/_/g, " ")}</dt><dd>{String(v)}</dd></div>
        ))}
      </dl>
    );
  }
  if (tab === "whois") {
    return (
      <dl className="kv">
        {Object.entries(data.data).map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}><dt>{k.replace(/_/g, " ")}</dt><dd>{Array.isArray(v) ? v.join(", ") : String(v ?? "—")}</dd></div>
        ))}
      </dl>
    );
  }
  // reverse / resolve
  return (
    <dl className="kv">
      {Object.entries(data).filter(([k]) => k !== "ok").map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd></div>
      ))}
    </dl>
  );
}

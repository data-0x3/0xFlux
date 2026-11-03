import { useEffect, useState } from "react";
import { Page } from "../components/Page";
import { Card, CardHead } from "../components/ui";
import { IconRefresh } from "../components/icons";
import { api } from "../lib/api";
import { useCaps } from "../lib/caps";
import { useMode } from "../lib/mode";
import { useI18n } from "../lib/i18n";

export default function Settings() {
  const { caps, refresh } = useCaps();
  const { mode, setMode } = useMode();
  const { t, lang, setLang } = useI18n();
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof api.settings>> | null>(null);
  useEffect(() => { api.settings().then(setCfg).catch(() => {}); }, []);

  const rows: [string, boolean | undefined, string | undefined, string][] = [
    ["nmap", caps?.nmap.available, caps?.nmap.detail, "Service/version detection, OS fingerprinting, UDP."],
    ["scapy", caps?.scapy.available, caps?.scapy.detail, "Packet capture for the Traffic Analyzer."],
    [caps?.os === "Windows" ? "Npcap" : "libpcap", caps?.pcap.available, caps?.pcap.detail, "Capture driver."],
    ["Administrator rights", caps?.is_admin, caps?.is_admin ? "running elevated" : "running as a standard user", "Needed for capture, OS detection and UDP."],
    ["WHOIS", caps?.whois.available, caps?.whois.detail, "Domain registration lookups."],
  ];

  return (
    <Page title={t("settings.title")} sub={t("settings.sub")}
      actions={<button className="btn btn-sm" onClick={refresh}><IconRefresh /> Re-detect</button>}>
      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <div className="col">
          <Card>
            <CardHead title={t("settings.language")} />
            <div className="card-pad">
              <div className="seg seg-full">
                <button className={lang === "fr" ? "on" : ""} onClick={() => setLang("fr")}>Français</button>
                <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>English</button>
              </div>
            </div>
          </Card>
          <Card>
            <CardHead title={mode === "simple" || mode === "advanced" ? (t("common.mode.simple") + " / " + t("common.mode.advanced")) : "Interface mode"} />
            <div className="card-pad col" style={{ gap: 8 }}>
              {(["simple", "advanced"] as const).map((m) => (
                <button key={m} className={`choice ${mode === m ? "on" : ""}`} onClick={() => setMode(m)} aria-pressed={mode === m}>
                  <span className="choice-title">{m === "simple" ? "Simple" : "Advanced"}</span>
                  <span className="choice-desc">{m === "simple"
                    ? "Discover devices, scan an IP, check ports, watch traffic — the essentials, nothing more."
                    : "Custom ports and timeouts, BPF filters, TCP internals, connection tables, closed-port detail."}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <CardHead title="Host capabilities" hint="0xFLUX enables only what this machine supports" />
            <div className="card-pad col" style={{ gap: 12 }}>
              {rows.map(([name, ok, detail, use]) => (
                <div key={name} className="cap-row">
                  <span className={`cap-dot ${ok ? "on" : "off"}`} />
                  <div>
                    <div>{name}</div>
                    <div className="small" style={{ color: "var(--text-2)" }}>{use}</div>
                    <div className="muted small">{detail ?? "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="col">
          <Card>
            <CardHead title="Engine" />
            <div className="card-pad">
              <dl className="kv kv-tight">
                <dt>System</dt><dd>{caps ? `${caps.os} ${caps.os_release}` : "—"}</dd>
                <dt>Backend</dt><dd>{cfg?.api ?? "—"}</dd>
                <dt>Data folder</dt><dd>{cfg?.data_dir ?? "—"}</dd>
                <dt>Latency probe</dt><dd>{cfg?.latency_target ?? "—"}</dd>
                <dt>Public targets</dt><dd>{cfg ? (cfg.restrict_to_private_by_default ? "require explicit authorisation" : "allowed") : "—"}</dd>
              </dl>
              <p className="muted small" style={{ marginTop: 12 }}>
                Change these with environment variables before starting the backend, e.g. <span className="mono">FLUX_LATENCY_TARGET=192.168.1.1:80</span>.
              </p>
            </div>
          </Card>
          <Card>
            <CardHead title="About" />
            <div className="card-pad">
              <dl className="kv kv-tight">
                <dt>Application</dt><dd>0xFLUX</dd>
                <dt>Category</dt><dd>Network Intelligence & Monitoring</dd>
                <dt>Version</dt><dd>0.1.0</dd>
                <dt>Developer</dt><dd>0x3</dd>
                <dt>Contact</dt><dd>t.me/data0x3</dd>
              </dl>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

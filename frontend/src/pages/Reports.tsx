import { useEffect, useState } from "react";
import { Page } from "../components/Page";
import { useI18n } from "../lib/i18n";
import { Card, CardHead, Empty, useToast } from "../components/ui";
import { IconDownload } from "../components/icons";
import { api, downloadExport, type ScanSummary } from "../lib/api";
import { dateTime, duration } from "../lib/format";

const FORMATS = [
  { id: "pdf" as const, name: "PDF report", desc: "Branded 0xFLUX report: scan info, hosts, ports, services, summary." },
  { id: "csv" as const, name: "CSV", desc: "One row per host and port, for spreadsheets." },
  { id: "json" as const, name: "JSON", desc: "Complete structured result, for scripts and archives." },
];

export default function Reports() {
  const { t } = useI18n();
  const toast = useToast();
  const [scans, setScans] = useState<ScanSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { api.history().then((r) => setScans(r.scans)).catch(() => setScans([])); }, []);

  const completed = scans?.filter((s) => s.status === "completed") ?? [];

  async function exp(id: number, f: "json" | "csv" | "pdf") {
    setBusy(`${id}-${f}`);
    try {
      await downloadExport(id, f);
      toast("ok", `Exported scan #${id} as ${f.toUpperCase()}.`);
    } catch (e: any) {
      toast("err", e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page title={t("reports.title")} sub={t("reports.sub")}>
      <div className="grid stats-3 mb">
        {FORMATS.map((f) => (
          <Card key={f.id}><div className="stat"><div className="label">{f.name}</div><p className="small" style={{ color: "var(--text-2)", marginTop: 6 }}>{f.desc}</p></div></Card>
        ))}
      </div>
      <Card>
        <CardHead title="Completed scans" hint={scans ? `${completed.length} available` : undefined} />
        {scans == null ? <Empty title="Loading…" /> : completed.length === 0 ? (
          <Empty title="No completed scans to export">Finished scans appear here, ready to export.</Empty>
        ) : (
          <table className="table">
            <thead><tr><th>Target</th><th>Profile</th><th>Hosts</th><th>Open ports</th><th>Duration</th><th>Date</th><th>Export</th></tr></thead>
            <tbody>
              {completed.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.target}</td>
                  <td className="small" style={{ color: "var(--text-2)" }}>{s.profile.replace(/_/g, " ")}</td>
                  <td className="num">{s.hosts_up}</td>
                  <td className="num">{s.ports_open}</td>
                  <td className="num">{duration(s.duration_s)}</td>
                  <td className="muted small">{dateTime(s.started_at)}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      {FORMATS.map((f) => (
                        <button key={f.id} className="btn btn-sm" disabled={busy === `${s.id}-${f.id}`} onClick={() => exp(s.id, f.id)}>
                          <IconDownload /> {f.id.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Page>
  );
}

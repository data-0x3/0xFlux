import type { ComponentType, SVGProps } from "react";
import { NavLink } from "react-router-dom";
import {
  IconDev, IconDiscovery, IconHistory, IconMonitor, IconOverview, IconPort,
  IconReports, IconScanner, IconSettings, IconTools, IconTraffic,
} from "./icons";
import type { Capabilities } from "../lib/api";
import { useMode } from "../lib/mode";
import { useCaps } from "../lib/caps";
import { useI18n } from "../lib/i18n";

type NavEntry = { to: string; key: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; end?: boolean } | { sep: true };

const NAV: NavEntry[] = [
  { to: "/", key: "nav.overview", Icon: IconOverview, end: true },
  { to: "/scanner", key: "nav.scanner", Icon: IconScanner },
  { to: "/discovery", key: "nav.discovery", Icon: IconDiscovery },
  { to: "/traffic", key: "nav.traffic", Icon: IconTraffic },
  { to: "/monitor", key: "nav.monitor", Icon: IconMonitor },
  { to: "/ports", key: "nav.ports", Icon: IconPort },
  { to: "/tools", key: "nav.tools", Icon: IconTools },
  { sep: true },
  { to: "/history", key: "nav.history", Icon: IconHistory },
  { to: "/reports", key: "nav.reports", Icon: IconReports },
  { to: "/settings", key: "nav.settings", Icon: IconSettings },
  { to: "/developer", key: "nav.developer", Icon: IconDev },
];

export function Sidebar({ caps }: { caps: Capabilities | null }) {
  const { mode, setMode } = useMode();
  const { online } = useCaps();
  const { t } = useI18n();
  const engine = caps?.nmap.available ? "nmap" : "python";
  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-logo" src="logo.png" alt="" width={22} height={22} />
        <span className="brand-name"><b>0x</b><span>FLUX</span></span>
      </div>
      <nav className="nav">
        {NAV.map((item, i) =>
          "sep" in item ? (
            <div className="nav-sep" key={`sep-${i}`} />
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <item.Icon />
              {t(item.key)}
            </NavLink>
          )
        )}
      </nav>
      <div className="sidebar-mode">
        <div className="seg seg-full" role="group" aria-label="Interface mode">
          <button className={mode === "simple" ? "on" : ""} onClick={() => setMode("simple")}>{t("common.mode.simple")}</button>
          <button className={mode === "advanced" ? "on" : ""} onClick={() => setMode("advanced")}>{t("common.mode.advanced")}</button>
        </div>
      </div>
      <div className="sidebar-foot">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`cap-dot ${online ? "on" : "off"}`} title={online ? t("common.engine.online") : t("common.engine.offline")} />
          <span className="mono">v0.1.0</span>
        </span>
        <span className="badge-engine">{engine}</span>
      </div>
    </aside>
  );
}

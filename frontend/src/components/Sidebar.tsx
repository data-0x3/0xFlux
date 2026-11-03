import type { ComponentType, SVGProps } from "react";
import { NavLink } from "react-router-dom";
import {
  IconDiscovery, IconGhost, IconHistory, IconMonitor, IconOverview, IconPort,
  IconDev, IconReports, IconScanner, IconSettings, IconTools, IconTraffic,
} from "./icons";
import type { Capabilities } from "../lib/api";
import { useMode } from "../lib/mode";
import { useCaps } from "../lib/caps";

type NavEntry = { to: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; end?: boolean } | { sep: true };

const NAV: NavEntry[] = [
  { to: "/", label: "Overview", Icon: IconOverview, end: true },
  { to: "/scanner", label: "Network Scanner", Icon: IconScanner },
  { to: "/discovery", label: "Network Discovery", Icon: IconDiscovery },
  { to: "/traffic", label: "Traffic Analyzer", Icon: IconTraffic },
  { to: "/monitor", label: "Network Monitor", Icon: IconMonitor },
  { to: "/ports", label: "Port Explorer", Icon: IconPort },
  { to: "/tools", label: "DNS & IP Tools", Icon: IconTools },
  { sep: true },
  { to: "/history", label: "Scan History", Icon: IconHistory },
  { to: "/reports", label: "Reports", Icon: IconReports },
  { to: "/settings", label: "Settings", Icon: IconSettings },
  { to: "/developer", label: "Developer", Icon: IconDev },
];

export function Sidebar({ caps }: { caps: Capabilities | null }) {
  const { mode, setMode } = useMode();
  const { online } = useCaps();
  const engine = caps?.nmap.available ? "nmap" : "python";
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><IconGhost width={14} height={14} /></span>
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
              {item.label}
            </NavLink>
          )
        )}
      </nav>
      <div className="sidebar-mode">
        <div className="seg seg-full" role="group" aria-label="Interface mode">
          <button className={mode === "simple" ? "on" : ""} onClick={() => setMode("simple")}>Simple</button>
          <button className={mode === "advanced" ? "on" : ""} onClick={() => setMode("advanced")}>Advanced</button>
        </div>
      </div>
      <div className="sidebar-foot">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`cap-dot ${online ? "on" : "off"}`} title={online ? "Engine online" : "Engine offline"} />
          <span className="mono">v0.1.0</span>
        </span>
        <span className="badge-engine">{engine}</span>
      </div>
    </aside>
  );
}

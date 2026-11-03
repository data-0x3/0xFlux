// Custom line-icon set for 0xFLUX. 16px grid, 1.5 stroke, currentColor.
// No emoji anywhere in navigation or UI, per the brief.
import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 16, height: 16, viewBox: "0 0 16 16", fill: "none",
  stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const, ...p,
});

export const IconOverview = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>
);
export const IconScanner = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
);
export const IconDiscovery = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="8" r="6" opacity=".9" /><path d="M8 2v2M8 12v2M2 8h2M12 8h2" /></svg>
);
export const IconTraffic = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M2 11h3l2-6 2 9 2-5h3" /></svg>
);
export const IconMonitor = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M2 8h2.5l1.5-3 2 6 1.5-3H14" /><path d="M2 13h12" opacity=".4" /></svg>
);
export const IconPort = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M2.5 6h11M6 2.5v11" opacity=".5" /></svg>
);
export const IconTools = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9.5 3.5a2.5 2.5 0 0 0 3 3l-3.5 3.5-3 3-2-2 3-3 3.5-3.5a2.5 2.5 0 0 0-1-1z" /></svg>
);
export const IconHistory = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M8 4v4l2.5 1.5" /><circle cx="8" cy="8" r="6" /></svg>
);
export const IconReports = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3M6 8h4M6 11h4" opacity=".7" /></svg>
);
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="8" cy="8" r="2" /><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8 3.4 3.4" /></svg>
);
export const IconGhost = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 13V7a5 5 0 0 1 10 0v6l-1.6-1.2L9.8 13 8 11.8 6.2 13 4.6 11.8z" /><circle cx="6.2" cy="7" r=".6" fill="currentColor" stroke="none" /><circle cx="9.8" cy="7" r=".6" fill="currentColor" stroke="none" /></svg>
);
export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4.5 3.5 12 8l-7.5 4.5z" fill="currentColor" /></svg>
);
export const IconStop = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" /></svg>
);
export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M8 2v8M5 7l3 3 3-3M3 13h10" /></svg>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 4h10M6 4V2.5h4V4M4.5 4l.5 9h6l.5-9" /></svg>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 4l8 8M12 4l-8 8" /></svg>
);
export const IconSpinner = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} className={"spin " + (p.className ?? "")}><path d="M8 2a6 6 0 1 1-6 6" /></svg>
);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 4l4 4-4 4" /></svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
);
export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M13 7a5 5 0 1 0-1 4M13 3v4h-4" /></svg>
);

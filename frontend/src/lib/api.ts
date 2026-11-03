// Typed API client for the 0xFLUX backend.
//
// In development Vite proxies /api to the backend. In the packaged Tauri app
// the page is served from tauri.localhost, so we talk to the backend directly.
const BACKEND = "127.0.0.1:8787";
const ORIGIN = import.meta.env.DEV ? "" : `http://${BACKEND}`;
const BASE = `${ORIGIN}/api`;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...init });
  } catch {
    throw new ApiError("Backend unreachable. Is the 0xFLUX service running on port 8787?", 0);
  }
  if (!res.ok) {
    let detail: string = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: any) => d.msg).join("; ");
    } catch { /* non-json error */ }
    throw new ApiError(detail, res.status);
  }
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export function wsUrl(path: string): string {
  if (import.meta.env.DEV) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}/api${path}`;
  }
  return `ws://${BACKEND}/api${path}`;
}

// ---------------------------------------------------------------- types ----
export interface Capability { available: boolean; detail: string; }
export interface Capabilities {
  os: string; os_release: string; is_admin: boolean;
  nmap: Capability; scapy: Capability; pcap: Capability;
  raw_socket_icmp: Capability; whois: Capability;
}
export interface PortRow { number: number; protocol: string; state: string; service: string | null; version: string | null; }
export interface HostRow {
  ip: string; hostname: string | null; mac: string | null; vendor: string | null;
  state: string; os_guess: string | null; latency_ms: number | null; ports: PortRow[];
}
export interface ScanSummary {
  id: number; target: string; profile: string; engine: string; status: string;
  started_at: string | null; finished_at: string | null; duration_s: number | null;
  hosts_up: number; ports_open: number; error: string | null; notes: string[];
}
export interface ScanDetail extends ScanSummary { hosts: HostRow[]; }
export interface ScanCompare {
  a: ScanDetail; b: ScanDetail;
  opened: { ip: string; port: number }[];
  closed: { ip: string; port: number }[];
  unchanged: number;
}
export interface Device {
  ip: string; mac: string | null; hostname: string | null; vendor: string | null;
  is_gateway: boolean; is_self?: boolean; status: string;
  first_seen: string; last_seen: string; open_ports: number[];
}
export interface DiscoveryResult {
  ok: boolean; error?: string; subnet?: string; gateway?: string | null;
  local_ip?: string | null; interface?: string | null; count?: number; devices: Device[];
}
export interface MonitorSample {
  upload_bps: number | null; download_bps: number | null; total_sent: number; total_recv: number;
  packets_sent: number; packets_recv: number; errors_in: number; errors_out: number;
  drops_in: number; drops_out: number; latency_ms: number | null; timestamp: number;
}
export interface LatencyPoint { t: number; ms: number | null; }
export interface LatencySummary {
  target: string; samples: number; avg_ms: number | null; min_ms: number | null;
  max_ms: number | null; loss_pct: number | null;
}
export interface Connections {
  ok: boolean; error?: string; by_status?: Record<string, number>;
  established?: { laddr: string | null; raddr: string; status: string; pid: number | null; process: string | null }[];
  total?: number;
}
export interface Interface { name: string; is_up: boolean; speed_mbps: number | null; mtu: number; ipv4: string | null; mac: string | null; }

export interface Packet {
  id: number; t: number; length: number; protocol: string;
  src: string | null; dst: string | null; sport: number | null; dport: number | null;
  flags: string | null; info: string; meta: Record<string, any>;
}
export interface CaptureIface { id: string; name: string; description: string | null; ip: string | null; mac: string | null; }
export interface CaptureStatus {
  running: boolean; session: number; iface: string | null; bpf: string | null;
  started_at: number | null; duration_s: number | null; packets: number; bytes: number;
  protocols: Record<string, number>; top_talkers: [string, number][]; error: string | null;
}

export interface ScanRequest {
  target: string; profile: string; ports?: number[] | null;
  detect_service?: boolean; detect_os?: boolean; udp?: boolean; authorized?: boolean; timeout?: number;
}

const post = (body?: unknown): RequestInit => ({ method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const q = encodeURIComponent;

export const api = {
  health: () => req<{ status: string; app: string; version: string; developer: string }>("/health"),
  settings: () => req<{ latency_target: string; restrict_to_private_by_default: boolean; data_dir: string; api: string }>("/settings"),
  capabilities: () => req<Capabilities>("/capabilities"),
  refreshCapabilities: () => req<Capabilities>("/capabilities/refresh", post()),
  interfaces: () => req<{ interfaces: Interface[] }>("/interfaces"),
  portsObserved: () => req<{ ports: Array<{ port: number; protocol: string; hosts: string[]; services: string[]; versions: string[]; last_seen: string | null }> }>("/ports/observed"),
  portsReference: () => req<{ ports: Array<{ port: number; protocol: string; name: string; desc: string }> }>("/ports/reference"),

  startScan: (body: ScanRequest) => req<{ scan_id: number; engine: string }>("/scan", post(body)),
  cancelScan: (id: number) => req<{ ok: boolean }>(`/scan/${id}/cancel`, post()),

  discover: (subnet?: string) => req<DiscoveryResult>(`/discovery/scan${subnet ? `?subnet=${q(subnet)}` : ""}`, post()),
  inventory: () => req<{ devices: Device[] }>("/discovery/inventory"),
  discoveryContext: () => req<{ subnet: string | null; local_ip: string | null; interface: string | null; gateway: string | null }>("/discovery/context"),
  clearInventory: () => req<{ ok: boolean }>("/discovery/inventory", { method: "DELETE" }),

  connections: () => req<Connections>("/monitor/connections"),
  latency: () => req<{ history: LatencyPoint[]; summary: LatencySummary }>("/monitor/latency"),

  captureInterfaces: () => req<{ interfaces: CaptureIface[] }>("/capture/interfaces"),
  captureStart: (iface: string | null, bpf: string | null) => req<CaptureStatus>("/capture/start", post({ iface, bpf })),
  captureStop: () => req<CaptureStatus>("/capture/stop", post()),
  captureClear: () => req<CaptureStatus>("/capture/clear", post()),
  captureStatus: () => req<CaptureStatus>("/capture/status"),

  history: (search?: string) => req<{ scans: ScanSummary[] }>(`/history${search ? `?q=${q(search)}` : ""}`),
  scan: (id: number) => req<ScanDetail>(`/history/${id}`),
  compare: (a: number, b: number) => req<ScanCompare>(`/history/${a}/compare/${b}`),
  deleteScan: (id: number) => req<{ ok: boolean }>(`/history/${id}`, { method: "DELETE" }),
  clearHistory: () => req<{ ok: boolean }>("/history", { method: "DELETE" }),

  dns: (name: string, type: string) => req<any>("/tools/dns", post({ name, type })),
  reverseDns: (ip: string) => req<any>(`/tools/reverse-dns?ip=${q(ip)}`),
  resolve: (host: string) => req<any>(`/tools/resolve?host=${q(host)}`),
  whois: (domain: string) => req<any>(`/tools/whois?domain=${q(domain)}`),
  ping: (host: string, count: number) => req<any>("/tools/ping", post({ host, count })),
  traceroute: (host: string, max_hops: number) => req<any>("/tools/traceroute", post({ host, max_hops })),
  subnet: (cidr: string) => req<any>(`/tools/subnet?cidr=${q(cidr)}`),
  ipinfo: (ip: string) => req<any>(`/tools/ipinfo?ip=${q(ip)}`),
};

/** Download an export as a file without navigating the app window away. */
export async function downloadExport(id: number, fmt: "json" | "csv" | "pdf"): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/history/${id}/export.${fmt}`);
  } catch {
    throw new ApiError("Backend unreachable.", 0);
  }
  if (!res.ok) throw new ApiError(`Export failed (${res.status}).`, res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `0xflux_scan_${id}.${fmt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Formatting helpers — careful to distinguish zero / unknown / unavailable.

export function bps(v: number | null | undefined): string {
  if (v == null) return "—";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let n = v, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function bytes(v: number | null | undefined): string {
  if (v == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = v, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function ms(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(v < 10 ? 2 : 0)} ms`;
}

export function duration(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function stateClass(state: string): string {
  const s = state.toLowerCase();
  if (s === "open" || s === "up") return "open";
  if (s === "filtered") return "filtered";
  if (s === "down" || s === "error") return "down";
  return "closed";
}

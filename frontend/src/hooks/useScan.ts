import { useCallback, useRef, useState } from "react";
import { api, wsUrl, type ScanDetail, type ScanRequest } from "../lib/api";

export interface ScanProgress { phase: string; done: number; total: number; message: string; }

export function useScan() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [result, setResult] = useState<ScanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scanIdRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const start = useCallback(async (req: ScanRequest) => {
    setRunning(true); setError(null); setResult(null);
    setProgress({ phase: "start", done: 0, total: 1, message: "Starting scan…" });
    try {
      const { scan_id } = await api.startScan(req);
      scanIdRef.current = scan_id;

      const ws = new WebSocket(wsUrl(`/scan/${scan_id}/ws`));
      wsRef.current = ws;
      ws.onmessage = async (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === "progress") {
          setProgress({ phase: m.phase, done: m.done, total: m.total, message: m.message });
        } else if (m.type === "complete") {
          const detail = await api.scan(scan_id);
          setResult(detail);
          setRunning(false);
          ws.close();
        } else if (m.type === "error") {
          setError(m.message);
          setRunning(false);
          ws.close();
        }
      };
      ws.onerror = () => { setError("Lost connection to scan engine."); setRunning(false); };
      ws.onclose = () => { setRunning((r) => (r ? false : r)); };
    } catch (e: any) {
      setError(e.message ?? "Failed to start scan.");
      setRunning(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    if (scanIdRef.current != null) {
      await api.cancelScan(scanIdRef.current).catch(() => {});
    }
  }, []);

  return { running, progress, result, error, start, cancel };
}

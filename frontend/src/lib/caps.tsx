import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Capabilities } from "./api";

interface CapsState {
  caps: Capabilities | null;
  online: boolean | null;   // null = still checking
  refresh: () => void;
}

const CapsCtx = createContext<CapsState>({ caps: null, online: null, refresh: () => {} });
export const useCaps = () => useContext(CapsCtx);

export function CapsProvider({ children }: { children: ReactNode }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  const load = (force = false) =>
    (force ? api.refreshCapabilities() : api.capabilities())
      .then((c) => { setCaps(c); setOnline(true); })
      .catch(() => setOnline(false));

  useEffect(() => {
    load();
    // The backend may still be booting when the window opens: retry until it answers.
    const id = setInterval(() => { if (!caps) load(); }, 2500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps]);

  return <CapsCtx.Provider value={{ caps, online, refresh: () => load(true) }}>{children}</CapsCtx.Provider>;
}

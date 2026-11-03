import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Capabilities } from "./api";

export type EngineState = "connecting" | "online" | "offline";

interface CapsState {
  caps: Capabilities | null;
  state: EngineState;
  online: boolean;            // convenience: state === "online"
  refresh: () => void;
}

// How long to keep showing the clean "starting" screen before admitting the
// engine is down. The bundled engine normally answers within ~2 s of launch.
const GRACE_MS = 12_000;

const CapsCtx = createContext<CapsState>({ caps: null, state: "connecting", online: false, refresh: () => {} });
export const useCaps = () => useContext(CapsCtx);

export function CapsProvider({ children }: { children: ReactNode }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [state, setState] = useState<EngineState>("connecting");
  const startedAt = useRef<number>(Date.now());

  const load = (force = false) =>
    (force ? api.refreshCapabilities() : api.capabilities())
      .then((c) => { setCaps(c); setState("online"); })
      .catch(() => {
        setState((prev) => {
          if (prev === "online") return "online";               // stay usable once up
          return Date.now() - startedAt.current > GRACE_MS ? "offline" : "connecting";
        });
      });

  const refresh = () => { startedAt.current = Date.now(); setState("connecting"); load(true); };

  useEffect(() => {
    load();
    const id = setInterval(() => { if (state !== "online") load(); }, 1500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <CapsCtx.Provider value={{ caps, state, online: state === "online", refresh }}>
      {children}
    </CapsCtx.Provider>
  );
}

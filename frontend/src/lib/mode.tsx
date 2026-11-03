// Simple / Advanced operating mode (per-viewer preference).
import { createContext, useContext, useState, type ReactNode } from "react";

export type Mode = "simple" | "advanced";
const KEY = "flux.mode";

function read(): Mode {
  try {
    return localStorage.getItem(KEY) === "advanced" ? "advanced" : "simple";
  } catch {
    return "simple";
  }
}

const ModeCtx = createContext<{ mode: Mode; setMode: (m: Mode) => void; advanced: boolean }>({
  mode: "simple", setMode: () => {}, advanced: false,
});
export const useMode = () => useContext(ModeCtx);

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, set] = useState<Mode>(read);
  const setMode = (m: Mode) => {
    set(m);
    try { localStorage.setItem(KEY, m); } catch { /* storage unavailable */ }
  };
  return <ModeCtx.Provider value={{ mode, setMode, advanced: mode === "advanced" }}>{children}</ModeCtx.Provider>;
}

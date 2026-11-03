// Small shared UI primitives.
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { IconClose, IconGhost } from "./icons";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function CardHead({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <h3>{title}</h3>
        {hint && <div className="hint">{hint}</div>}
      </div>
      {right}
    </div>
  );
}

export function Chip({ state, children }: { state: string; children: ReactNode }) {
  return <span className={`chip ${state}`}><span className="dot" />{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <IconGhost width={28} height={28} className="empty-mark" />
      <h4>{title}</h4>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={width ? { maxWidth: width } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 style={{ fontSize: "var(--t-md)", fontWeight: 600 }}>{title}</h3>
          <button className="btn-ghost btn btn-sm" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---- toasts ----
type Toast = { id: number; kind: "ok" | "err" | "info"; msg: string };
const ToastCtx = createContext<(kind: Toast["kind"], msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], msg: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, msg }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "ok" ? "ok" : t.kind === "err" ? "err" : ""}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

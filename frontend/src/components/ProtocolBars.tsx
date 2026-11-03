// Monochrome protocol distribution bars — interactive (click to filter).
export function ProtocolBars({ protocols, active, onPick }: {
  protocols: Record<string, number>;
  active?: string;
  onPick?: (protocol: string) => void;
}) {
  const entries = Object.entries(protocols).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (!total) return <p className="muted small">No packets yet.</p>;
  const max = entries[0][1];
  return (
    <div className="pbars">
      {entries.map(([name, n]) => (
        <button key={name} className={`pbar ${active === name ? "on" : ""}`}
          onClick={() => onPick?.(name)} disabled={!onPick} title={`${n.toLocaleString()} packets`}>
          <span className="pbar-name mono">{name}</span>
          <span className="pbar-track"><span style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="pbar-val mono">{((n / total) * 100).toFixed(1)}%</span>
        </button>
      ))}
    </div>
  );
}

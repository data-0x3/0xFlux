// Loading screen shown while the backend boots (or when it cannot be reached).
import { IconGhost } from "./icons";

export function Boot({ state }: { state: "starting" | "offline" }) {
  return (
    <div className="boot">
      <div className="boot-mark"><IconGhost width={30} height={30} /></div>
      <div className="boot-name"><b>0x</b>FLUX</div>
      {state === "starting" ? (
        <>
          <div className="boot-bar"><span /></div>
          <p>Starting network engine…</p>
        </>
      ) : (
        <>
          <p className="boot-err">The 0xFLUX service is not responding on 127.0.0.1:8787.</p>
          <p>Start it with <span className="mono">python run.py</span> in the backend folder — this screen reconnects automatically.</p>
        </>
      )}
      <div className="boot-foot">developed by 0x3</div>
    </div>
  );
}

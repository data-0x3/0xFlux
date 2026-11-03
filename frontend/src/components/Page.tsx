import type { ReactNode } from "react";

export function Page({ title, sub, actions, children }: {
  title: string; sub?: string; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {actions}
      </div>
      <div className="content">
        <div className="page">{children}</div>
      </div>
    </>
  );
}

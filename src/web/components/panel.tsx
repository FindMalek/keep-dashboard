import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  meta?: ReactNode;
  area: string;
  children: ReactNode;
}

export function Panel({ title, meta, area, children }: PanelProps) {
  return (
    <section className="panel" style={{ gridArea: area }} aria-label={title}>
      <header className="panel-header">
        <h2>{title}</h2>
        {meta !== undefined && <span className="panel-meta">{meta}</span>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

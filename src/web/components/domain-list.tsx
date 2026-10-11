import { useState } from "react";

/** First domain inline; the rest behind a "+N" chip that expands them one per line. */
export function DomainList({ domains }: { domains: string[] }) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = domains;
  if (!first) return null;

  const link = (host: string) => (
    <a key={host} className="domain" href={`https://${host}`} target="_blank" rel="noreferrer">
      {host}
    </a>
  );

  return (
    <div className="domain-list" title={rest.length ? domains.join("\n") : undefined}>
      <div className="domain-row">
        {link(first)}
        {rest.length > 0 && (
          <button type="button" className="chip chip-button" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "less" : `+${rest.length}`}
          </button>
        )}
      </div>
      {open && rest.map(link)}
    </div>
  );
}

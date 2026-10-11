import type { ReactNode } from "react";

export function Chip({ tone = "plain", children }: { tone?: "plain" | "warn" | "crit" | "solid"; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

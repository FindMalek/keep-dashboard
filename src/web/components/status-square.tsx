export type Status = "ok" | "warn" | "down";

const LABELS: Record<Status, string> = { ok: "up", warn: "degraded", down: "down" };

export function StatusSquare({ status }: { status: Status }) {
  return <span className={`status-square status-${status}`} role="img" aria-label={LABELS[status]} />;
}

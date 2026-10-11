import type { HostInfo } from "../../shared/types";

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <span>
      <span className="muted">{label}</span> {value ?? "—"}
    </span>
  );
}

export function StatusBar({ host }: { host: HostInfo | null }) {
  return (
    <footer className="status-bar">
      <div className="status-left">
        <Item label="lan" value={host?.lanIp ?? null} />
        <Item label="tailscale" value={host?.tailscaleIp ?? null} />
        <Item label="public" value={host?.publicIp ?? null} />
      </div>
      <div className="status-right">
        <span className="muted">refresh 1s</span>
      </div>
    </footer>
  );
}

import { useEffect, useState } from "react";
import type { HostInfo } from "../../shared/types";
import type { Connection } from "../lib/use-live-data";
import { duration } from "../lib/format";

const CONNECTION_LABEL: Record<Connection, string> = { connecting: "connecting", live: "live", offline: "reconnecting" };

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour12: false });
}

export function TitleBar({ host, connection }: { host: HostInfo | null; connection: Connection }) {
  const clock = useClock();

  return (
    <header className="title-bar">
      <div className="title-left">
        <h1>{host?.hostname ?? "keep"}</h1>
        {host && (
          <span className="muted">
            {host.os.toLowerCase()} · {host.kernel}
          </span>
        )}
      </div>
      <div className="title-right">
        {host && (
          <>
            <span>
              <span className="muted">up</span> {duration(host.uptimeSec)}
            </span>
            <span>
              <span className="muted">procs</span> {host.processes}
            </span>
          </>
        )}
        <span className="num">{clock}</span>
        <span className={`connection connection-${connection}`}>
          <span className="connection-square" aria-hidden="true" />
          {CONNECTION_LABEL[connection]}
        </span>
      </div>
    </header>
  );
}

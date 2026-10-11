import { useEffect, useState } from "react";

type State = "idle" | "confirm" | "sending" | "sent" | "error";

interface ActionButtonProps {
  action: string;
  label: string;
  /** Destructive actions need a second click within a few seconds. */
  confirm?: string;
  danger?: boolean;
}

const CONFIRM_WINDOW_MS = 4000;

async function send(action: string): Promise<boolean> {
  try {
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-keep-action": "1" },
      body: JSON.stringify({ action }),
    });
    return response.status === 202;
  } catch {
    return false;
  }
}

export function ActionButton({ action, label, confirm, danger = false }: ActionButtonProps) {
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (state === "idle" || state === "sending") return;
    const id = setTimeout(() => setState("idle"), state === "confirm" ? CONFIRM_WINDOW_MS : 2500);
    return () => clearTimeout(id);
  }, [state]);

  async function onClick(): Promise<void> {
    if (confirm && state !== "confirm") {
      setState("confirm");
      return;
    }
    setState("sending");
    setState((await send(action)) ? "sent" : "error");
  }

  const text = { idle: label, confirm: confirm ?? label, sending: "sending…", sent: "requested", error: "failed" }[state];

  return (
    <button
      type="button"
      className={`button${danger ? " button-danger" : ""}${state === "confirm" ? " button-armed" : ""}`}
      onClick={onClick}
      disabled={state === "sending"}
      aria-live="polite"
    >
      {text}
    </button>
  );
}

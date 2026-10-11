import type { ReactNode } from "react";
import { navigate } from "../lib/router";

export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  /** Count of things needing attention, shown in red. */
  alerts?: number;
}

export const ICONS = {
  overview: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="0.5" y="0.5" width="4.5" height="4.5" />
      <rect x="7" y="0.5" width="4.5" height="4.5" />
      <rect x="0.5" y="7" width="4.5" height="4.5" />
      <rect x="7" y="7" width="4.5" height="4.5" />
    </svg>
  ),
  jobs: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="0.5" y="0.5" width="11" height="11" />
      <path d="M6 2.5V6h3" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="0.5" y="0.5" width="11" height="11" />
      <path d="M2.5 6.5h2l1.5-3 1.5 5 1-2h1" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2.5" y="2.5" width="7" height="7" />
      <path d="M4 0.5v2M8 0.5v2M4 9.5v2M8 9.5v2M0.5 4h2M0.5 8h2M9.5 4h2M9.5 8h2" />
    </svg>
  ),
  uptime: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="0.5" y="6.5" width="2" height="5" />
      <rect x="3.5" y="4.5" width="2" height="7" />
      <rect x="6.5" y="2.5" width="2" height="9" />
      <rect x="9.5" y="0.5" width="2" height="11" />
    </svg>
  ),
  apps: (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="0.5" y="0.5" width="11" height="3" />
      <rect x="0.5" y="4.5" width="11" height="3" />
      <rect x="0.5" y="8.5" width="11" height="3" />
    </svg>
  ),
};

export function Sidebar({ items, path }: { items: NavItem[]; path: string }) {
  return (
    <nav className="sidebar" aria-label="pages">
      <span className="sidebar-label">pages</span>
      {items.map((item) => (
        <a
          key={item.path}
          href={item.path}
          className="nav-item"
          aria-current={item.path === path ? "page" : undefined}
          onClick={navigate}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
          {item.alerts ? <span className="nav-alert">{item.alerts}</span> : null}
        </a>
      ))}
    </nav>
  );
}

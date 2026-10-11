import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, meta, children }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-title">
        <h2>{title}</h2>
        {meta !== undefined && <span className="muted">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

interface TabsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function Tabs<T extends string>({ options, value, onChange, label }: TabsProps<T>) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option} type="button" className="tab" aria-pressed={option === value} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}

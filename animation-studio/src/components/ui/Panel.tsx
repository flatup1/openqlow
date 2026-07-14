import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-2xl bg-panel border border-white/5 p-4 sm:p-5 ${className}`}>
      {title && <h2 className="text-sm font-bold text-muted mb-3">{title}</h2>}
      {children}
    </section>
  );
}

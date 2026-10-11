import type { ReactNode } from "react";

export function ChartPanel({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col px-5 py-3">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="min-h-0 flex-1">{children}</div>
      {footer && <div className="mt-1 text-xs text-muted-foreground">{footer}</div>}
    </section>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div>;
}

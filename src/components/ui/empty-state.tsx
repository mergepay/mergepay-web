import { type ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-3 border-dashed border-ink/40 rounded-2xl bg-paper px-6 py-12 text-center">
      {icon && (
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-ink bg-butter shadow-brutal">
          {icon}
        </div>
      )}
      <h3 className="font-display text-lg uppercase tracking-tight">{title}</h3>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink/60">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

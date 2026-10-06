import type { LucideIcon } from "lucide-react";

type Props = { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode };

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="bg-card shadow-toga flex flex-col items-center gap-3 rounded-2xl px-6 py-9 text-center">
      <span className="bg-plata-1 ring-plata-2 flex size-14 items-center justify-center rounded-full ring-1">
        <Icon className="text-plata-ink/70 size-6" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-bold">{title}</p>
        {description && <p className="text-muted-foreground max-w-sm text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

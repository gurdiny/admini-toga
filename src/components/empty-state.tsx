import type { LucideIcon } from "lucide-react";

type Props = { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode };

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="bg-card shadow-toga flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
      <Icon className="text-muted-foreground size-8" aria-hidden />
      <div className="space-y-1">
        <p className="font-bold">{title}</p>
        {description && <p className="text-muted-foreground max-w-sm text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

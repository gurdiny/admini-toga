type Props = { title: string; description?: React.ReactNode; actions?: React.ReactNode };

/** Título de pantalla: la acción principal va en la misma fila (también en celular). */
export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="mb-5 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-[1.75rem] leading-tight font-bold tracking-tight">{title}</h1>
        {actions && <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div>}
      </div>
      {description && <p className="text-muted-foreground text-sm">{description}</p>}
    </div>
  );
}

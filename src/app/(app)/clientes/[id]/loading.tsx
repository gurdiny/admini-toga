import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy aria-label="Cargando cliente">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}

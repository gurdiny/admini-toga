import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { BUCKET_LABELS, bucketHref } from "@/modules/reminders/buckets";
import { getReminderCounts } from "@/modules/reminders/queries";

// Provisional: el dashboard real llega en la Fase 7.
export default async function Home() {
  const user = await requireUser();
  const { modules } = await getSettings();
  const counts = modules.reminders ? await getReminderCounts() : null;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Hola, {user.name}</h1>
      {counts && (
        <section aria-label="Recordatorios" className="grid grid-cols-3 gap-3">
          {(["manana", "hoy", "atrasados"] as const).map((bucket) => {
            const alert = bucket === "atrasados" && counts.atrasados > 0;
            return (
              <Link
                key={bucket}
                href={bucketHref(bucket)}
                className={cn("bg-card shadow-toga rounded-2xl p-4", alert && "ring-destructive/40 text-destructive ring-1")}
              >
                <p className="text-2xl font-bold tabular-nums">{counts[bucket]}</p>
                <p className="text-sm">{BUCKET_LABELS[bucket]}</p>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}

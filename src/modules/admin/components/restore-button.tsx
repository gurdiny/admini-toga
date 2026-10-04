"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { restoreRecord } from "../actions/trash";
import type { TrashType } from "../queries";

export function RestoreButton({ type, id, title }: { type: TrashType; id: string; title: string }) {
  const restore = useAction(restoreRecord, { success: `${title} restaurado.` });
  return (
    <Button variant="outline" size="sm" disabled={restore.pending} onClick={() => restore.run({ type, id })} aria-label={`Restaurar ${title}`}>
      <RotateCcw aria-hidden /> {restore.pending ? "Restaurando…" : "Restaurar"}
    </Button>
  );
}

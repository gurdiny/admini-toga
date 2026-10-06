"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientOption } from "../queries";
import { ReminderFormDialog } from "./reminder-form-dialog";

type Props = {
  className?: string;
  client?: ClientOption;
  label?: string;
  /** En celular solo dice «Nuevo» (cabe junto al título); el nombre accesible sigue completo. */
  compact?: boolean;
};

export function NewReminderButton({ className, client, label = "Nuevo recordatorio", compact }: Props) {
  return (
    <ReminderFormDialog
      presetClient={client}
      trigger={
        <Button variant="brand" className={className} aria-label={compact ? label : undefined}>
          <Plus aria-hidden />
          {compact ? (
            <>
              <span className="md:hidden">Nuevo</span>
              <span className="hidden md:inline">{label}</span>
            </>
          ) : (
            label
          )}
        </Button>
      }
    />
  );
}

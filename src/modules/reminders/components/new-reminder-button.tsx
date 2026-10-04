"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientOption } from "../queries";
import { ReminderFormDialog } from "./reminder-form-dialog";

export function NewReminderButton({ className, client, label = "Nuevo recordatorio" }: { className?: string; client?: ClientOption; label?: string }) {
  return (
    <ReminderFormDialog
      presetClient={client}
      trigger={
        <Button variant="brand" className={className}>
          <Plus aria-hidden />
          {label}
        </Button>
      }
    />
  );
}

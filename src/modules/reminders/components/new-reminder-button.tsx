"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReminderFormDialog } from "./reminder-form-dialog";

export function NewReminderButton({ className }: { className?: string }) {
  return (
    <ReminderFormDialog
      trigger={
        <Button variant="brand" className={className}>
          <Plus aria-hidden />
          Nuevo recordatorio
        </Button>
      }
    />
  );
}

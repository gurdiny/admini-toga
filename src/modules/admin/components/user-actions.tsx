"use client";

import { useState } from "react";
import { KeyRound, MoreVertical, Pencil, Plus, UserCheck, UserX, Wand2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field, FormError } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma/browser";
import { createUser, resetPassword, setUserActive, updateUser } from "../actions/users";
import { suggestPassword } from "../rules";
import type { UserRow } from "../queries";

const ROLE_LABELS: Record<Role, { label: string; detail: string }> = {
  STAFF: { label: "Mostrador", detail: "Captura pagos, proveedores y recordatorios. No ve totales." },
  OWNER: { label: "Dueño", detail: "Todo, incluidos totales y Administración." },
};

export function RoleBadgeText({ role }: { role: Role }) {
  return <>{ROLE_LABELS[role].label}</>;
}

function RolePicker({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">Rol</legend>
      <div className="grid gap-2" role="radiogroup" aria-label="Rol">
        {(["STAFF", "OWNER"] as const).map((role) => (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={value === role}
            onClick={() => onChange(role)}
            className={cn("rounded-2xl border p-3 text-left", value === role ? "border-toga-green bg-toga-green-soft" : "hover:bg-muted")}
          >
            <span className="block text-sm font-bold">{ROLE_LABELS[role].label}</span>
            <span className="text-muted-foreground block text-sm">{ROLE_LABELS[role].detail}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PasswordField({ id, value, onChange, error }: { id: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label="Contraseña" htmlFor={id} required error={error} hint="Mínimo 8 caracteres. Dísela en persona.">
      <div className="flex gap-2">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" className="h-11 font-mono" />
        <Button type="button" variant="outline" className="h-11" onClick={() => onChange(suggestPassword())}>
          <Wand2 aria-hidden /> Sugerir
        </Button>
      </div>
    </Field>
  );
}

function Footer({ pending, submitLabel, form, onCancel }: { pending: boolean; submitLabel: string; form: string; onCancel: () => void }) {
  return (
    <DialogFooter>
      <Button type="button" variant="ghost" size="lg" onClick={onCancel} disabled={pending} className="sm:h-10 sm:text-sm">
        Cancelar
      </Button>
      <Button type="submit" form={form} variant="brand" size="lg" disabled={pending} className="sm:h-10 sm:text-sm">
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </DialogFooter>
  );
}

export function NewUserButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="brand" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Nuevo usuario
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <NewUserForm onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewUserForm({ onDone }: { onDone: () => void }) {
  const [values, setValues] = useState({ name: "", email: "", role: "STAFF" as Role, password: suggestPassword() });
  const create = useAction(createUser, { errorToast: false, success: (u) => `${u.name} ya puede entrar con su correo y la contraseña.`, onSuccess: onDone });
  const errors = create.fieldErrors;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Nuevo usuario</DialogTitle>
        <DialogDescription>Entra con su correo y la contraseña que pongas aquí.</DialogDescription>
      </DialogHeader>
      <form
        id="user-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.run(values);
        }}
      >
        <FormError message={create.error && !Object.keys(errors).length ? create.error : null} />
        <Field label="Nombre" htmlFor="u-name" required error={errors.name}>
          <Input id="u-name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} className="h-11" autoFocus />
        </Field>
        <Field label="Correo" htmlFor="u-email" required error={errors.email}>
          <Input id="u-email" type="email" inputMode="email" autoCapitalize="none" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} className="h-11" />
        </Field>
        <PasswordField id="u-password" value={values.password} onChange={(password) => setValues({ ...values, password })} error={errors.password} />
        <RolePicker value={values.role} onChange={(role) => setValues({ ...values, role })} />
      </form>
      <Footer pending={create.pending} submitLabel="Crear usuario" form="user-form" onCancel={onDone} />
    </>
  );
}

export function UserRowActions({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const [dialog, setDialog] = useState<"edit" | "password" | "deactivate" | null>(null);
  const close = () => setDialog(null);
  const activate = useAction(setUserActive, { success: `${user.name} puede volver a entrar.` });
  const deactivate = useAction(setUserActive, { success: `${user.name} ya no puede entrar. Su historial se conserva.`, onSuccess: close });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Opciones de ${user.name}`}>
            <MoreVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil aria-hidden /> Editar nombre y rol
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("password")}>
            <KeyRound aria-hidden /> Cambiar contraseña
          </DropdownMenuItem>
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              {user.isActive ? (
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("deactivate")}>
                  <UserX aria-hidden /> Desactivar
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => activate.run({ id: user.id, isActive: true })}>
                  <UserCheck aria-hidden /> Activar
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "edit" || dialog === "password"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {dialog === "edit" && <EditUserForm user={user} onDone={close} />}
          {dialog === "password" && <PasswordForm user={user} isSelf={isSelf} onDone={close} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={dialog === "deactivate"}
        onOpenChange={(open) => !open && close()}
        title={`¿Desactivar a ${user.name}?`}
        description="Se cierra su sesión y ya no podrá entrar. Todo lo que capturó se conserva y puedes volver a activarlo."
        confirmLabel="Desactivar"
        pending={deactivate.pending}
        onConfirm={() => deactivate.run({ id: user.id, isActive: false })}
      />
    </>
  );
}

function EditUserForm({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const [values, setValues] = useState({ name: user.name, role: user.role as Role });
  const update = useAction(updateUser, { errorToast: false, success: "Usuario actualizado.", onSuccess: onDone });
  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar usuario</DialogTitle>
        <DialogDescription>{user.email}</DialogDescription>
      </DialogHeader>
      <form
        id="edit-user-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.run({ id: user.id, ...values });
        }}
      >
        <FormError message={update.error && !Object.keys(update.fieldErrors).length ? update.error : null} />
        <Field label="Nombre" htmlFor="eu-name" required error={update.fieldErrors.name}>
          <Input id="eu-name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} className="h-11" />
        </Field>
        <RolePicker value={values.role} onChange={(role) => setValues({ ...values, role })} />
      </form>
      <Footer pending={update.pending} submitLabel="Guardar cambios" form="edit-user-form" onCancel={onDone} />
    </>
  );
}

function PasswordForm({ user, isSelf, onDone }: { user: UserRow; isSelf: boolean; onDone: () => void }) {
  const [password, setPassword] = useState(suggestPassword);
  const reset = useAction(resetPassword, {
    errorToast: false,
    success: isSelf ? "Tu contraseña cambió." : `Contraseña de ${user.name} cambiada. Se cerraron sus sesiones abiertas.`,
    onSuccess: onDone,
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>Cambiar contraseña</DialogTitle>
        <DialogDescription>
          {user.name} · {user.email}
        </DialogDescription>
      </DialogHeader>
      <form
        id="password-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          reset.run({ userId: user.id, password });
        }}
      >
        <FormError message={reset.error && !Object.keys(reset.fieldErrors).length ? reset.error : null} />
        <PasswordField id="pw-new" value={password} onChange={setPassword} error={reset.fieldErrors.password} />
      </form>
      <Footer pending={reset.pending} submitLabel="Cambiar contraseña" form="password-form" onCancel={onDone} />
    </>
  );
}

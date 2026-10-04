"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DayInput } from "@/components/form/day-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ENTITY_LABELS } from "../audit-format";

const ALL = "todos";

type Props = {
  users: { id: string; name: string }[];
  value: { usuario: string; entidad: string; desde: string; hasta: string };
};

/** Filtros de la auditoría. Viven en la URL: sobreviven a recargar. */
export function AuditFilters({ users, value }: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState(value);
  const set = (key: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [key]: v }));

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, v] of Object.entries(filters)) if (v && v !== ALL) params.set(key, v);
    router.push(params.size ? `/admin/auditoria?${params}` : "/admin/auditoria");
  }

  return (
    <form onSubmit={apply} className="bg-card shadow-toga mb-4 grid gap-3 rounded-2xl p-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="f-user">Quién</Label>
        <Select value={filters.usuario || ALL} onValueChange={(v) => set("usuario", v)}>
          <SelectTrigger id="f-user" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-entity">Qué</Label>
        <Select value={filters.entidad || ALL} onValueChange={(v) => set("entidad", v)}>
          <SelectTrigger id="f-entity" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todo</SelectItem>
            {Object.entries(ENTITY_LABELS).map(([entity, label]) => (
              <SelectItem key={entity} value={entity}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-from">Desde</Label>
        <DayInput id="f-from" value={filters.desde} onChange={(v) => set("desde", v)} shortcuts={[]} clearable placeholder="Cualquier día" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-to">Hasta</Label>
        <DayInput id="f-to" value={filters.hasta} onChange={(v) => set("hasta", v)} shortcuts={[]} clearable placeholder="Hoy" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:flex sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/auditoria")}>
          Limpiar
        </Button>
        <Button type="submit" variant="outline">
          Aplicar filtros
        </Button>
      </div>
    </form>
  );
}

"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMXN } from "@/lib/money";

export type CategorySlice = { id: string; name: string; color: string; total: string; count: number };

const ROW = 34;

/**
 * Gasto por categoría del mes: barras horizontales de un solo tono (es una
 * magnitud, no identidad), ordenadas de mayor a menor, con el monto escrito al
 * final de cada barra. El punto de color junto al nombre es el de la categoría
 * en el resto de la app. Las barras usan Number() solo para dibujar: los
 * textos salen del string calculado con Decimal.
 */
export function CategoryChart({ data, total }: { data: CategorySlice[]; total: string }) {
  const rows = data.map((d) => ({ ...d, value: Number(d.total), share: Math.round((Number(d.total) / (Number(total) || 1)) * 100) }));
  return (
    <figure className="m-0">
      <div style={{ height: rows.length * ROW + 8 }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 92, bottom: 4, left: 0 }} barCategoryGap={8}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="name"
              width={112}
              axisLine={false}
              tickLine={false}
              interval={0}
              tick={(props) => <CategoryTick {...props} rows={rows} />}
            />
            <Tooltip cursor={{ fill: "var(--muted)", radius: 8 }} content={<ChartTooltip />} isAnimationActive={false} />
            <Bar dataKey="value" fill="var(--toga-pink-strong)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
              <LabelList
                dataKey="total"
                position="right"
                offset={8}
                formatter={(value) => formatMXN(String(value))}
                className="fill-foreground text-xs font-bold tabular-nums"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Para lectores de pantalla: la misma información en tabla. */}
      <table className="sr-only">
        <caption>Gasto por categoría</caption>
        <thead>
          <tr>
            <th>Categoría</th>
            <th>Monto</th>
            <th>Porcentaje</th>
            <th>Pagos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{formatMXN(r.total)}</td>
              <td>{r.share}%</td>
              <td>{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

type Row = CategorySlice & { value: number; share: number };

/** Nombre con su punto de color, pegado a la izquierda de la tarjeta. */
function CategoryTick({ y, payload, rows }: { y?: number | string; payload?: { value: string; index: number }; rows: Row[] }) {
  const row = rows[payload?.index ?? 0];
  const name = row?.name ?? payload?.value ?? "";
  return (
    <g transform={`translate(0,${Number(y)})`}>
      <circle cx={6} cy={0} r={4} fill={row?.color ?? "var(--muted-foreground)"} />
      <text x={16} y={0} dy="0.35em" className="fill-foreground text-xs">
        {name.length > 13 ? `${name.slice(0, 12)}…` : name}
      </text>
      <title>{name}</title>
    </g>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="bg-popover shadow-toga-sm rounded-xl border px-3 py-2 text-sm">
      <p className="flex items-center gap-1.5 font-bold">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: row.color }} aria-hidden />
        {row.name}
      </p>
      <p className="tabular-nums">
        {formatMXN(row.total)} <span className="text-muted-foreground">· {row.share}%</span>
      </p>
      <p className="text-muted-foreground text-xs">
        {row.count} pago{row.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

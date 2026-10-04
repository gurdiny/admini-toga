import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Balances } from "../queries";

/** Saldo por moneda. Sin saldo: "Al corriente" en verde. */
export function BalanceText({ balances, className }: { balances: Balances; className?: string }) {
  const entries = Object.entries(balances);
  if (!entries.length) {
    return <span className={cn("text-toga-green-strong font-bold", className)}>Al corriente</span>;
  }
  return (
    <span className={cn("font-bold tabular-nums", className)}>
      {entries.map(([currency, amount]) => formatMoney(amount, currency)).join(" + ")}
    </span>
  );
}

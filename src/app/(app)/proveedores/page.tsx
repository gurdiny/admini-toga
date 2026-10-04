import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Search, Truck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { formatPhone } from "@/components/phone-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canAdminister } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatCode } from "@/lib/codes";
import { BalanceText } from "@/modules/payments/components/balance-text";
import { NewSupplierButton } from "@/modules/payments/components/new-supplier-button";
import { getCaptureOptions, listSuppliers } from "@/modules/payments/queries";

export const metadata: Metadata = { title: "Proveedores" };

export default async function SuppliersPage({ searchParams }: PageProps<"/proveedores">) {
  const user = await requireUser();
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const showInactive = canAdminister(user) && params.inactivos === "1";

  const [suppliers, options] = await Promise.all([
    listSuppliers({ search, includeInactive: showInactive }),
    getCaptureOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Proveedores"
        description="Toca un proveedor para ver su estado de cuenta, registrar adeudos y abonos."
        actions={<NewSupplierButton categories={options.supplierCategories} />}
      />

      <form className="mb-4 flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" aria-hidden />
          <Input
            name="q"
            defaultValue={search}
            placeholder="Nombre, contacto, teléfono o PROV-0001"
            aria-label="Buscar proveedor"
            type="search"
            enterKeyHint="search"
            className="bg-card h-12 rounded-full pl-10"
          />
        </div>
        {showInactive && <input type="hidden" name="inactivos" value="1" />}
        <Button type="submit" variant="outline" className="hidden h-12 sm:inline-flex">
          Buscar
        </Button>
      </form>

      {canAdminister(user) && (
        <p className="mb-3 text-sm">
          <Link
            href={{ pathname: "/proveedores", query: { ...(search && { q: search }), ...(!showInactive && { inactivos: "1" }) } }}
            className="text-muted-foreground inline-flex min-h-10 items-center underline underline-offset-4"
          >
            {showInactive ? "Ocultar desactivados" : "Ver también desactivados"}
          </Link>
        </p>
      )}

      {suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={search ? `Ningún proveedor coincide con «${search}»` : "Todavía no hay proveedores"}
          description={search ? "Revisa cómo está escrito o búscalo por teléfono." : "Da de alta al primero. Si ya le debes algo, puedes registrarlo en el mismo paso."}
          action={!search && <NewSupplierButton categories={options.supplierCategories} />}
        />
      ) : (
        <ul className="bg-card shadow-toga divide-y overflow-hidden rounded-2xl">
          {suppliers.map((s) => (
            <li key={s.id}>
              <Link href={`/proveedores/${s.id}`} className="hover:bg-muted/60 flex min-h-16 items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {s.name}
                    {!s.isActive && <span className="text-muted-foreground font-normal"> · desactivado</span>}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {formatCode("supplier", s.code)}
                    {s.categoryName && ` · ${s.categoryName}`}
                    {s.contactName && ` · ${s.contactName}`}
                    {s.phone && ` · ${formatPhone(s.phone)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">Le debes</p>
                  <BalanceText balances={s.balances} className="text-sm" />
                </div>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

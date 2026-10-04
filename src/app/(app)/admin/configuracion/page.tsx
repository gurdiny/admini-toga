import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "@/modules/admin/components/settings-form";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Configuración" description="Valores que antes estarían escritos en el código." />
      <SettingsForm
        initial={{
          businessName: s.businessName,
          defaultCurrency: s.defaultCurrency === "USD" ? "USD" : "MXN",
          defaultPaymentMethod: s.defaultPaymentMethod,
          overdueLookbackDays: s.overdueLookbackDays,
          readyMessage: s.readyMessage,
          modules: s.modules,
        }}
      />
    </>
  );
}

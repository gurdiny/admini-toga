import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ADMIN_SECTIONS } from "@/modules/admin/sections";

export const metadata: Metadata = { title: "Administración" };

export default function AdminPage() {
  return (
    <>
      <PageHeader title="Administración" description="Todo lo que se puede cambiar sin tocar el código." />
      <ul className="grid gap-3 sm:grid-cols-2">
        {ADMIN_SECTIONS.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="bg-card shadow-toga flex min-h-20 items-center gap-4 rounded-2xl p-4">
              <span className="bg-toga-pink-soft text-toga-pink-strong flex size-11 shrink-0 items-center justify-center rounded-full">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{label}</span>
                <span className="text-muted-foreground block text-sm">{description}</span>
              </span>
              <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

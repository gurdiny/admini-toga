"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Botón «Exportar» con Excel y CSV. `href` es la ruta de descarga con los
 * filtros de la página ya puestos (/api/exportar/pagos?rango=mes…); aquí solo
 * se agrega el formato. El archivo lo arma el servidor.
 */
export function ExportMenu({ href, description, className }: { href: string; description: string; className?: string }) {
  const withFormat = (format: "xlsx" | "csv") => `${href}${href.includes("?") ? "&" : "?"}formato=${format}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-10", className)}>
          <Download aria-hidden />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">{description}</DropdownMenuLabel>
        <DropdownMenuItem asChild className="min-h-11">
          <a href={withFormat("xlsx")} download>
            <FileSpreadsheet aria-hidden />
            Excel (.xlsx)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-11">
          <a href={withFormat("csv")} download>
            <FileText aria-hidden />
            CSV
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

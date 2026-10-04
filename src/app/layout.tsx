import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Fuentes de la marca TOGA (las mismas que usa toga.mx).
// Neulis Neue para texto; Neulis Sans Bold para títulos.
const neulisNeue = localFont({
  variable: "--font-neulis-neue",
  display: "swap",
  src: [
    { path: "./fonts/NeulisNeue-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/NeulisNeue-Bold.woff2", weight: "700", style: "normal" },
  ],
});

const neulisSans = localFont({
  variable: "--font-neulis-sans",
  display: "swap",
  src: [{ path: "./fonts/NeulisSans-Bold.woff2", weight: "700", style: "normal" }],
});

export const metadata: Metadata = {
  title: { default: "TOGA — Control interno", template: "%s · TOGA" },
  description: "Pagos a proveedores y recordatorios de pedidos de TOGA Plata .925",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`${neulisNeue.variable} ${neulisSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}

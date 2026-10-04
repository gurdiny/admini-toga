import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empaqueta solo lo necesario para correr en Docker (Fase 8).
  output: "standalone",
  // Solo desarrollo: permite abrir `npm run dev` desde el celular en la red de
  // la casa/tienda (http://192.168.x.x:3000). Sin esto Next.js bloquea sus
  // archivos y la página queda a medias. No afecta producción.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // Indicador de Next.js (solo desarrollo) arriba: abajo tapaba la barra de navegación del celular.
  devIndicators: { position: "top-right" },
};

export default nextConfig;

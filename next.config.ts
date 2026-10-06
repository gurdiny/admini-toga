import type { NextConfig } from "next";

// Encabezados de seguridad en todas las respuestas.
const SECURITY_HEADERS = [
  // Nadie puede meter la app en un iframe (clickjacking: engañar al dueño para
  // que toque «Borrar» en una página ajena).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Los enlaces a WhatsApp no se llevan la URL interna (?q=, folios…).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Solo en producción (en desarrollo es http). Sin includeSubDomains: no
  // todos los subdominios de toga.mx son de esta app.
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
];

const nextConfig: NextConfig = {
  // Empaqueta solo lo necesario para correr en Docker (Fase 8).
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Solo desarrollo: permite abrir `npm run dev` desde el celular en la red de
  // la casa/tienda (http://192.168.x.x:3000). Sin esto Next.js bloquea sus
  // archivos y la página queda a medias. No afecta producción.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // Indicador de Next.js (solo desarrollo) arriba: abajo tapaba la barra de navegación del celular.
  devIndicators: { position: "top-right" },
};

export default nextConfig;

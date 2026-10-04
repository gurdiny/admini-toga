import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empaqueta solo lo necesario para correr en Docker (Fase 8).
  output: "standalone",
};

export default nextConfig;

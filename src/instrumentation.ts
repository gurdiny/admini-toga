// Corre una vez al arrancar el servidor de Next.js (no en el navegador).
// Lo de Node va en un módulo aparte para que no entre al bundle de Edge.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

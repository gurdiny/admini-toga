"use client";

// Último recurso: falló el layout raíz, así que aquí no hay fuentes, Tailwind
// ni componentes de la app. Estilos en línea con los colores de TOGA.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es-MX">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          background: "#f5f5f5",
          color: "#1a1a1a",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: 360 }}>
          <p style={{ color: "#c23d73", fontWeight: 700, letterSpacing: 2 }}>TOGA</p>
          <h1 style={{ fontSize: 22, margin: "8px 0" }}>Algo salió mal</h1>
          <p style={{ color: "#666", fontSize: 14 }}>La app tuvo un error inesperado. Intenta de nuevo; si sigue fallando, avísale al dueño.</p>
          {error.digest && <p style={{ color: "#666", fontSize: 12 }}>Código: {error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 16, width: "100%", height: 48, border: 0, borderRadius: 999, background: "#c23d73", color: "#fff", fontSize: 16, fontWeight: 700 }}
          >
            Intentar de nuevo
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- recarga completa a propósito: el layout falló */}
          <a href="/" style={{ display: "block", marginTop: 12, padding: 12, color: "#1a1a1a" }}>
            Regresar al inicio
          </a>
        </main>
      </body>
    </html>
  );
}

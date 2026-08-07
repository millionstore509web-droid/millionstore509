"use client";
export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Segoe UI', sans-serif",
        background: "#f0f0f0",
        padding: "24px",
        textAlign: "center",
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: "80px",
          height: "80px",
          borderRadius: "20px",
          overflow: "hidden",
          marginBottom: "24px",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
        }}
      >
        <img
          src="/icons/icon-192x192.png"
          alt="MillionStore"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>

      <span style={{ fontSize: "64px", marginBottom: "16px" }}>📡</span>

      <h1
        style={{
          fontSize: "24px",
          fontWeight: 900,
          color: "#1a1a2e",
          margin: "0 0 12px",
        }}
      >
        Ou pa konekte
      </h1>

      <p
        style={{
          fontSize: "15px",
          color: "#666",
          maxWidth: "300px",
          lineHeight: 1.6,
          margin: "0 0 32px",
        }}
      >
        Ou bezwen koneksyon entènèt pou wè pwodwi yo. Tanpri tcheke koneksyon
        ou epi eseye ankò.
      </p>

      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "14px 32px",
          background: "#1a1a2e",
          color: "#fff",
          border: "none",
          borderRadius: "14px",
          fontSize: "15px",
          fontWeight: 700,
          cursor: "pointer",
          marginBottom: "16px",
        }}
      >
        🔄 Eseye ankò
      </button>

      <a
        href={`https://wa.me/50938083793`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          color: "#25D366",
          fontWeight: 700,
          fontSize: "14px",
          textDecoration: "none",
        }}
      >
        💬 Kontakte nou sou WhatsApp
      </a>
    </main>
  );
}
// next.config.js — Remplace ton next.config existant
/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Headers HTTP pour PWA ──────────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },

  // ── Images externes autorisées ─────────────────────────────────────────
  images: {
    domains: [
      "i.ibb.co",
      "firebasestorage.googleapis.com",
    ],
    unoptimized: true, // pour compatibilité si tu déploies sur un hébergeur static
  },
};

module.exports = nextConfig;
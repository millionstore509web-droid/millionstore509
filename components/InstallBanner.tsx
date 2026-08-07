// components/InstallBanner.tsx
"use client";

import { useEffect, useState } from "react";
import { usePWA } from "@/hooks/usePWA";

export function InstallBanner() {
  const { installPrompt, isInstalled, isOnline, promptInstall } = usePWA();
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent;
    const iosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(iosDevice);
  }, []);

  const handleInstallClick = () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }
    promptInstall();
  };

  // Bannière hors-ligne
  if (!isOnline) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "#e63946",
          color: "#fff",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          fontSize: "13px",
          fontWeight: 700,
        }}
      >
        📡 Ou pa konekte — Kèk fonksyon ka pa disponib
      </div>
    );
  }

  // Bannière installation — sèlman kache si deja enstale oswa fèmen
  if (isInstalled || dismissed) return null;

  // Sou Android/Chrome san installPrompt disponib toujou (evènman poko rive), pa gen anyen pou montre
  if (!isIOS && !installPrompt) return null;

  return (
    <>
      <div
        style={{
          position: "relative",
          zIndex: 100,
          background: "#1a1a2e",
          color: "#fff",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            overflow: "hidden",
            flexShrink: 0,
            background: "#fff",
          }}
        >
          <img
            src="/icons/icon-192x192.png"
            alt="MillionStore"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>

        {/* Texte */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: 800, lineHeight: 1 }}>
            Installer MillionStore
          </p>
          <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#aaa", lineHeight: 1.3 }}>
            Ajoute sou ekran prensipal ou
          </p>
        </div>

        {/* Boutons */}
        <button
          onClick={handleInstallClick}
          style={{
            background: "none",
            border: "none",
            color: "#4dabf7",
            fontWeight: 700,
            fontSize: "14px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Installer
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.5)",
            fontSize: "18px",
            cursor: "pointer",
            flexShrink: 0,
            padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>

      {/* Modal enstriksyon iPhone/Safari */}
      {showIOSInstructions && (
        <div
          onClick={() => setShowIOSInstructions(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 6000,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              width: "100%",
              maxWidth: "480px",
              padding: "24px",
              textAlign: "center",
            }}
          >
            <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "0 auto 20px" }} />
            <p style={{ fontSize: "40px", margin: "0 0 12px" }}>📲</p>
            <h3 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 800, color: "#1a1a2e" }}>
              Installer sur iPhone
            </h3>
            <div style={{ textAlign: "left", background: "#f8f9fa", borderRadius: "14px", padding: "16px" }}>
              <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#333", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <span style={{ background: "#1a1a2e", color: "#fff", borderRadius: "50%", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0 }}>1</span>
                Appuyez sur les <strong>3 petits points (⋯)</strong> en bas de l'écran
              </p>
              <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#333", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <span style={{ background: "#1a1a2e", color: "#fff", borderRadius: "50%", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0 }}>2</span>
                Appuyez sur <strong>« Partager »</strong>
              </p>
              <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#333", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <span style={{ background: "#1a1a2e", color: "#fff", borderRadius: "50%", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0 }}>3</span>
                Descendez et appuyez sur <strong>« Sur l'écran d'accueil »</strong>
              </p>
              <p style={{ margin: 0, fontSize: "14px", color: "#333", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <span style={{ background: "#1a1a2e", color: "#fff", borderRadius: "50%", width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0 }}>4</span>
                Appuyez sur <strong>« Ajouter »</strong>
              </p>
            </div>
            <button
              onClick={() => { setShowIOSInstructions(false); setDismissed(true); }}
              style={{
                width: "100%",
                marginTop: "20px",
                padding: "14px",
                background: "#1a1a2e",
                color: "#fff",
                border: "none",
                borderRadius: "12px",
                fontSize: "15px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              J'ai compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}
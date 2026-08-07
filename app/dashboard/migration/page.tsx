"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface MigrationResult {
  uid: string;
  nom: string;
  status: "success" | "skipped" | "error";
  message?: string;
}

export default function MigrationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MigrationResult[]>([]);
  const [done, setDone] = useState(false);

  const runMigration = async () => {
    if (loading) return;
    setLoading(true);
    setResults([]);
    setDone(false);

    const migrationResults: MigrationResult[] = [];

    try {
      const snap = await getDoc(doc(db, "sitelogin", "loginsite"));
      if (!snap.exists()) {
        setResults([{ uid: "-", nom: "-", status: "error", message: "Dokiman sitelogin/loginsite pa egziste." }]);
        setLoading(false);
        setDone(true);
        return;
      }

      const users = snap.data()?.users ?? {};
      const entries = Object.entries(users) as [string, any][];

      if (entries.length === 0) {
        setResults([{ uid: "-", nom: "-", status: "error", message: "Okenn itilizatè jwenn nan 'users' map la." }]);
        setLoading(false);
        setDone(true);
        return;
      }

      for (const [uid, userData] of entries) {
        try {
          // Verifye si dokiman an deja egziste nan siteUsers pou evite ekrazman
          // si ou kouri migration an 2 fwa pa aksidan.
          const existingSnap = await getDoc(doc(db, "siteUsers", uid));
          if (existingSnap.exists()) {
            migrationResults.push({ uid, nom: userData.nom || uid, status: "skipped", message: "Deja egziste nan siteUsers" });
            continue;
          }

          await setDoc(doc(db, "siteUsers", uid), userData);
          migrationResults.push({ uid, nom: userData.nom || uid, status: "success" });
        } catch (e: any) {
          migrationResults.push({ uid, nom: userData?.nom || uid, status: "error", message: e?.message || "Erreur inconnue" });
        }
      }

      setResults(migrationResults);
    } catch (e: any) {
      setResults([{ uid: "-", nom: "-", status: "error", message: e?.message || "Erreur lors de la lecture du document." }]);
    }

    setLoading(false);
    setDone(true);
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return (
    <div style={{ minHeight: "100vh", background: "#fdf0ee", fontFamily: "'Segoe UI', sans-serif", padding: "24px 16px", display: "flex", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "20px", padding: "28px 22px", maxWidth: "480px", width: "100%", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", height: "fit-content" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: 900, color: "#1a1a2e" }}>🔄 Migration des utilisateurs</h2>
        <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#888", lineHeight: 1.5 }}>
          Copie chaque utilisateur de <code>sitelogin/loginsite.users</code> vers un document séparé dans <code>siteUsers/&#123;uid&#125;</code>.
          Les utilisateurs déjà présents dans <code>siteUsers</code> seront ignorés (pas d'écrasement).
        </p>

        <button
          onClick={runMigration}
          disabled={loading}
          style={{ width: "100%", padding: "14px", background: loading ? "#888" : "#1a1a2e", color: "#fff", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", marginBottom: "18px" }}
        >
          {loading ? "⏳ Migration en cours..." : "🚀 Lancer la migration"}
        </button>

        {done && (
          <div style={{ background: "#f8f9fa", borderRadius: "12px", padding: "12px 14px", marginBottom: "14px", fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>
            ✅ {successCount} migré{successCount > 1 ? "s" : ""} &nbsp;|&nbsp; ⏭️ {skippedCount} ignoré{skippedCount > 1 ? "s" : ""} &nbsp;|&nbsp; ❌ {errorCount} erreur{errorCount > 1 ? "s" : ""}
          </div>
        )}

        {results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "400px", overflowY: "auto" }}>
            {results.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  background: r.status === "success" ? "#e8fdf0" : r.status === "skipped" ? "#fff8e6" : "#fff0f0",
                  fontSize: "12px",
                }}
              >
                <span style={{ fontWeight: 700, color: "#1a1a2e" }}>
                  {r.status === "success" ? "✅" : r.status === "skipped" ? "⏭️" : "❌"} {r.nom}
                </span>
                <span style={{ color: "#888", fontSize: "11px" }}>{r.message || r.uid}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => router.push("/dashboard")}
          style={{ width: "100%", padding: "12px", background: "#f0f0f0", color: "#333", border: "none", borderRadius: "14px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: "18px" }}
        >
          ← Retour au dashboard
        </button>
      </div>
    </div>
  );
}
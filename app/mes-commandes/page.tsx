"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";

export default function MesCommandesPage() {
  const router = useRouter();
  const [commandes, setCommandes] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login-client"); return; }
      const q = query(
        collection(db, "commandes_clients"),
        where("uid", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      setCommandes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const statusColor: Record<string, string> = {
    en_attente: "#f79f1f",
    confirme:   "#1a9e6e",
    annule:     "#e63946",
  };
  const statusLabel: Record<string, string> = {
    en_attente: "⏳ En attente",
    confirme:   "✅ Confirmé",
    annule:     "❌ Annulé",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "40px" }}>
      
      {/* Header */}
      <header style={{ background: "#1a1a2e", padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: "#fff", fontSize: "20px", cursor: "pointer" }}>←</button>
        <p style={{ margin: 0, fontSize: "17px", fontWeight: 900, color: "#fff" }}>🛒 Mes Commandes</p>
      </header>

      <div style={{ padding: "16px" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "#888", marginTop: "40px" }}>Chajman...</p>
        ) : commandes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ fontSize: "48px", margin: "0 0 12px" }}>🛒</p>
            <p style={{ color: "#888", fontSize: "15px" }}>Ou pa gen okenn komand toujou.</p>
            <button onClick={() => router.push("/")} style={{ marginTop: "16px", padding: "12px 24px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "12px", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>
              Ale achte
            </button>
          </div>
        ) : (
          commandes.map((c) => (
            <div key={c.id} style={{ background: "#fff", borderRadius: "16px", padding: "16px", marginBottom: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <p style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#1a1a2e" }}>{c.productName}</p>
                <span style={{ background: statusColor[c.status] + "20", color: statusColor[c.status], padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>
                  {statusLabel[c.status] ?? c.status}
                </span>
              </div>
              <p style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 900, color: "#111" }}>${Number(c.price).toLocaleString()}</p>
              <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#888" }}>💳 {c.method}</p>
              <p style={{ margin: 0, fontSize: "11px", color: "#bbb" }}>{new Date(c.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
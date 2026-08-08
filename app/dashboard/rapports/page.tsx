"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, orderBy } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════
interface Commande {
  id: string;
  nomClient: string;
  produit: string;
  prix: number;
  methode: string;
  statut: "en_attente" | "confirme" | "annule";
  createdAt: any;
}

interface Vente {
  id: string;
  marque: string;
  modele: string;
  produitId: string;
  categorie: "ordinateur" | "mini" | "autre";
  prixStore: number;
  prixVente: number;
  benefis: number;
  komisyon: number;
  grandTotal: number;
  date: string;
  note?: string;
  annule?: boolean; // ← vant ki annile pa dwe konte nan stat yo
}

interface HistEntry {
  type: "vente" | "annulation" | "restauration" | "retrait" | "depot";
  date: string;
  montant: number;
  description: string;
  note?: string;
}

interface Vendeur {
  id: string;
  nom: string;
  couleur: string;
  balance: number;        // ← ranplase 'retraits' — se sa paj Vandè a anrejistre kounye a
  ventes: Vente[];
  historique: HistEntry[]; // ← ranplase 'retraits'
}

interface RapportData {
  commandes: Commande[];
  vendeurs: Vendeur[];
  lastUpdated: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return `$${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateFull(val: any) {
  try {
    const d = val?.toDate ? val.toDate() : new Date(val);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}
// Total retrè yon vandè, kalkile apati istorik la (olye ansyen chan 'retraits' ki pa egziste ankò)
function totalRetraitsOf(v: Vendeur): number {
  return (v.historique ?? []).filter((h) => h.type === "retrait").reduce((s, h) => s + Math.abs(h.montant), 0);
}
// Vant aktif yo sèlman (pa gen vant ki annile)
function ventesActives(v: Vendeur): Vente[] {
  return v.ventes.filter((x) => !x.annule);
}

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, bg, emoji }: {
  label: string; value: string; sub?: string;
  color: string; bg: string; emoji: string;
}) {
  return (
    <div style={{ background: bg, borderRadius: "16px", padding: "14px 12px", border: `1px solid ${color}22` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <span style={{ fontSize: "18px" }}>{emoji}</span>
        <p style={{ margin: 0, fontSize: "10px", fontWeight: 700, color: "#666", letterSpacing: "0.05em" }}>{label}</p>
      </div>
      <p style={{ margin: 0, fontSize: "20px", fontWeight: 900, color, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ margin: "4px 0 0", fontSize: "10px", color: "#555" }}>{sub}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PAGE RAPPORTS
// ══════════════════════════════════════════════════════════════════════════
export default function RapportsPage() {
  const router = useRouter();
  const [data, setData]         = useState<RapportData>({ commandes: [], vendeurs: [], lastUpdated: "" });
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "commandes" | "vendeurs" | "produits">("overview");
  const [filtre, setFiltre]     = useState<"tout" | "7j" | "30j" | "90j">("tout");

  // ── Load all data — tann otantifikasyon Firebase anvan nenpòt lekti ──
  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Pa gen moun konekte — Firestore ap refize aksè selon règ yo
        console.warn("Rapports: okenn itilizatè konekte, done demo yo ap itilize.");
        setData({ commandes: SAMPLE_COMMANDES, vendeurs: SAMPLE_VENDEURS, lastUpdated: new Date().toISOString() });
        setLoading(false);
        return;
      }

      // Load commandes
      let commandes: Commande[] = [];
      try {
        const snap = await getDocs(query(collection(db, "commandes"), orderBy("createdAt", "desc")));
        commandes = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Commande));
      } catch (err) {
        console.error("Rapports: erè chajman commandes —", err);
        commandes = SAMPLE_COMMANDES;
      }

      // Load vendeurs from vendeursite/sitevendeur
      let vendeurs: Vendeur[] = [];
      try {
        const vSnap = await getDoc(doc(db, "vendeursite", "sitevendeur"));
        if (vSnap.exists() && vSnap.data()?.vendeurs?.length > 0) {
          vendeurs = (vSnap.data().vendeurs as any[]).map((raw) => ({
            id: raw.id,
            nom: raw.nom ?? "",
            couleur: raw.couleur ?? "#2ecc71",
            balance: typeof raw.balance === "number" ? raw.balance : 0,
            ventes: raw.ventes ?? [],
            historique: raw.historique ?? [],
          }));
        } else {
          console.warn("Rapports: dokiman vendeursite/sitevendeur vid oswa pa egziste, done demo yo ap itilize.");
          vendeurs = SAMPLE_VENDEURS;
        }
      } catch (err) {
        console.error("Rapports: erè chajman vendeursite/sitevendeur —", err);
        vendeurs = SAMPLE_VENDEURS;
      }

      setData({ commandes, vendeurs, lastUpdated: new Date().toISOString() });
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Date filter ────────────────────────────────────────────────────
  const filterByDate = <T extends { createdAt?: any; date?: string }>(items: T[]): T[] => {
    if (filtre === "tout") return items;
    const days = filtre === "7j" ? 7 : filtre === "30j" ? 30 : 90;
    const cutoff = new Date(Date.now() - days * 86400000);
    return items.filter((item) => {
      try {
        const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.date ?? item.createdAt ?? 0);
        return d >= cutoff;
      } catch { return true; }
    });
  };

  const filteredCommandes = filterByDate(data.commandes);
  const allVentes = data.vendeurs.flatMap((v) =>
    filterByDate(ventesActives(v)).map((s) => ({ ...s, vendeurNom: v.nom, vendeurCouleur: v.couleur }))
  );

  // ── Computed stats ─────────────────────────────────────────────────
  const cmdConfirmees  = filteredCommandes.filter((c) => c.statut === "confirme");
  const cmdEnAttente   = filteredCommandes.filter((c) => c.statut === "en_attente");
  const cmdAnnulees    = filteredCommandes.filter((c) => c.statut === "annule");

  const totalRevenuCommandes = cmdConfirmees.reduce((s, c) => s + c.prix, 0);
  const totalRevenuVentes    = allVentes.reduce((s, v) => s + v.prixVente, 0);
  const totalCommissions     = allVentes.reduce((s, v) => s + v.grandTotal, 0);
  const totalRetraits        = data.vendeurs.reduce((s, v) => s + totalRetraitsOf(v), 0);
  const balanceVendeurs      = data.vendeurs.reduce((s, v) => s + (v.balance ?? 0), 0);

  // ── Top produits ───────────────────────────────────────────────────
  const prodMap: Record<string, { nom: string; count: number; total: number }> = {};
  allVentes.forEach((v) => {
    const key = `${v.marque} ${v.modele}`;
    if (!prodMap[key]) prodMap[key] = { nom: key, count: 0, total: 0 };
    prodMap[key].count++;
    prodMap[key].total += v.prixVente;
  });
  const topProduits = Object.values(prodMap).sort((a, b) => b.count - a.count).slice(0, 8);

  // ── Méthodes paiement ──────────────────────────────────────────────
  const methodeMap: Record<string, number> = {};
  filteredCommandes.forEach((c) => {
    methodeMap[c.methode] = (methodeMap[c.methode] ?? 0) + 1;
  });
  const methodeColors: Record<string, string> = { MonCash: "#e63946", NatCash: "#1a3a8f", "Virement Bancaire": "#2d6a4f" };

  const TABS = [
    { key: "overview",  emoji: "📊", label: "Overview"  },
    { key: "commandes", emoji: "🧾", label: "Commandes" },
    { key: "vendeurs",  emoji: "🪪", label: "Vendeurs"  },
    { key: "produits",  emoji: "📦", label: "Produits"  },
  ] as const;

  const FILTRES = [
    { key: "tout", label: "Tout" },
    { key: "7j",   label: "7 jours" },
    { key: "30j",  label: "30 jours" },
    { key: "90j",  label: "90 jours" },
  ] as const;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#444", fontSize: "14px" }}>Chargement des données...</p>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "80px" }}>

      {/* Header */}
      <header style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1f2e", position: "sticky", top: 0, zIndex: 100, background: "#0d1117" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "#fff", fontSize: "22px", cursor: "pointer", padding: 0 }}>←</button>
          <div>
            <p style={{ margin: 0, fontSize: "18px", fontWeight: 900 }}>📊 Rapports</p>
            <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#555" }}>
              Mis à jour: {data.lastUpdated ? formatDate(data.lastUpdated) : "maintenant"}
            </p>
          </div>
        </div>
        {/* Refresh */}
        <button onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 600); }} style={{ background: "#1a1f2e", border: "none", borderRadius: "8px", padding: "8px 12px", color: "#aaa", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
          🔄 Refresh
        </button>
      </header>

      {/* Date filter */}
      <div style={{ display: "flex", gap: "6px", padding: "10px 14px", borderBottom: "1px solid #1a1f2e", overflowX: "auto", scrollbarWidth: "none" }}>
        {FILTRES.map(({ key, label }) => (
          <button key={key} onClick={() => setFiltre(key)} style={{
            flexShrink: 0, padding: "6px 14px", borderRadius: "999px",
            border: `1.5px solid ${filtre === key ? "#2ecc71" : "#1a1f2e"}`,
            background: filtre === key ? "#0a2a1a" : "#1a1f2e",
            color: filtre === key ? "#2ecc71" : "#555",
            fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{label}</button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1f2e", overflowX: "auto", scrollbarWidth: "none" }}>
        {TABS.map(({ key, emoji, label }) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            flex: 1, padding: "12px 8px", border: "none", background: "none",
            color: activeTab === key ? "#2ecc71" : "#444",
            fontSize: "11px", fontWeight: 800, letterSpacing: "0.04em",
            borderBottom: activeTab === key ? "2.5px solid #2ecc71" : "2.5px solid transparent",
            cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
          }}>{emoji} {label}</button>
        ))}
      </div>

      <div style={{ padding: "14px" }}>

        {/* ══ OVERVIEW ══════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <>
            {/* Big revenue card */}
            <div style={{ background: "linear-gradient(135deg, #0a2a1a, #0a3a2a)", borderRadius: "20px", padding: "20px", marginBottom: "14px", border: "1px solid #2ecc7133" }}>
              <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 700, color: "#2ecc71", letterSpacing: "0.08em" }}>REVENU TOTAL CONFIRMÉ</p>
              <p style={{ margin: "0 0 8px", fontSize: "38px", fontWeight: 900, color: "#2ecc71", lineHeight: 1 }}>{fmt(totalRevenuCommandes)}</p>
              <div style={{ display: "flex", gap: "16px" }}>
                <span style={{ fontSize: "11px", color: "#555" }}>📦 Ventes: {fmt(totalRevenuVentes)}</span>
                <span style={{ fontSize: "11px", color: "#555" }}>✅ {cmdConfirmees.length} confirmées</span>
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
              <StatCard label="COMMANDES TOTAL" value={filteredCommandes.length.toString()} sub={`${cmdEnAttente.length} en attente`} color="#3498db" bg="#0a1a2a" emoji="🧾" />
              <StatCard label="ANNULÉES" value={cmdAnnulees.length.toString()} sub={`${((cmdAnnulees.length / Math.max(filteredCommandes.length, 1)) * 100).toFixed(0)}% du total`} color="#e74c3c" bg="#2a0a0a" emoji="❌" />
              <StatCard label="TOTAL VENTES" value={allVentes.length.toString()} sub={`${data.vendeurs.length} vendeurs`} color="#f39c12" bg="#2a1a0a" emoji="📦" />
              <StatCard label="COMMISSIONS DUES" value={fmt(balanceVendeurs)} sub={`${fmt(totalCommissions)} gagné`} color="#9b59b6" bg="#1a0a2a" emoji="💰" />
            </div>

            {/* Méthodes de paiement */}
            <div style={{ background: "#1a1f2e", borderRadius: "16px", padding: "14px", marginBottom: "14px" }}>
              <p style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: 800, color: "#fff" }}>💳 Méthodes de paiement</p>
              {Object.entries(methodeMap).length === 0 ? (
                <p style={{ margin: 0, fontSize: "12px", color: "#444" }}>Aucune donnée</p>
              ) : (
                Object.entries(methodeMap).map(([methode, count]) => {
                  const pct = (count / filteredCommandes.length) * 100;
                  const color = methodeColors[methode] ?? "#888";
                  return (
                    <div key={methode} style={{ marginBottom: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "12px", color: "#aaa" }}>{methode}</span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div style={{ height: "6px", background: "#0d1117", borderRadius: "999px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "999px", transition: "width 0.5s" }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Vendeurs overview */}
            <div style={{ background: "#1a1f2e", borderRadius: "16px", padding: "14px" }}>
              <p style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: 800, color: "#fff" }}>🪪 Résumé Vendeurs</p>
              {data.vendeurs.map((v) => {
                const comm = ventesActives(v).reduce((s, x) => s + x.grandTotal, 0);
                const bal  = v.balance ?? 0;
                return (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid #0d1117" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: v.couleur, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 900, color: "#000", flexShrink: 0 }}>
                      {v.nom[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#fff" }}>{v.nom}</p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#555" }}>{ventesActives(v).length} ventes • {fmt(comm)} gagné</p>
                    </div>
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: 900, color: bal >= 0 ? "#2ecc71" : "#e74c3c" }}>{fmt(bal)}</p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ══ COMMANDES ═════════════════════════════════════════════════ */}
        {activeTab === "commandes" && (
          <>
            {/* Status summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
              {[
                { label: "En attente", count: cmdEnAttente.length, color: "#f79f1f", bg: "#2a1a0a" },
                { label: "Confirmées", count: cmdConfirmees.length, color: "#2ecc71", bg: "#0a2a1a" },
                { label: "Annulées",   count: cmdAnnulees.length,   color: "#e74c3c", bg: "#2a0a0a" },
              ].map(({ label, count, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: "12px", padding: "10px 8px", textAlign: "center", border: `1px solid ${color}22` }}>
                  <p style={{ margin: 0, fontSize: "22px", fontWeight: 900, color }}>{count}</p>
                  <p style={{ margin: "3px 0 0", fontSize: "9px", color, fontWeight: 700 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Revenue confirmé */}
            <div style={{ background: "#0a2a1a", borderRadius: "14px", padding: "14px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #2ecc7133" }}>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: "11px", color: "#555" }}>Revenu confirmé</p>
                <p style={{ margin: 0, fontSize: "24px", fontWeight: 900, color: "#2ecc71" }}>{fmt(totalRevenuCommandes)}</p>
              </div>
              <span style={{ fontSize: "32px" }}>💵</span>
            </div>

            {/* Liste commandes */}
            {filteredCommandes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <p style={{ fontSize: "36px", margin: "0 0 8px" }}>📭</p>
                <p style={{ color: "#444", fontSize: "13px" }}>Aucune commande.</p>
              </div>
            ) : (
              filteredCommandes.map((cmd) => {
                const statusColor = cmd.statut === "confirme" ? "#2ecc71" : cmd.statut === "en_attente" ? "#f79f1f" : "#e74c3c";
                const statusEmoji = cmd.statut === "confirme" ? "✅" : cmd.statut === "en_attente" ? "⏳" : "❌";
                const methColor = methodeColors[cmd.methode] ?? "#888";
                return (
                  <div key={cmd.id} style={{ background: "#1a1f2e", borderRadius: "14px", padding: "12px 14px", marginBottom: "8px", borderLeft: `3px solid ${statusColor}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                      <div>
                        <p style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#fff" }}>{cmd.nomClient}</p>
                        <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#555" }}>{cmd.produit}</p>
                      </div>
                      <p style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#fff" }}>{fmt(cmd.prix)}</p>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ background: `${statusColor}22`, color: statusColor, padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700 }}>{statusEmoji} {cmd.statut.replace("_", " ")}</span>
                      <span style={{ background: `${methColor}22`, color: methColor, padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700 }}>{cmd.methode}</span>
                      <span style={{ fontSize: "10px", color: "#555" }}>{formatDateFull(cmd.createdAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ══ VENDEURS ══════════════════════════════════════════════════ */}
        {activeTab === "vendeurs" && (
          <>
            {/* Global */}
            <div style={{ background: "#1a1f2e", borderRadius: "16px", padding: "14px", marginBottom: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { label: "Total ventes", val: fmt(totalRevenuVentes), color: "#f39c12" },
                  { label: "Total commissions", val: fmt(totalCommissions), color: "#9b59b6" },
                  { label: "Total retraits", val: fmt(totalRetraits), color: "#e74c3c" },
                  { label: "Balance à payer", val: fmt(balanceVendeurs), color: "#2ecc71" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <p style={{ margin: "0 0 4px", fontSize: "10px", color: "#555" }}>{label}</p>
                    <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color }}>{val}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Vendeur cards */}
            {data.vendeurs.map((v) => {
              const ventes   = filterByDate(ventesActives(v));
              const comm     = ventes.reduce((s, x) => s + x.grandTotal, 0);
              const ventesT  = ventes.reduce((s, x) => s + x.prixVente, 0);
              const retrT    = totalRetraitsOf(v);
              const bal      = v.balance ?? 0;

              return (
                <div key={v.id} style={{ background: "#1a1f2e", borderRadius: "16px", padding: "14px", marginBottom: "10px", borderLeft: `4px solid ${v.couleur}` }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: v.couleur, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: 900, color: "#000", flexShrink: 0 }}>
                      {v.nom[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#fff" }}>{v.nom}</p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#555" }}>{ventes.length} ventes</p>
                    </div>
                    <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: bal >= 0 ? "#2ecc71" : "#e74c3c" }}>{fmt(bal)}</p>
                  </div>

                  {/* Stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginBottom: "10px" }}>
                    {[
                      { label: "Ventes", val: fmt(ventesT), color: "#f39c12" },
                      { label: "Commissions", val: fmt(comm), color: "#9b59b6" },
                      { label: "Retraits", val: fmt(retrT), color: "#e74c3c" },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ background: "#0d1117", borderRadius: "10px", padding: "8px", textAlign: "center" }}>
                        <p style={{ margin: "0 0 3px", fontSize: "9px", color: "#555" }}>{label}</p>
                        <p style={{ margin: 0, fontSize: "12px", fontWeight: 800, color }}>{val}</p>
                      </div>
                    ))}
                  </div>

                  {/* Last 3 ventes */}
                  {ventes.length > 0 && (
                    <div>
                      <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "#555", letterSpacing: "0.05em" }}>DERNIÈRES VENTES</p>
                      {[...ventes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3).map((vente) => (
                        <div key={vente.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #0d1117" }}>
                          <div>
                            <p style={{ margin: 0, fontSize: "11px", color: "#aaa" }}>{vente.marque} {vente.modele}</p>
                            <p style={{ margin: 0, fontSize: "9px", color: "#555" }}>🔖 {vente.produitId} • {formatDate(vente.date)}</p>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#fff" }}>{fmt(vente.prixVente)}</p>
                            <p style={{ margin: 0, fontSize: "10px", color: "#2ecc71" }}>+{fmt(vente.grandTotal)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ══ PRODUITS ══════════════════════════════════════════════════ */}
        {activeTab === "produits" && (
          <>
            <div style={{ background: "#0a2a1a", borderRadius: "14px", padding: "14px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #2ecc7133" }}>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: "11px", color: "#555" }}>Total produits vendus</p>
                <p style={{ margin: 0, fontSize: "24px", fontWeight: 900, color: "#2ecc71" }}>{allVentes.length}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: "0 0 4px", fontSize: "11px", color: "#555" }}>Revenu total</p>
                <p style={{ margin: 0, fontSize: "18px", fontWeight: 900, color: "#f39c12" }}>{fmt(totalRevenuVentes)}</p>
              </div>
            </div>

            {topProduits.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <p style={{ fontSize: "36px", margin: "0 0 8px" }}>📦</p>
                <p style={{ color: "#444", fontSize: "13px" }}>Aucune vente enregistrée.</p>
              </div>
            ) : (
              <>
                <p style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: 800, color: "#fff" }}>🏆 Top Produits Vendus</p>
                {topProduits.map((p, idx) => {
                  const maxCount = topProduits[0].count;
                  const pct = (p.count / maxCount) * 100;
                  const colors = ["#f39c12", "#aaa", "#cd7f32", "#2ecc71", "#3498db", "#9b59b6", "#e74c3c", "#1abc9c"];
                  const color = colors[idx] ?? "#888";
                  return (
                    <div key={p.nom} style={{ background: "#1a1f2e", borderRadius: "14px", padding: "12px 14px", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                        <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 900, color, flexShrink: 0 }}>
                          {idx + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#fff" }}>{p.nom}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ margin: 0, fontSize: "13px", fontWeight: 900, color }}>{p.count}x</p>
                          <p style={{ margin: 0, fontSize: "10px", color: "#555" }}>{fmt(p.total)}</p>
                        </div>
                      </div>
                      <div style={{ height: "5px", background: "#0d1117", borderRadius: "999px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "999px", transition: "width 0.5s" }} />
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* All ventes list */}
            {allVentes.length > 0 && (
              <>
                <p style={{ margin: "16px 0 10px", fontSize: "13px", fontWeight: 800, color: "#fff" }}>📋 Toutes les ventes</p>
                {[...allVentes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((v) => (
                  <div key={v.id} style={{ background: "#1a1f2e", borderRadius: "12px", padding: "10px 12px", marginBottom: "6px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: (v as any).vendeurCouleur ?? "#888", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.marque} {v.modele}</p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#555" }}>🔖 {v.produitId} • {(v as any).vendeurNom} • {formatDate(v.date)}</p>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#fff" }}>{fmt(v.prixVente)}</p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#2ecc71" }}>+{fmt(v.grandTotal)}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#1a1f2e", borderTop: "1px solid #0d1117", display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 0 10px", zIndex: 100 }}>
        {[
          { icon: "🏠", label: "Boutique",  action: () => router.push("/"),          color: "#444"    },
          { icon: "⚡", label: "Dashboard", action: () => router.push("/dashboard"), color: "#e63946" },
          { icon: "📊", label: "Rapports",  action: () => {},                        color: "#2ecc71" },
        ].map(({ icon, label, action, color }) => (
          <button key={label} onClick={action} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", fontFamily: "inherit" }}>
            <span style={{ fontSize: "20px" }}>{icon}</span>
            <span style={{ fontSize: "10px", color, fontWeight: 600 }}>{label}</span>
          </button>
        ))}
      </div>

      <style>{`* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; } ::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}

// ── Sample data ────────────────────────────────────────────────────────────
const SAMPLE_COMMANDES: Commande[] = [
  { id: "c1", nomClient: "Jean Pierre", produit: "Dell Latitude E7470", prix: 440, methode: "MonCash", statut: "confirme", createdAt: new Date(Date.now() - 86400000) },
  { id: "c2", nomClient: "Marie Lucie", produit: "HP EliteBook 840", prix: 380, methode: "NatCash", statut: "en_attente", createdAt: new Date(Date.now() - 172800000) },
  { id: "c3", nomClient: "Paul Dupont", produit: "Lenovo ThinkPad X1", prix: 520, methode: "Virement Bancaire", statut: "annule", createdAt: new Date(Date.now() - 259200000) },
  { id: "c4", nomClient: "Sophie Marc", produit: "Apple MacBook Air", prix: 950, methode: "MonCash", statut: "confirme", createdAt: new Date(Date.now() - 345600000) },
];

const SAMPLE_VENDEURS: Vendeur[] = [
  {
    id: "v1", nom: "Cesar", couleur: "#2ecc71",
    balance: 110,
    ventes: [
      { id: "s1", marque: "Dell", modele: "Latitude E7470", produitId: "p001", categorie: "ordinateur", prixStore: 380, prixVente: 440, benefis: 60, komisyon: 20, grandTotal: 80, date: new Date(Date.now() - 86400000).toISOString() },
      { id: "s2", marque: "HP", modele: "EliteBook 840", produitId: "p002", categorie: "ordinateur", prixStore: 340, prixVente: 380, benefis: 40, komisyon: 20, grandTotal: 60, date: new Date(Date.now() - 172800000).toISOString() },
    ],
    historique: [
      { type: "vente", date: new Date(Date.now() - 172800000).toISOString(), montant: 60, description: "Vente ajoutée" },
      { type: "vente", date: new Date(Date.now() - 86400000).toISOString(), montant: 80, description: "Vente ajoutée" },
      { type: "retrait", date: new Date().toISOString(), montant: -30, description: "Retrait effectué" },
    ],
  },
  {
    id: "v2", nom: "Mrs", couleur: "#3498db",
    balance: 70,
    ventes: [
      { id: "s3", marque: "Lenovo", modele: "ThinkPad X1", produitId: "p003", categorie: "ordinateur", prixStore: 470, prixVente: 520, benefis: 50, komisyon: 20, grandTotal: 70, date: new Date(Date.now() - 259200000).toISOString() },
    ],
    historique: [
      { type: "vente", date: new Date(Date.now() - 259200000).toISOString(), montant: 70, description: "Vente ajoutée" },
    ],
  },
];
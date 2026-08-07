"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy, where, Timestamp
} from "firebase/firestore";

// ── Types ──────────────────────────────────────────────────────────────────
type Statut = "en_attente" | "confirme" | "annule";
type MethodePaiement = "MonCash" | "NatCash" | "Virement Bancaire";

interface Commande {
  id: string;
  nomClient: string;
  telephone: string;
  email?: string;
  produit: string;
  produitId?: string;
  prix: number;
  methode: MethodePaiement;
  statut: Statut;
  createdAt: Timestamp | Date | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUT_CONFIG: Record<Statut, { label: string; bg: string; color: string; emoji: string }> = {
  en_attente: { label: "En attente", bg: "#fff8e1", color: "#f79f1f", emoji: "⏳" },
  confirme:   { label: "Confirmé",   bg: "#e8fdf0", color: "#1a9e6e", emoji: "✅" },
  annule:     { label: "Annulé",     bg: "#fff0f0", color: "#e63946", emoji: "❌" },
};

const METHODE_CONFIG: Record<string, { bg: string; color: string; initial: string }> = {
  "MonCash":          { bg: "#e63946", color: "#fff", initial: "M" },
  "NatCash":          { bg: "#1a3a8f", color: "#fff", initial: "N" },
  "Virement Bancaire":{ bg: "#2d6a4f", color: "#fff", initial: "🏦" },
};

function formatDate(ts: Timestamp | Date | null): string {
  if (!ts) return "—";
  const d = ts instanceof Date ? ts : ts.toDate();
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Sample data (si Firestore vid) ─────────────────────────────────────────
const SAMPLES: Commande[] = [
  {
    id: "cmd001", nomClient: "Jean Pierre", telephone: "+509 38001234",
    email: "jean@gmail.com", produit: "Dell Latitude E7470", produitId: "p1",
    prix: 440, methode: "MonCash", statut: "en_attente", createdAt: new Date(),
  },
  {
    id: "cmd002", nomClient: "Marie Lucie", telephone: "+509 37005678",
    email: "marie@gmail.com", produit: "HP EliteBook 840", produitId: "p2",
    prix: 380, methode: "NatCash", statut: "confirme", createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: "cmd003", nomClient: "Paul Dupont", telephone: "+509 36009012",
    produit: "Lenovo ThinkPad X1", produitId: "p3",
    prix: 520, methode: "Virement Bancaire", statut: "annule", createdAt: new Date(Date.now() - 172800000),
  },
];

// ── Confirm Dialog ─────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel, confirmColor = "#e63946" }: {
  message: string; onConfirm: () => void; onCancel: () => void; confirmColor?: string;
}) {
  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, zIndex: 9500,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "20px",
        padding: "24px 20px", width: "100%", maxWidth: "320px", textAlign: "center",
      }}>
        <p style={{ margin: "0 0 20px", fontSize: "15px", color: "#333", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "12px", borderRadius: "12px",
            background: "#f0f0f0", border: "none",
            fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>Annuler</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: "12px", borderRadius: "12px",
            background: confirmColor, color: "#fff", border: "none",
            fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}

// ── Commande Card ──────────────────────────────────────────────────────────
function CommandeCard({ cmd, onUpdateStatut, onDelete }: {
  cmd: Commande;
  onUpdateStatut: (id: string, statut: Statut) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statut = STATUT_CONFIG[cmd.statut];
  const methode = METHODE_CONFIG[cmd.methode] ?? { bg: "#888", color: "#fff", initial: "?" };

  return (
    <div style={{
      background: "#fff", borderRadius: "16px",
      marginBottom: "10px",
      boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
      overflow: "hidden",
      borderLeft: `4px solid ${statut.color}`,
    }}>
      {/* Top row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "12px 14px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "12px",
        }}
      >
        {/* Méthode icon */}
        <div style={{
          width: "44px", height: "44px", borderRadius: "50%",
          background: methode.bg, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: typeof methode.initial === "string" && methode.initial.length > 1 ? "20px" : "18px",
          fontWeight: 900, color: methode.color,
        }}>
          {methode.initial}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <p style={{
              margin: 0, fontSize: "14px", fontWeight: 800, color: "#111",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{cmd.nomClient}</p>
            <p style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#111", flexShrink: 0 }}>
              ${cmd.prix.toLocaleString()}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
            <span style={{
              background: statut.bg, color: statut.color,
              padding: "2px 8px", borderRadius: "999px",
              fontSize: "10px", fontWeight: 700,
            }}>{statut.emoji} {statut.label}</span>
            <span style={{ fontSize: "10px", color: "#aaa" }}>{cmd.methode}</span>
          </div>
        </div>

        <span style={{ fontSize: "14px", color: "#ccc", flexShrink: 0 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f5f5f5" }}>
          {/* Product */}
          <div style={{ background: "#f8f9fa", borderRadius: "12px", padding: "10px 12px", margin: "10px 0" }}>
            <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 700, color: "#aaa", letterSpacing: "0.06em" }}>PRODUIT</p>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>{cmd.produit}</p>
            <p style={{ margin: "2px 0 0", fontSize: "13px", fontWeight: 900, color: "#e63946" }}>${cmd.prix.toLocaleString()}</p>
          </div>

          {/* Client info */}
          <div style={{ background: "#f8f9fa", borderRadius: "12px", padding: "10px 12px", marginBottom: "10px" }}>
            <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "#aaa", letterSpacing: "0.06em" }}>CLIENT</p>
            <p style={{ margin: "0 0 2px", fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>👤 {cmd.nomClient}</p>
            <p style={{ margin: "0 0 2px", fontSize: "13px", color: "#555" }}>📞 {cmd.telephone}</p>
            {cmd.email && <p style={{ margin: 0, fontSize: "12px", color: "#888" }}>✉️ {cmd.email}</p>}
            <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#aaa" }}>🕐 {formatDate(cmd.createdAt)}</p>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Statut buttons */}
            {cmd.statut !== "confirme" && (
              <button
                onClick={() => onUpdateStatut(cmd.id, "confirme")}
                style={{
                  width: "100%", padding: "11px",
                  background: "#1a9e6e", color: "#fff",
                  border: "none", borderRadius: "10px",
                  fontSize: "13px", fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >✅ Confirmer le paiement</button>
            )}
            {cmd.statut !== "annule" && (
              <button
                onClick={() => onUpdateStatut(cmd.id, "annule")}
                style={{
                  width: "100%", padding: "11px",
                  background: "#fff0f0", color: "#e63946",
                  border: "1.5px solid #fdd", borderRadius: "10px",
                  fontSize: "13px", fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >❌ Annuler la commande</button>
            )}
            {cmd.statut === "en_attente" && (
              <button
                onClick={() => onUpdateStatut(cmd.id, "en_attente")}
                style={{
                  width: "100%", padding: "11px",
                  background: "#fff8e1", color: "#f79f1f",
                  border: "1.5px solid #ffe082", borderRadius: "10px",
                  fontSize: "13px", fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "none", // hidden — déjà en attente
                }}
              >⏳ Mettre en attente</button>
            )}

            {/* WhatsApp */}
            <a
              href={`https://wa.me/${cmd.telephone.replace(/\D/g, "")}?text=Bonjour%20${encodeURIComponent(cmd.nomClient)}%2C%20votre%20commande%20${encodeURIComponent(cmd.produit)}%20chez%20MillionStore.`}
              target="_blank" rel="noopener noreferrer"
              style={{
                width: "100%", padding: "11px",
                background: "#25D366", color: "#fff",
                border: "none", borderRadius: "10px",
                fontSize: "13px", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center",
                justifyContent: "center", gap: "8px",
                textDecoration: "none",
              }}
            >💬 Contacter sur WhatsApp</a>

            {/* Delete */}
            <button
              onClick={() => onDelete(cmd.id)}
              style={{
                width: "100%", padding: "11px",
                background: "transparent", color: "#ccc",
                border: "1.5px solid #eee", borderRadius: "10px",
                fontSize: "13px", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >🗑️ Supprimer la commande</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PAGE COMMANDES
// ══════════════════════════════════════════════════════════════════════════
export default function CommandesPage() {
  const router = useRouter();
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filtreStatut, setFiltreStatut] = useState<Statut | "tout">("tout");
  const [confirm, setConfirm]     = useState<{ id: string; statut: Statut; message: string } | null>(null);
  const [deleteId, setDeleteId]   = useState<string | null>(null);

  // ── Fetch from Firestore ───────────────────────────────────────────────
  useEffect(() => {
    const fetch = async () => {
      try {
        const q = query(collection(db, "commandes"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Commande));
          setCommandes(data);
        }
        // Si vid, garde SAMPLES
      } catch {
        // Si ereu, garde SAMPLES
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  // ── Update statut ──────────────────────────────────────────────────────
  const updateStatut = async (id: string, statut: Statut) => {
  try {
    // 1 — Mete ajou admin
    await updateDoc(doc(db, "commandes", id), { statut });

    // 2 — Mete ajou client tou
    const q = query(
      collection(db, "commandes_clients"),
      where("commandeId", "==", id)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(async (d) => {
      await updateDoc(doc(db, "commandes_clients", d.id), { status: statut });
    });

  } catch {/* local only */}
  setCommandes((prev) => prev.map((c) => c.id === id ? { ...c, statut } : c));
  setConfirm(null);
};

  const requestStatut = (id: string, statut: Statut) => {
    const messages: Record<Statut, string> = {
      confirme:   "✅ Confirmer ce paiement?",
      annule:     "❌ Annuler cette commande?",
      en_attente: "⏳ Remettre en attente?",
    };
    setConfirm({ id, statut, message: messages[statut] });
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const deleteCommande = async (id: string) => {
    try {
      await deleteDoc(doc(db, "commandes", id));
    } catch {/* local only */}
    setCommandes((prev) => prev.filter((c) => c.id !== id));
    setDeleteId(null);
  };

  // ── Filter ─────────────────────────────────────────────────────────────
  const filtered = filtreStatut === "tout"
    ? commandes
    : commandes.filter((c) => c.statut === filtreStatut);

  // ── Counts ────────────────────────────────────────────────────────────
  const counts = {
    tout:       commandes.length,
    en_attente: commandes.filter((c) => c.statut === "en_attente").length,
    confirme:   commandes.filter((c) => c.statut === "confirme").length,
    annule:     commandes.filter((c) => c.statut === "annule").length,
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#f5f6fa",
      fontFamily: "'Segoe UI', sans-serif",
      paddingBottom: "70px",
    }}>
      {/* Dialogs */}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          confirmColor={confirm.statut === "confirme" ? "#1a9e6e" : "#e63946"}
          onConfirm={() => updateStatut(confirm.id, confirm.statut)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {deleteId && (
        <ConfirmDialog
          message="🗑️ Supprimer cette commande définitivement?"
          confirmColor="#e63946"
          onConfirm={() => deleteCommande(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {/* Header */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #eee",
        padding: "10px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.back()} style={{
            background: "#f0f0f0", border: "none", borderRadius: "8px",
            width: "34px", height: "34px", cursor: "pointer", fontSize: "16px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>←</button>
          <div>
            <p style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#1a1a2e", lineHeight: 1 }}>
              🧾 Commandes
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#888" }}>
              {counts.tout} commande{counts.tout > 1 ? "s" : ""} • {counts.en_attente} en attente
            </p>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        gap: "8px", padding: "12px 12px 0",
      }}>
        {([
          { key: "en_attente", label: "En attente", color: "#f79f1f", bg: "#fff8e1" },
          { key: "confirme",   label: "Confirmés",  color: "#1a9e6e", bg: "#e8fdf0" },
          { key: "annule",     label: "Annulés",    color: "#e63946", bg: "#fff0f0" },
        ] as const).map(({ key, label, color, bg }) => (
          <div key={key} style={{
            background: bg, borderRadius: "12px", padding: "10px",
            textAlign: "center", border: `1.5px solid ${color}22`,
          }}>
            <p style={{ margin: 0, fontSize: "22px", fontWeight: 900, color }}>{counts[key]}</p>
            <p style={{ margin: 0, fontSize: "10px", color, fontWeight: 600 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{
        display: "flex", gap: "8px", padding: "12px 12px 8px",
        overflowX: "auto", scrollbarWidth: "none",
      }}>
        {([
          { key: "tout",       label: "Tout",        emoji: "📋" },
          { key: "en_attente", label: "En attente",  emoji: "⏳" },
          { key: "confirme",   label: "Confirmés",   emoji: "✅" },
          { key: "annule",     label: "Annulés",     emoji: "❌" },
        ] as const).map(({ key, label, emoji }) => (
          <button key={key} onClick={() => setFiltreStatut(key)} style={{
            flexShrink: 0, padding: "7px 14px", borderRadius: "999px",
            border: `1.5px solid ${filtreStatut === key ? "#1a1a2e" : "#e0e0e0"}`,
            background: filtreStatut === key ? "#1a1a2e" : "#fff",
            color: filtreStatut === key ? "#fff" : "#555",
            fontSize: "12px", fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            {emoji} {label} ({counts[key]})
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ padding: "4px 12px" }}>
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} style={{
              background: "#fff", borderRadius: "16px", height: "80px",
              marginBottom: "10px", animation: "pulse 1.5s infinite",
            }} />
          ))
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ fontSize: "40px", margin: "0 0 10px" }}>📭</p>
            <p style={{ color: "#888", fontSize: "14px" }}>Aucune commande trouvée.</p>
          </div>
        ) : (
          filtered.map((cmd) => (
            <CommandeCard
              key={cmd.id}
              cmd={cmd}
              onUpdateStatut={requestStatut}
              onDelete={(id) => setDeleteId(id)}
            />
          ))
        )}
      </div>

      {/* Bottom bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "#fff", borderTop: "1px solid #eee",
        display: "flex", justifyContent: "space-around", alignItems: "center",
        padding: "8px 0 10px",
        boxShadow: "0 -2px 10px rgba(0,0,0,0.06)", zIndex: 100,
      }}>
        {[
          { icon: "🏠", label: "Boutique",   href: "/",           color: "#333"    },
          { icon: "⚡", label: "Dashboard",  href: "/dashboard",  color: "#e63946" },
          { icon: "🧾", label: "Commandes",  href: "#",           color: "#1a1a2e" },
        ].map(({ icon, label, href, color }) => (
          <button key={label} onClick={() => router.push(href)} style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
            fontFamily: "inherit",
          }}>
            <span style={{ fontSize: "20px" }}>{icon}</span>
            <span style={{ fontSize: "10px", color, fontWeight: 600 }}>{label}</span>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════
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
}

interface Retrait {
  id: string;
  montant: number;
  date: string;
  note?: string;
}

interface Vendeur {
  id: string;
  nom: string;
  couleur: string;
  ventes: Vente[];
  retraits: Retrait[];
  actif: boolean;
}

// ══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════
const COLORS = [
  "#2ecc71", "#3498db", "#e67e22", "#9b59b6",
  "#e74c3c", "#1abc9c", "#f39c12", "#e91e63",
];

const CATEGORIES = {
  ordinateur: { label: "Ordinateur",  komisyon: 20 },
  mini:       { label: "Mini Laptop", komisyon: 10 },
  autre:      { label: "Lòt Atik",    komisyon:  5 },
} as const;

type CategorieKey = keyof typeof CATEGORIES;

const FS_COL = "vendeursite";
const FS_DOC = "sitevendeur";

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════
function calcVente(prixStore: number, prixVente: number, categorie: CategorieKey) {
  const benefis  = Math.max(0, prixVente - prixStore);
  const komisyon = CATEGORIES[categorie].komisyon;
  return { benefis, komisyon, grandTotal: benefis + komisyon };
}

function totalGrandTotal(v: Vendeur) { return v.ventes.reduce((s, x) => s + x.grandTotal, 0); }
function totalRetraits(v: Vendeur)   { return v.retraits.reduce((s, x) => s + x.montant, 0); }
function balance(v: Vendeur)         { return totalGrandTotal(v) - totalRetraits(v); }
function totalBenefis(v: Vendeur)    { return v.ventes.reduce((s, x) => s + x.benefis, 0); }
function totalKomisyon(v: Vendeur)   { return v.ventes.reduce((s, x) => s + x.komisyon, 0); }

function formatDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
    " à " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  );
}
function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ══════════════════════════════════════════════════════════════════════════
// SHARED STYLES
// ══════════════════════════════════════════════════════════════════════════
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px",
  background: "#0d1117", border: "1.5px solid #2a2f3e",
  borderRadius: "12px", fontSize: "13px", outline: "none",
  fontFamily: "inherit", color: "#fff", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", margin: "0 0 5px",
  fontSize: "10px", fontWeight: 700, color: "#666", letterSpacing: "0.06em",
};

// ══════════════════════════════════════════════════════════════════════════
// MODAL — AJOUTE VENTE
// ══════════════════════════════════════════════════════════════════════════
function AddVenteModal({ onClose, onSave }: { onClose: () => void; onSave: (v: Vente) => void }) {
  const [marque,    setMarque]    = useState("");
  const [modele,    setModele]    = useState("");
  const [produitId, setProduitId] = useState("");
  const [categorie, setCategorie] = useState<CategorieKey>("ordinateur");
  const [prixStore, setPrixStore] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [note,      setNote]      = useState("");

  const storeN  = parseFloat(prixStore) || 0;
  const venteN  = parseFloat(prixVente) || 0;
  const preview = storeN > 0 && venteN > 0 ? calcVente(storeN, venteN, categorie) : null;

  const submit = () => {
    if (!marque.trim() || !modele.trim() || !produitId.trim() || storeN <= 0 || venteN <= 0) return;
    const { benefis, komisyon, grandTotal } = calcVente(storeN, venteN, categorie);
    onSave({
      id: `s_${Date.now()}`,
      marque: marque.trim(), modele: modele.trim(), produitId: produitId.trim(),
      categorie, prixStore: storeN, prixVente: venteN,
      benefis, komisyon, grandTotal,
      date: new Date().toISOString(),
      note: note.trim(),
    });
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1f2e", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", maxHeight: "93vh", overflowY: "auto", paddingBottom: "32px" }}>
        <div style={{ width: "40px", height: "4px", background: "#333", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#fff" }}>➕ Ajoute Vant</p>
            <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#2a2f3e", border: "none", color: "#aaa", fontSize: "16px", cursor: "pointer" }}>×</button>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>MARKA</label>
            <input value={marque} onChange={(e) => setMarque(e.target.value)} placeholder="Dell, HP, Lenovo..." style={inputStyle} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>MODÈL</label>
            <input value={modele} onChange={(e) => setModele(e.target.value)} placeholder="Latitude E7470..." style={inputStyle} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>ID PWODUI</label>
            <input value={produitId} onChange={(e) => setProduitId(e.target.value)} placeholder="P001, SN-2024..." style={inputStyle} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>KATEGORI</label>
            <select value={categorie} onChange={(e) => setCategorie(e.target.value as CategorieKey)} style={{ ...inputStyle, cursor: "pointer" }}>
              {(Object.entries(CATEGORIES) as [CategorieKey, { label: string; komisyon: number }][]).map(([key, cat]) => (
                <option key={key} value={key}>{cat.label} — Komisyon: ${cat.komisyon}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>PRI STORE ($)</label>
              <input type="number" value={prixStore} onChange={(e) => setPrixStore(e.target.value)} placeholder="380" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>PRI VANT ($)</label>
              <input type="number" value={prixVente} onChange={(e) => setPrixVente(e.target.value)} placeholder="440" style={inputStyle} />
            </div>
          </div>

          {preview && (
            <div style={{ background: "#0d1117", borderRadius: "14px", padding: "14px", marginBottom: "12px" }}>
              <p style={{ margin: "0 0 10px", fontSize: "10px", fontWeight: 700, color: "#555", letterSpacing: "0.06em" }}>KALKIL OTOMATIK</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", color: "#666" }}>Benefis ({fmt(venteN)} − {fmt(storeN)})</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#f39c12" }}>{fmt(preview.benefis)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "#666" }}>Komisyon ({CATEGORIES[categorie].label})</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#2ecc71" }}>+${CATEGORIES[categorie].komisyon}</span>
              </div>
              <div style={{ borderTop: "1px solid #2a2f3e", paddingTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Grand Total</span>
                <span style={{ fontSize: "22px", fontWeight: 900, color: "#2ecc71" }}>{fmt(preview.grandTotal)}</span>
              </div>
            </div>
          )}

          <div style={{ background: "#0d1117", borderRadius: "12px", padding: "10px 14px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🕐</span>
            <div>
              <p style={{ margin: 0, fontSize: "10px", color: "#555", fontWeight: 700, letterSpacing: "0.05em" }}>DAT & LÈ — OTOMATIK</p>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888" }}>{formatDate(new Date().toISOString())}</p>
            </div>
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={labelStyle}>NÒT (opsyonèl)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Remak..." style={inputStyle} />
          </div>

          <button onClick={submit} style={{ width: "100%", padding: "15px", background: "#2ecc71", color: "#000", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
            ➕ Ajoute Vant
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL — RETRAIT
// ══════════════════════════════════════════════════════════════════════════
function RetraitModal({ vendeur, onClose, onSave }: { vendeur: Vendeur; onClose: () => void; onSave: (r: Retrait) => void }) {
  const [montant, setMontant] = useState("");
  const [note,    setNote]    = useState("");
  const bal = balance(vendeur);

  const submit = () => {
    const m = parseFloat(montant);
    if (!m || m <= 0) return;
    if (m > bal) { alert("Montan depase balans!"); return; }
    onSave({ id: `r_${Date.now()}`, montant: m, date: new Date().toISOString(), note: note.trim() });
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1f2e", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", padding: "0 0 40px" }}>
        <div style={{ width: "40px", height: "4px", background: "#333", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#fff" }}>💸 Fè Retrè</p>
            <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#2a2f3e", border: "none", color: "#aaa", fontSize: "16px", cursor: "pointer" }}>×</button>
          </div>
          <div style={{ background: "#0d1117", borderRadius: "14px", padding: "14px", marginBottom: "16px", textAlign: "center" }}>
            <p style={{ margin: "0 0 4px", fontSize: "11px", color: "#666" }}>Balans disponib</p>
            <p style={{ margin: 0, fontSize: "28px", fontWeight: 900, color: bal > 0 ? "#2ecc71" : "#e74c3c" }}>{fmt(bal)}</p>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>MONTAN ($)</label>
            <input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0.00" style={{ ...inputStyle, textAlign: "center", fontSize: "22px" }} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>NÒT</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: Semèn 1" style={inputStyle} />
          </div>
          <div style={{ background: "#0d1117", borderRadius: "12px", padding: "10px 14px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🕐</span>
            <div>
              <p style={{ margin: 0, fontSize: "10px", color: "#555", fontWeight: 700, letterSpacing: "0.05em" }}>DAT & LÈ — OTOMATIK</p>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888" }}>{formatDate(new Date().toISOString())}</p>
            </div>
          </div>
          <button onClick={submit} style={{ width: "100%", padding: "15px", background: "#e74c3c", color: "#fff", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
            💸 Konfime Retrè
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL — AJOUTE / MODIFYE VENDEUR
// ══════════════════════════════════════════════════════════════════════════
function VendeurModal({ vendeur, colorIndex, onClose, onSave }: { vendeur?: Vendeur; colorIndex: number; onClose: () => void; onSave: (v: Vendeur) => void }) {
  const [nom, setNom] = useState(vendeur?.nom ?? "");
  const couleur = vendeur?.couleur ?? COLORS[colorIndex % COLORS.length];

  const submit = () => {
    if (!nom.trim()) return;
    onSave(
      vendeur
        ? { ...vendeur, nom: nom.trim() }
        : { id: `v_${Date.now()}`, nom: nom.trim(), couleur, actif: true, ventes: [], retraits: [] }
    );
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1f2e", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", padding: "0 0 40px" }}>
        <div style={{ width: "40px", height: "4px", background: "#333", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#fff" }}>
              {vendeur ? "✏️ Modifye Vandè" : "➕ Nouvo Vandè"}
            </p>
            <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#2a2f3e", border: "none", color: "#aaa", fontSize: "16px", cursor: "pointer" }}>×</button>
          </div>
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>NOM</label>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Cesar, Marie..." style={inputStyle} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "22px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: couleur }} />
            <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>Koulè asiye otomatikman</p>
          </div>
          <button onClick={submit} style={{ width: "100%", padding: "15px", background: "#2ecc71", color: "#000", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
            {vendeur ? "💾 Sove Chanjman" : "➕ Kreye Vandè"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CONFIRM DIALOG
// ══════════════════════════════════════════════════════════════════════════
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1f2e", borderRadius: "20px", padding: "24px 20px", width: "100%", maxWidth: "320px", textAlign: "center" }}>
        <p style={{ fontSize: "36px", margin: "0 0 10px" }}>🗑️</p>
        <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#ccc" }}>{message}</p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px", borderRadius: "12px", background: "#2a2f3e", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", color: "#fff", fontFamily: "inherit" }}>Anile</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "12px", borderRadius: "12px", background: "#e74c3c", color: "#fff", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Efase</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// VENDEUR DETAIL VIEW
// ══════════════════════════════════════════════════════════════════════════
function VendeurDetail({ vendeur, can, onBack, onUpdate }: {
  vendeur: Vendeur;
  can: { voir: boolean; ajoute: boolean; modifye: boolean; siprime: boolean };
  onBack: () => void;
  onUpdate: (v: Vendeur) => void;
}) {
  const [showAddVente,    setShowAddVente]    = useState(false);
  const [showRetrait,     setShowRetrait]     = useState(false);
  const [confirmDelVente, setConfirmDelVente] = useState<string | null>(null);
  const [activeTab,       setActiveTab]       = useState<"ventes" | "retraits">("ventes");

  const bal      = balance(vendeur);
  const totGrand = totalGrandTotal(vendeur);
  const totBen   = totalBenefis(vendeur);
  const totKom   = totalKomisyon(vendeur);
  const totRetr  = totalRetraits(vendeur);

  const addVente   = (v: Vente)   => onUpdate({ ...vendeur, ventes: [...vendeur.ventes, v] });
  const delVente   = (id: string) => { onUpdate({ ...vendeur, ventes: vendeur.ventes.filter((x) => x.id !== id) }); setConfirmDelVente(null); };
  const addRetrait = (r: Retrait) => onUpdate({ ...vendeur, retraits: [...vendeur.retraits, r] });

  const sortedVentes   = [...vendeur.ventes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const sortedRetraits = [...vendeur.retraits].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "90px" }}>
      {showAddVente  && <AddVenteModal onClose={() => setShowAddVente(false)} onSave={addVente} />}
      {showRetrait   && <RetraitModal vendeur={vendeur} onClose={() => setShowRetrait(false)} onSave={addRetrait} />}
      {confirmDelVente && <ConfirmDialog message="Efase vant sa a?" onConfirm={() => delVente(confirmDelVente)} onCancel={() => setConfirmDelVente(null)} />}

      <header style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "14px", borderBottom: "1px solid #1a1f2e" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#fff", fontSize: "22px", cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: vendeur.couleur, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: 900, color: "#000" }}>
            {vendeur.nom[0].toUpperCase()}
          </div>
          <p style={{ margin: 0, fontSize: "18px", fontWeight: 900 }}>{vendeur.nom}</p>
        </div>
      </header>

      <div style={{ padding: "14px 14px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
          {[
            { label: "Balans",        value: fmt(bal),      color: bal >= 0 ? "#2ecc71" : "#e74c3c", bg: "#0a2a1a" },
            { label: "Grand Total",   value: fmt(totGrand), color: "#3498db", bg: "#0a1a2a" },
            { label: "Total Benefis", value: fmt(totBen),   color: "#f39c12", bg: "#2a1a0a" },
            { label: "Total Retrè",   value: fmt(totRetr),  color: "#e74c3c", bg: "#2a0a0a" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{ background: bg, borderRadius: "14px", padding: "14px 12px", border: `1px solid ${color}22` }}>
              <p style={{ margin: "0 0 4px", fontSize: "10px", color: "#666", fontWeight: 600 }}>{label}</p>
              <p style={{ margin: 0, fontSize: "18px", fontWeight: 900, color }}>{value}</p>
            </div>
          ))}
        </div>

        <div style={{ background: "#1a1f2e", borderRadius: "14px", padding: "12px 14px", marginBottom: "14px" }}>
          <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 700, color: "#555", letterSpacing: "0.06em" }}>KOMISYON PA KATEGORI</p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {(Object.entries(CATEGORIES) as [CategorieKey, { label: string; komisyon: number }][]).map(([key, cat]) => (
              <span key={key} style={{ background: "#0d1117", color: "#3498db", padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>
                {cat.label}: ${cat.komisyon}
              </span>
            ))}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "10px", color: "#555" }}>
            Total komisyon: <strong style={{ color: "#2ecc71" }}>{fmt(totKom)}</strong>
          </p>
        </div>

        {can.ajoute && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
            <button onClick={() => setShowAddVente(true)} style={{ flex: 1, padding: "12px", background: "#2ecc71", color: "#000", border: "none", borderRadius: "12px", fontSize: "12px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              ➕ Ajoute Vant
            </button>
            <button onClick={() => setShowRetrait(true)} style={{ flex: 1, padding: "12px", background: "#e74c3c", color: "#fff", border: "none", borderRadius: "12px", fontSize: "12px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              💸 Retrè
            </button>
          </div>
        )}

        <div style={{ display: "flex", background: "#1a1f2e", borderRadius: "12px", padding: "4px", marginBottom: "12px" }}>
          {([
            { key: "ventes",   label: `Vant (${vendeur.ventes.length})` },
            { key: "retraits", label: `Retrè (${vendeur.retraits.length})` },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{ flex: 1, padding: "9px", borderRadius: "10px", background: activeTab === key ? "#2a3050" : "transparent", border: "none", color: activeTab === key ? "#fff" : "#555", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === "ventes" && (
          sortedVentes.length === 0
            ? <div style={{ textAlign: "center", padding: "40px 20px" }}><p style={{ fontSize: "36px", margin: "0 0 8px" }}>📭</p><p style={{ color: "#444", fontSize: "13px" }}>Okenn vant anrejistre.</p></div>
            : sortedVentes.map((vente) => {
                const cat = CATEGORIES[vente.categorie];
                return (
                  <div key={vente.id} style={{ background: "#1a1f2e", borderRadius: "14px", padding: "12px 14px", marginBottom: "8px", borderLeft: `3px solid ${vendeur.couleur}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                      <div>
                        <p style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#fff" }}>{vente.marque} {vente.modele}</p>
                        <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#555" }}>🔖 ID: {vente.produitId}</p>
                        <span style={{ display: "inline-block", background: "#1a2a3a", color: "#3498db", padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700, marginTop: "4px" }}>
                          {cat.label}
                        </span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ margin: 0, fontSize: "11px", color: "#555" }}>Store: {fmt(vente.prixStore)}</p>
                        <p style={{ margin: "2px 0 0", fontSize: "13px", fontWeight: 700, color: "#fff" }}>Vant: {fmt(vente.prixVente)}</p>
                      </div>
                    </div>
                    <div style={{ background: "#0d1117", borderRadius: "10px", padding: "10px 12px", marginBottom: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "11px", color: "#666" }}>Benefis ({fmt(vente.prixVente)} − {fmt(vente.prixStore)})</span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#f39c12" }}>{fmt(vente.benefis)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ fontSize: "11px", color: "#666" }}>Komisyon ({cat.label})</span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#2ecc71" }}>+${cat.komisyon}</span>
                      </div>
                      <div style={{ borderTop: "1px solid #2a2f3e", paddingTop: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", fontWeight: 800, color: "#fff" }}>Grand Total</span>
                        <span style={{ fontSize: "16px", fontWeight: 900, color: "#2ecc71" }}>{fmt(vente.grandTotal)}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <p style={{ margin: 0, fontSize: "10px", color: "#555" }}>🕐 {formatDate(vente.date)}</p>
                        {vente.note && <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#555", fontStyle: "italic" }}>"{vente.note}"</p>}
                      </div>
                      {can.siprime && (
                        <button onClick={() => setConfirmDelVente(vente.id)} style={{ padding: "6px 10px", background: "#2a1a1a", border: "none", borderRadius: "8px", color: "#e74c3c", fontSize: "12px", cursor: "pointer" }}>
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
        )}

        {activeTab === "retraits" && (
          sortedRetraits.length === 0
            ? <div style={{ textAlign: "center", padding: "40px 20px" }}><p style={{ fontSize: "36px", margin: "0 0 8px" }}>💸</p><p style={{ color: "#444", fontSize: "13px" }}>Okenn retrè.</p></div>
            : sortedRetraits.map((r) => (
                <div key={r.id} style={{ background: "#1a1f2e", borderRadius: "14px", padding: "12px 14px", marginBottom: "8px", borderLeft: "3px solid #e74c3c" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#e74c3c" }}>-{fmt(r.montant)}</p>
                      <p style={{ margin: "3px 0 0", fontSize: "10px", color: "#555" }}>🕐 {formatDate(r.date)}</p>
                      {r.note && <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#555", fontStyle: "italic" }}>"{r.note}"</p>}
                    </div>
                    <span style={{ background: "#2a0a0a", color: "#e74c3c", padding: "4px 10px", borderRadius: "999px", fontSize: "10px", fontWeight: 700 }}>RETRÈ</span>
                  </div>
                </div>
              ))
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ══════════════════════════════════════════════════════════════════════════
export default function VendeursPage() {
  const router = useRouter();

  const [can, setCan] = useState({
    voir: false, ajoute: false, modifye: false, siprime: false,
  });

  const [vendeurs,      setVendeurs]      = useState<Vendeur[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [activeTab,     setActiveTab]     = useState<"dashboard" | "vendeurs">("dashboard");
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [showVdrModal,  setShowVdrModal]  = useState(false);
  const [editingVdr,    setEditingVdr]    = useState<Vendeur | undefined>(undefined);
  const [confirmDelVdr, setConfirmDelVdr] = useState<string | null>(null);

  const SITE_REF = doc(db, FS_COL, FS_DOC);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        // Chaje vendeurs
        const snap = await getDoc(SITE_REF);
        if (snap.exists() && Array.isArray(snap.data()?.vendeurs) && snap.data()!.vendeurs.length > 0) {
          setVendeurs(snap.data()!.vendeurs as Vendeur[]);
        }

        // ✅ Li permission reyèl depi sitelogin/loginsite
        const loginSnap = await getDoc(doc(db, "sitelogin", "loginsite"));
        if (loginSnap.exists()) {
          const usersObj = loginSnap.data()?.users ?? {};
          const mwen = usersObj[user.uid];
          if (mwen?.permissions?.vendeurs) {
            const p = mwen.permissions.vendeurs;
            setCan({
              voir:    p.voir      ?? false,
              ajoute:  p.ajouter   ?? false,
              modifye: p.modifier  ?? false,
              siprime: p.supprimer ?? false,
            });
          }
        }
      } catch (err) {
        console.error("Errè chajman:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const save = async (updated: Vendeur[]) => {
    const user = getAuth().currentUser;
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(SITE_REF, { vendeurs: updated, updatedAt: new Date().toISOString() });
    } catch (err) {
      console.error("Errè save:", err);
    } finally {
      setSaving(false);
    }
  };

  const updateVendeur = (v: Vendeur) => {
    const updated = vendeurs.map((x) => (x.id === v.id ? v : x));
    setVendeurs(updated);
    save(updated);
  };
  const addVendeur = (v: Vendeur) => {
    const updated = [...vendeurs, v];
    setVendeurs(updated);
    save(updated);
  };
  const deleteVendeur = (id: string) => {
    const updated = vendeurs.filter((v) => v.id !== id);
    setVendeurs(updated);
    setConfirmDelVdr(null);
    save(updated);
  };

  const selectedVendeur = vendeurs.find((v) => v.id === selectedId) ?? null;

  if (selectedVendeur) {
    return (
      <VendeurDetail
        vendeur={selectedVendeur}
        can={can}
        onBack={() => setSelectedId(null)}
        onUpdate={updateVendeur}
      />
    );
  }

  const sorted   = [...vendeurs].sort((a, b) => totalGrandTotal(b) - totalGrandTotal(a));
  const totalG   = vendeurs.reduce((s, v) => s + balance(v), 0);
  const maxGrand = Math.max(...vendeurs.map(totalGrandTotal), 1);

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "80px" }}>

      {showVdrModal && (
        <VendeurModal
          vendeur={editingVdr}
          colorIndex={vendeurs.length}
          onClose={() => { setShowVdrModal(false); setEditingVdr(undefined); }}
          onSave={(v) => { if (editingVdr) updateVendeur(v); else addVendeur(v); }}
        />
      )}
      {confirmDelVdr && (
        <ConfirmDialog
          message="Efase vandè sa a? Tout vant li yo ap efase tou."
          onConfirm={() => deleteVendeur(confirmDelVdr)}
          onCancel={() => setConfirmDelVdr(null)}
        />
      )}

      <header style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1f2e" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "#fff", fontSize: "22px", cursor: "pointer", padding: 0 }}>←</button>
          <p style={{ margin: 0, fontSize: "20px", fontWeight: 900 }}>Vendeurs</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {saving && <span style={{ fontSize: "10px", color: "#555" }}>💾 Ap sove...</span>}
          {can.ajoute && (
            <button onClick={() => { setEditingVdr(undefined); setShowVdrModal(true); }} style={{ background: "#2ecc71", color: "#000", border: "none", borderRadius: "10px", padding: "8px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              ➕ Ajoute
            </button>
          )}
        </div>
      </header>

      <div style={{ display: "flex", borderBottom: "1px solid #1a1f2e" }}>
        {([{ key: "dashboard", label: "DASHBOARD" }, { key: "vendeurs", label: "VANDÈ" }] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ flex: 1, padding: "14px", border: "none", background: "none", color: activeTab === key ? "#2ecc71" : "#444", fontSize: "13px", fontWeight: 800, letterSpacing: "0.06em", borderBottom: activeTab === key ? "2.5px solid #2ecc71" : "2.5px solid transparent", cursor: "pointer", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px" }}>
          <p style={{ color: "#444" }}>Chajman...</p>
        </div>
      ) : (
        <div style={{ padding: "14px" }}>

          {activeTab === "dashboard" && (
            <>
              <div style={{ background: "#2ecc71", borderRadius: "20px", padding: "20px", marginBottom: "20px", position: "relative", overflow: "hidden" }}>
                <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 800, color: "rgba(0,0,0,0.5)", letterSpacing: "0.08em" }}>TOTAL GLOBAL A PEYE</p>
                <p style={{ margin: "0 0 6px", fontSize: "36px", fontWeight: 900, color: "#000", lineHeight: 1 }}>{fmt(totalG)}</p>
                <p style={{ margin: 0, fontSize: "13px", color: "rgba(0,0,0,0.5)" }}>{vendeurs.length} vandè</p>
                <div style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", width: "56px", height: "56px", borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>💰</div>
              </div>

              <p style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 800, color: "#fff" }}>Balans pa Vandè</p>
              <div style={{ background: "#1a1f2e", borderRadius: "18px", padding: "16px", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "120px", justifyContent: "center" }}>
                  {sorted.map((v) => {
                    const h = Math.max(8, (totalGrandTotal(v) / maxGrand) * 100);
                    return (
                      <div key={v.id} onClick={() => setSelectedId(v.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                        <div style={{ width: "32px", height: `${h}px`, background: v.couleur, borderRadius: "6px 6px 0 0" }} />
                        <p style={{ margin: 0, fontSize: "9px", color: v.couleur, fontWeight: 700, textAlign: "center", maxWidth: "40px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.nom.slice(0, 6)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 800, color: "#fff" }}>Klasman Vandè</p>
              {sorted.map((v, idx) => {
                const bal = balance(v);
                return (
                  <div key={v.id} onClick={() => setSelectedId(v.id)} style={{ background: "#1a1f2e", borderRadius: "16px", padding: "14px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", border: `1px solid ${v.couleur}22` }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: v.couleur, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 900, color: "#000", flexShrink: 0 }}>{idx + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#fff" }}>{v.nom}</p>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#555" }}>{v.ventes.length} vant · Total: {fmt(totalGrandTotal(v))}</p>
                    </div>
                    <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: bal >= 0 ? v.couleur : "#e74c3c", flexShrink: 0 }}>{fmt(bal)}</p>
                  </div>
                );
              })}
            </>
          )}

          {activeTab === "vendeurs" && (
            vendeurs.length === 0
              ? <div style={{ textAlign: "center", padding: "60px 20px" }}><p style={{ fontSize: "40px", margin: "0 0 10px" }}>👥</p><p style={{ color: "#444", fontSize: "14px" }}>Okenn vandè anrejistre.</p></div>
              : vendeurs.map((v) => {
                  const bal = balance(v);
                  return (
                    <div key={v.id} style={{ background: "#1a1f2e", borderRadius: "16px", padding: "14px", marginBottom: "10px", borderLeft: `4px solid ${v.couleur}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px", cursor: "pointer" }} onClick={() => setSelectedId(v.id)}>
                        <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: v.couleur, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: 900, color: "#000", flexShrink: 0 }}>{v.nom[0].toUpperCase()}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <p style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#fff" }}>{v.nom}</p>
                            <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: bal >= 0 ? "#2ecc71" : "#e74c3c" }}>{fmt(bal)}</p>
                          </div>
                          <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                            <p style={{ margin: 0, fontSize: "10px", color: "#555" }}>📦 {v.ventes.length} vant</p>
                            <p style={{ margin: 0, fontSize: "10px", color: "#555" }}>💸 {fmt(totalRetraits(v))} retrè</p>
                          </div>
                        </div>
                      </div>
                      {(can.voir || can.modifye || can.siprime) && (
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => setSelectedId(v.id)} style={{ flex: 1, padding: "8px", background: "#2a3050", border: "none", borderRadius: "10px", color: "#aaa", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>👁️ Detay</button>
                          {can.modifye && (
                            <button onClick={() => { setEditingVdr(v); setShowVdrModal(true); }} style={{ flex: 1, padding: "8px", background: "#1a2a3a", border: "none", borderRadius: "10px", color: "#3498db", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✏️ Modifye</button>
                          )}
                          {can.siprime && (
                            <button onClick={() => setConfirmDelVdr(v.id)} style={{ padding: "8px 12px", background: "#2a0a0a", border: "none", borderRadius: "10px", color: "#e74c3c", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🗑️</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
          )}
        </div>
      )}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#1a1f2e", borderTop: "1px solid #0d1117", display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 0 10px", zIndex: 100 }}>
        {[
          { icon: "🏠", label: "Boutique",  action: () => router.push("/"),          color: "#444"    },
          { icon: "⚡", label: "Dashboard", action: () => router.push("/dashboard"), color: "#e63946" },
          { icon: "🪪", label: "Vandè",     action: () => {},                        color: "#2ecc71" },
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
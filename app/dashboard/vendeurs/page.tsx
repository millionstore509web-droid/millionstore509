"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, runTransaction } from "firebase/firestore";
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
  annule?: boolean;
  annuleDate?: string;
}

interface HistEntry {
  type: "vente" | "annulation" | "restauration" | "retrait" | "depot";
  date: string;
  montant: number; // positif = crédit, négatif = débit
  description: string;
  venteId?: string;
  marque?: string;
  modele?: string;
  produitId?: string;
  categorie?: string;
  note?: string;
}

interface Vendeur {
  id: string;
  nom: string;
  couleur: string;
  actif: boolean;
  balance: number;
  ventes: Vente[];
  historique: HistEntry[];
}

interface Permissions {
  voir: boolean;
  ajoute: boolean;
  modifye: boolean;
  siprime: boolean;
  retrait: boolean;
  depot: boolean;
  annule: boolean;
  restore: boolean;
}

// ══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════
const COLORS = [
  "#2ecc71", "#3498db", "#e67e22", "#9b59b6",
  "#e74c3c", "#1abc9c", "#f39c12", "#e91e63",
];

const CATEGORIES = {
  ordinateur: { label: "Ordinateur",    komisyon: 20 },
  mini:       { label: "Mini Portable", komisyon: 10 },
  autre:      { label: "Autre Article", komisyon:  5 },
} as const;

type CategorieKey = keyof typeof CATEGORIES;

const FS_COL = "vendeursite";
const FS_DOC = "sitevendeur";
const SITE_REF = () => doc(db, FS_COL, FS_DOC);

const ICON_MAP: Record<string, string> = {
  vente: "🛒", annulation: "🚫", restauration: "♻️", retrait: "💸", depot: "💰",
};
const TITRE_MAP: Record<string, string> = {
  vente: "Vente ajoutée", annulation: "Vente annulée", restauration: "Vente restaurée",
  retrait: "Retrait effectué", depot: "Dépôt effectué",
};

// ══════════════════════════════════════════════════════════════════════════
// HELPERS — calcul
// ══════════════════════════════════════════════════════════════════════════
function calcVente(prixStore: number, prixVente: number, categorie: CategorieKey) {
  const benefis  = Math.max(0, prixVente - prixStore);
  const komisyon = CATEGORIES[categorie].komisyon;
  return { benefis, komisyon, grandTotal: benefis + komisyon };
}

function totalActives(v: Vendeur) { return v.ventes.filter(x => !x.annule); }
function totalGrandTotal(v: Vendeur) { return totalActives(v).reduce((s, x) => s + x.grandTotal, 0); }
function totalBenefis(v: Vendeur)    { return totalActives(v).reduce((s, x) => s + x.benefis, 0); }
function totalKomisyon(v: Vendeur)   { return totalActives(v).reduce((s, x) => s + x.komisyon, 0); }
function totalRetraits(v: Vendeur) {
  return (v.historique ?? []).filter(h => h.type === "retrait").reduce((s, h) => s + Math.abs(h.montant), 0);
}
function totalDepots(v: Vendeur) {
  return (v.historique ?? []).filter(h => h.type === "depot").reduce((s, h) => s + h.montant, 0);
}

/** Migre une entrée legacy (sans balance/historique) vers le nouveau modèle,
 *  sans jamais perdre de données existantes. */
function normalizeVendeur(raw: any): Vendeur {
  const hasBalance = typeof raw.balance === "number";
  const ventes: Vente[] = (raw.ventes ?? []).map((v: any) => ({ ...v, annule: v.annule ?? false }));
  const legacyRetraits: number = Array.isArray(raw.retraits)
    ? raw.retraits.reduce((s: number, x: any) => s + (x.montant ?? 0), 0)
    : 0;
  const balance = hasBalance
    ? raw.balance
    : ventes.reduce((s, x) => s + (x.annule ? 0 : x.grandTotal), 0) - legacyRetraits;
  return {
    id: raw.id, nom: raw.nom ?? "", couleur: raw.couleur ?? COLORS[0], actif: raw.actif ?? true,
    balance, ventes, historique: raw.historique ?? [],
  };
}

/** Relevé complet : historique trié, solde après chaque ligne calculé en
 *  arrière à partir du vrai solde actuel — la ligne la plus récente
 *  correspond toujours exactement au solde affiché en haut. */
function releveComplet(v: Vendeur): (HistEntry & { soldeApres: number })[] {
  const lignes = [...(v.historique ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  let running = v.balance ?? 0;
  const out: (HistEntry & { soldeApres: number })[] = [];
  for (let i = lignes.length - 1; i >= 0; i--) {
    out.unshift({ ...lignes[i], soldeApres: running });
    running -= lignes[i].montant;
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function phraseMouvement(type: string, montant: number, avant: number, apres: number): string {
  const m = Math.abs(montant).toFixed(2);
  const a = avant.toFixed(2);
  const b = apres.toFixed(2);
  switch (type) {
    case "vente": return `Vente ajoutée de $${m}. Solde avant : $${a}, solde après : $${b}.`;
    case "annulation": return `Vente annulée de $${m}. Solde avant : $${a}, solde après : $${b}.`;
    case "restauration": return `Vente restaurée de $${m}. Solde avant : $${a}, solde après : $${b}.`;
    case "retrait": return `Retrait de $${m}. Solde avant : $${a}, solde après : $${b}.`;
    case "depot": return `Dépôt de $${m}. Solde avant : $${a}, solde après : $${b}.`;
    default: return `Solde après : $${b}.`;
  }
}

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
// TRANSACTIONS FIRESTORE — toutes les actions qui touchent le solde ou la
// liste des vendeurs passent par une transaction atomique. Firestore lit
// l'état le plus récent du document, applique la mutation, et réessaie
// automatiquement en cas de conflit avec un autre appareil.
// ══════════════════════════════════════════════════════════════════════════
async function readVendeursList(tx: any): Promise<Vendeur[]> {
  const snap = await tx.get(SITE_REF());
  const data = snap.exists() ? snap.data() : {};
  const raw: any[] = Array.isArray(data?.vendeurs) ? data.vendeurs : [];
  return raw.map(normalizeVendeur);
}

/** Modifie UN vendeur de manière atomique. [mutate] peut lancer une Error
 *  (message en français) pour annuler l'opération — rien n'est écrit. */
async function transactVendeur(
  vendeurId: string,
  mutate: (current: Vendeur) => Vendeur
): Promise<Vendeur> {
  return await runTransaction(db, async (tx) => {
    const list = await readVendeursList(tx);
    const idx = list.findIndex((v) => v.id === vendeurId);
    if (idx === -1) throw new Error("Vendeur introuvable.");
    const updated = mutate(list[idx]);
    const newList = [...list];
    newList[idx] = updated;
    tx.set(SITE_REF(), { vendeurs: newList, updatedAt: new Date().toISOString() });
    return updated;
  });
}

async function ajouterVendeurAtomic(nom: string, couleurIndex: number): Promise<Vendeur> {
  return await runTransaction(db, async (tx) => {
    const list = await readVendeursList(tx);
    const v: Vendeur = {
      id: `v_${Date.now()}`, nom, couleur: COLORS[couleurIndex % COLORS.length],
      actif: true, balance: 0, ventes: [], historique: [],
    };
    tx.set(SITE_REF(), { vendeurs: [...list, v], updatedAt: new Date().toISOString() });
    return v;
  });
}

async function deleteVendeurAtomic(vendeurId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const list = await readVendeursList(tx);
    const idx = list.findIndex((v) => v.id === vendeurId);
    if (idx === -1) throw new Error("Vendeur introuvable.");
    if ((list[idx].balance ?? 0) !== 0) throw new Error("BALANCE_NON_NULLE");
    const newList = [...list];
    newList.splice(idx, 1);
    tx.set(SITE_REF(), { vendeurs: newList, updatedAt: new Date().toISOString() });
  });
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
function badgeStyle(c: string): React.CSSProperties {
  return { background: `${c}22`, color: c, fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "6px" };
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL — AJOUTER UNE VENTE
// ══════════════════════════════════════════════════════════════════════════
function AddVenteModal({ busy, onClose, onConfirm }: {
  busy: boolean;
  onClose: () => void;
  onConfirm: (v: Omit<Vente, "id" | "date" | "annule" | "annuleDate">) => Promise<void>;
}) {
  const [marque,    setMarque]    = useState("");
  const [modele,    setModele]    = useState("");
  const [produitId, setProduitId] = useState("");
  const [categorie, setCategorie] = useState<CategorieKey>("ordinateur");
  const [prixStore, setPrixStore] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [note,      setNote]      = useState("");
  const [err,       setErr]       = useState<string | null>(null);

  const storeN  = parseFloat(prixStore) || 0;
  const venteN  = parseFloat(prixVente) || 0;
  const preview = storeN > 0 && venteN > 0 ? calcVente(storeN, venteN, categorie) : null;

  const submit = async () => {
    if (!marque.trim() || !modele.trim() || !produitId.trim() || storeN <= 0 || venteN <= 0) {
      setErr("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    const { benefis, komisyon, grandTotal } = calcVente(storeN, venteN, categorie);
    try {
      await onConfirm({
        marque: marque.trim(), modele: modele.trim(), produitId: produitId.trim(),
        categorie, prixStore: storeN, prixVente: venteN,
        benefis, komisyon, grandTotal, note: note.trim(),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Une erreur est survenue.");
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1f2e", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", maxHeight: "93vh", overflowY: "auto", paddingBottom: "32px" }}>
        <div style={{ width: "40px", height: "4px", background: "#333", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#fff" }}>➕ Ajouter une Vente</p>
            <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#2a2f3e", border: "none", color: "#aaa", fontSize: "16px", cursor: "pointer" }}>×</button>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>MARQUE</label>
            <input value={marque} onChange={(e) => setMarque(e.target.value)} placeholder="Dell, HP, Lenovo..." style={inputStyle} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>MODÈLE</label>
            <input value={modele} onChange={(e) => setModele(e.target.value)} placeholder="Latitude E7470..." style={inputStyle} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>ID PRODUIT</label>
            <input value={produitId} onChange={(e) => setProduitId(e.target.value)} placeholder="P001, SN-2024..." style={inputStyle} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>CATÉGORIE</label>
            <select value={categorie} onChange={(e) => setCategorie(e.target.value as CategorieKey)} style={{ ...inputStyle, cursor: "pointer" }}>
              {(Object.entries(CATEGORIES) as [CategorieKey, { label: string; komisyon: number }][]).map(([key, cat]) => (
                <option key={key} value={key}>{cat.label} — Commission : ${cat.komisyon}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>PRIX ACHAT ($)</label>
              <input type="number" value={prixStore} onChange={(e) => setPrixStore(e.target.value)} placeholder="380" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>PRIX VENTE ($)</label>
              <input type="number" value={prixVente} onChange={(e) => setPrixVente(e.target.value)} placeholder="440" style={inputStyle} />
            </div>
          </div>

          {preview && (
            <div style={{ background: "#0d1117", borderRadius: "14px", padding: "14px", marginBottom: "12px" }}>
              <p style={{ margin: "0 0 10px", fontSize: "10px", fontWeight: 700, color: "#555", letterSpacing: "0.06em" }}>CALCUL AUTOMATIQUE</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", color: "#666" }}>Bénéfice ({fmt(venteN)} − {fmt(storeN)})</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#f39c12" }}>{fmt(preview.benefis)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "#666" }}>Commission ({CATEGORIES[categorie].label})</span>
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
              <p style={{ margin: 0, fontSize: "10px", color: "#555", fontWeight: 700, letterSpacing: "0.05em" }}>DATE & HEURE — AUTOMATIQUE</p>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888" }}>{formatDate(new Date().toISOString())}</p>
            </div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>NOTE (optionnel)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Remarque..." style={inputStyle} />
          </div>

          {err && <p style={{ color: "#e74c3c", fontSize: "12px", margin: "0 0 12px" }}>{err}</p>}

          <button onClick={submit} disabled={busy} style={{ width: "100%", padding: "15px", background: busy ? "#1c3a2a" : "#2ecc71", color: busy ? "#5a8a6a" : "#000", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 900, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
            {busy ? "Enregistrement..." : "➕ Ajouter la Vente"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL — RETRAIT
// ══════════════════════════════════════════════════════════════════════════
function RetraitModal({ vendeur, busy, onClose, onConfirm }: {
  vendeur: Vendeur; busy: boolean; onClose: () => void;
  onConfirm: (montant: number, note: string) => Promise<void>;
}) {
  const [montant, setMontant] = useState("");
  const [note,    setNote]    = useState("");
  const [err,     setErr]     = useState<string | null>(null);
  const bal = vendeur.balance ?? 0;

  const submit = async () => {
    const m = parseFloat(montant);
    if (!m || m <= 0) { setErr("Montant invalide."); return; }
    if (m > bal) { setErr("Le montant dépasse le solde disponible."); return; }
    try {
      await onConfirm(m, note.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Une erreur est survenue.");
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1f2e", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", padding: "0 0 40px" }}>
        <div style={{ width: "40px", height: "4px", background: "#333", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#fff" }}>💸 Effectuer un Retrait</p>
            <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#2a2f3e", border: "none", color: "#aaa", fontSize: "16px", cursor: "pointer" }}>×</button>
          </div>
          <div style={{ background: "#0d1117", borderRadius: "14px", padding: "14px", marginBottom: "16px", textAlign: "center" }}>
            <p style={{ margin: "0 0 4px", fontSize: "11px", color: "#666" }}>Solde disponible</p>
            <p style={{ margin: 0, fontSize: "28px", fontWeight: 900, color: bal > 0 ? "#2ecc71" : "#e74c3c" }}>{fmt(bal)}</p>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>MONTANT ($)</label>
            <input type="number" value={montant} onChange={(e) => { setMontant(e.target.value); setErr(null); }} placeholder="0.00" style={{ ...inputStyle, textAlign: "center", fontSize: "22px" }} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>NOTE</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : Semaine 1" style={inputStyle} />
          </div>
          <div style={{ background: "#0d1117", borderRadius: "12px", padding: "10px 14px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🕐</span>
            <div>
              <p style={{ margin: 0, fontSize: "10px", color: "#555", fontWeight: 700, letterSpacing: "0.05em" }}>DATE & HEURE — AUTOMATIQUE</p>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888" }}>{formatDate(new Date().toISOString())}</p>
            </div>
          </div>
          {err && <p style={{ color: "#e74c3c", fontSize: "12px", margin: "0 0 12px" }}>{err}</p>}
          <button onClick={submit} disabled={busy} style={{ width: "100%", padding: "15px", background: busy ? "#5a1a1a" : "#e74c3c", color: "#fff", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 900, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
            {busy ? "Traitement..." : "💸 Confirmer le Retrait"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL — DÉPÔT
// ══════════════════════════════════════════════════════════════════════════
function DepotModal({ vendeur, busy, onClose, onConfirm }: {
  vendeur: Vendeur; busy: boolean; onClose: () => void;
  onConfirm: (montant: number, note: string) => Promise<void>;
}) {
  const [montant, setMontant] = useState("");
  const [note,    setNote]    = useState("");
  const [err,     setErr]     = useState<string | null>(null);
  const bal = vendeur.balance ?? 0;

  const submit = async () => {
    const m = parseFloat(montant);
    if (!m || m <= 0) { setErr("Montant invalide."); return; }
    try {
      await onConfirm(m, note.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Une erreur est survenue.");
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1f2e", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", padding: "0 0 40px" }}>
        <div style={{ width: "40px", height: "4px", background: "#333", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#fff" }}>💰 Effectuer un Dépôt</p>
            <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#2a2f3e", border: "none", color: "#aaa", fontSize: "16px", cursor: "pointer" }}>×</button>
          </div>
          <div style={{ background: "#0d1117", borderRadius: "14px", padding: "14px", marginBottom: "16px", textAlign: "center" }}>
            <p style={{ margin: "0 0 4px", fontSize: "11px", color: "#666" }}>Solde actuel</p>
            <p style={{ margin: 0, fontSize: "28px", fontWeight: 900, color: bal >= 0 ? "#2ecc71" : "#e74c3c" }}>{fmt(bal)}</p>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>MONTANT ($)</label>
            <input type="number" value={montant} onChange={(e) => { setMontant(e.target.value); setErr(null); }} placeholder="0.00" style={{ ...inputStyle, textAlign: "center", fontSize: "22px" }} />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>NOTE</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : Avance" style={inputStyle} />
          </div>
          <div style={{ background: "#0d1117", borderRadius: "12px", padding: "10px 14px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🕐</span>
            <div>
              <p style={{ margin: 0, fontSize: "10px", color: "#555", fontWeight: 700, letterSpacing: "0.05em" }}>DATE & HEURE — AUTOMATIQUE</p>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888" }}>{formatDate(new Date().toISOString())}</p>
            </div>
          </div>
          {err && <p style={{ color: "#e74c3c", fontSize: "12px", margin: "0 0 12px" }}>{err}</p>}
          <button onClick={submit} disabled={busy} style={{ width: "100%", padding: "15px", background: busy ? "#1c3a2a" : "#2ecc71", color: busy ? "#5a8a6a" : "#000", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 900, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
            {busy ? "Traitement..." : "💰 Confirmer le Dépôt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL — AJOUTER / MODIFIER VENDEUR
// ══════════════════════════════════════════════════════════════════════════
function VendeurModal({ vendeur, colorIndex, busy, onClose, onConfirmAdd, onConfirmEdit }: {
  vendeur?: Vendeur; colorIndex: number; busy: boolean;
  onClose: () => void;
  onConfirmAdd: (nom: string) => Promise<void>;
  onConfirmEdit: (nom: string) => Promise<void>;
}) {
  const [nom, setNom] = useState(vendeur?.nom ?? "");
  const [err, setErr] = useState<string | null>(null);
  const couleur = vendeur?.couleur ?? COLORS[colorIndex % COLORS.length];

  const submit = async () => {
    if (!nom.trim()) { setErr("Le nom est requis."); return; }
    try {
      if (vendeur) await onConfirmEdit(nom.trim());
      else await onConfirmAdd(nom.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Une erreur est survenue.");
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1f2e", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", padding: "0 0 40px" }}>
        <div style={{ width: "40px", height: "4px", background: "#333", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#fff" }}>
              {vendeur ? "✏️ Modifier le Vendeur" : "➕ Nouveau Vendeur"}
            </p>
            <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#2a2f3e", border: "none", color: "#aaa", fontSize: "16px", cursor: "pointer" }}>×</button>
          </div>
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>NOM</label>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="César, Marie..." style={inputStyle} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: couleur }} />
            <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>Couleur assignée automatiquement</p>
          </div>
          {err && <p style={{ color: "#e74c3c", fontSize: "12px", margin: "0 0 12px" }}>{err}</p>}
          <button onClick={submit} disabled={busy} style={{ width: "100%", padding: "15px", background: busy ? "#1c3a2a" : "#2ecc71", color: busy ? "#5a8a6a" : "#000", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 900, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
            {busy ? "Enregistrement..." : vendeur ? "💾 Enregistrer les Modifications" : "➕ Créer le Vendeur"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CONFIRM DIALOG (générique)
// ══════════════════════════════════════════════════════════════════════════
function ConfirmDialog({ icon, message, confirmLabel, confirmColor, busy, onConfirm, onCancel }: {
  icon: string; message: string; confirmLabel: string; confirmColor: string; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1f2e", borderRadius: "20px", padding: "24px 20px", width: "100%", maxWidth: "320px", textAlign: "center" }}>
        <p style={{ fontSize: "36px", margin: "0 0 10px" }}>{icon}</p>
        <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#ccc" }}>{message}</p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px", borderRadius: "12px", background: "#2a2f3e", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", color: "#fff", fontFamily: "inherit" }}>Annuler</button>
          <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: "12px", borderRadius: "12px", background: confirmColor, color: "#fff", border: "none", fontSize: "13px", fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
            {busy ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL — SUPPRESSION IMPOSSIBLE
// ══════════════════════════════════════════════════════════════════════════
function DeleteBlockedModal({ nom, balance, onClose }: { nom: string; balance: number; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1f2e", borderRadius: "20px", padding: "24px 20px", width: "100%", maxWidth: "340px", textAlign: "center" }}>
        <p style={{ fontSize: "36px", margin: "0 0 10px" }}>🚫</p>
        <p style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 800, color: "#fff" }}>Suppression impossible</p>
        <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#999", lineHeight: 1.5 }}>
          Le solde de {nom} est de {fmt(balance)}. Un vendeur ne peut être supprimé que si son solde est à $0.00.
        </p>
        <button onClick={onClose} style={{ width: "100%", padding: "12px", borderRadius: "12px", background: "#2ecc71", color: "#000", border: "none", fontSize: "13px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          Compris
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SNACKBAR
// ══════════════════════════════════════════════════════════════════════════
function Snackbar({ msg, color }: { msg: string; color: string }) {
  return (
    <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: color, color: "#fff", padding: "10px 20px", borderRadius: 12, fontWeight: 600, zIndex: 9999, fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
      {msg}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// VENDEUR DETAIL VIEW
// ══════════════════════════════════════════════════════════════════════════
function VendeurDetail({ vendeur, can, onBack, onUpdate }: {
  vendeur: Vendeur;
  can: Permissions;
  onBack: () => void;
  onUpdate: (v: Vendeur) => void;
}) {
  const [showAddVente, setShowAddVente] = useState(false);
  const [showRetrait,  setShowRetrait]  = useState(false);
  const [showDepot,    setShowDepot]    = useState(false);
  const [confirmAnnuleVente,  setConfirmAnnuleVente]  = useState<string | null>(null);
  const [confirmRestoreVente, setConfirmRestoreVente] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ventes" | "historique">("ventes");
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; color: string } | null>(null);

  function notify(msg: string, color: string) {
    setSnack({ msg, color });
    setTimeout(() => setSnack(null), 2500);
  }

  const activeVentes = totalActives(vendeur);
  const totGrand = totalGrandTotal(vendeur);
  const totBen   = totalBenefis(vendeur);
  const totKom   = totalKomisyon(vendeur);
  const totRetr  = totalRetraits(vendeur);
  const bal      = vendeur.balance ?? 0;

  const sortedVentes = [...vendeur.ventes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const historiqueLignes = releveComplet(vendeur);

  async function doAjouterVente(data: Omit<Vente, "id" | "date" | "annule" | "annuleDate">) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await transactVendeur(vendeur.id, (current) => {
        const v: Vente = { ...data, id: `s_${Date.now()}`, date: new Date().toISOString() };
        const historique = [...(current.historique ?? []), {
          type: "vente" as const, date: v.date, montant: v.grandTotal, description: "Vente ajoutée",
          venteId: v.id, marque: v.marque, modele: v.modele, produitId: v.produitId, categorie: v.categorie, note: v.note,
        }];
        return { ...current, ventes: [...current.ventes, v], historique, balance: (current.balance ?? 0) + v.grandTotal };
      });
      onUpdate(updated);
      setShowAddVente(false);
      notify("✅ Vente ajoutée.", "#2ecc71");
    } finally { setBusy(false); }
  }

  async function doRetrait(montant: number, note: string) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await transactVendeur(vendeur.id, (current) => {
        const b = current.balance ?? 0;
        if (montant > b) throw new Error("Le montant dépasse le solde disponible.");
        const historique = [...(current.historique ?? []), {
          type: "retrait" as const, date: new Date().toISOString(), montant: -montant,
          description: "Retrait effectué", note: note || undefined,
        }];
        return { ...current, balance: b - montant, historique };
      });
      onUpdate(updated);
      setShowRetrait(false);
      notify(`✅ Retrait de ${fmt(montant)} effectué.`, "#2ecc71");
    } finally { setBusy(false); }
  }

  async function doDepot(montant: number, note: string) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await transactVendeur(vendeur.id, (current) => {
        const historique = [...(current.historique ?? []), {
          type: "depot" as const, date: new Date().toISOString(), montant: montant,
          description: "Dépôt effectué", note: note || undefined,
        }];
        return { ...current, balance: (current.balance ?? 0) + montant, historique };
      });
      onUpdate(updated);
      setShowDepot(false);
      notify(`✅ Dépôt de ${fmt(montant)} effectué.`, "#2ecc71");
    } finally { setBusy(false); }
  }

  async function doAnnulerVente(venteId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await transactVendeur(vendeur.id, (current) => {
        const idx = current.ventes.findIndex(v => v.id === venteId);
        if (idx === -1) throw new Error("Vente introuvable.");
        const vente = current.ventes[idx];
        if (vente.annule) throw new Error("Cette vente est déjà annulée.");
        const b = current.balance ?? 0;
        if (vente.grandTotal > b) throw new Error("Le solde actuel est inférieur au montant de cette vente.");
        const ventes = [...current.ventes];
        ventes[idx] = { ...vente, annule: true, annuleDate: new Date().toISOString() };
        const historique = [...(current.historique ?? []), {
          type: "annulation" as const, date: new Date().toISOString(), montant: -vente.grandTotal,
          description: "Vente annulée",
          venteId: vente.id, marque: vente.marque, modele: vente.modele, produitId: vente.produitId, categorie: vente.categorie,
        }];
        return { ...current, ventes, balance: b - vente.grandTotal, historique };
      });
      onUpdate(updated);
      notify("✅ Vente annulée.", "#f39c12");
    } catch (e) {
      notify("❌ " + (e instanceof Error ? e.message : "Erreur inconnue."), "#e74c3c");
    } finally {
      setBusy(false);
      setConfirmAnnuleVente(null);
    }
  }

  async function doRestaurerVente(venteId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await transactVendeur(vendeur.id, (current) => {
        const idx = current.ventes.findIndex(v => v.id === venteId);
        if (idx === -1) throw new Error("Vente introuvable.");
        const vente = current.ventes[idx];
        if (!vente.annule) throw new Error("Cette vente n'est pas annulée.");
        const ventes = [...current.ventes];
        ventes[idx] = { ...vente, annule: false, annuleDate: undefined };
        const historique = [...(current.historique ?? []), {
          type: "restauration" as const, date: new Date().toISOString(), montant: vente.grandTotal,
          description: "Vente restaurée",
          venteId: vente.id, marque: vente.marque, modele: vente.modele, produitId: vente.produitId, categorie: vente.categorie,
        }];
        return { ...current, ventes, balance: (current.balance ?? 0) + vente.grandTotal, historique };
      });
      onUpdate(updated);
      notify("✅ Vente restaurée.", "#2ecc71");
    } catch (e) {
      notify("❌ " + (e instanceof Error ? e.message : "Erreur inconnue."), "#e74c3c");
    } finally {
      setBusy(false);
      setConfirmRestoreVente(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "90px" }}>
      {showAddVente && <AddVenteModal busy={busy} onClose={() => setShowAddVente(false)} onConfirm={doAjouterVente} />}
      {showRetrait  && <RetraitModal vendeur={vendeur} busy={busy} onClose={() => setShowRetrait(false)} onConfirm={doRetrait} />}
      {showDepot    && <DepotModal vendeur={vendeur} busy={busy} onClose={() => setShowDepot(false)} onConfirm={doDepot} />}
      {confirmAnnuleVente && (
        <ConfirmDialog icon="🚫" message="Annuler cette vente ? Le montant sera retiré du solde." confirmLabel="Oui, annuler" confirmColor="#e67e22" busy={busy}
          onConfirm={() => doAnnulerVente(confirmAnnuleVente)} onCancel={() => setConfirmAnnuleVente(null)} />
      )}
      {confirmRestoreVente && (
        <ConfirmDialog icon="♻️" message="Restaurer cette vente ? Le montant sera rajouté au solde." confirmLabel="Oui, restaurer" confirmColor="#2ecc71" busy={busy}
          onConfirm={() => doRestaurerVente(confirmRestoreVente)} onCancel={() => setConfirmRestoreVente(null)} />
      )}
      {snack && <Snackbar msg={snack.msg} color={snack.color} />}

      <header style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "14px", borderBottom: "1px solid #1a1f2e" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#fff", fontSize: "22px", cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: vendeur.couleur, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: 900, color: "#000" }}>
            {vendeur.nom[0]?.toUpperCase()}
          </div>
          <p style={{ margin: 0, fontSize: "18px", fontWeight: 900 }}>{vendeur.nom}</p>
        </div>
      </header>

      <div style={{ padding: "14px 14px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
          {[
            { label: "Solde",            value: fmt(bal),      color: bal >= 0 ? "#2ecc71" : "#e74c3c", bg: "#0a2a1a" },
            { label: "Grand Total",      value: fmt(totGrand), color: "#3498db", bg: "#0a1a2a" },
            { label: "Total Bénéfices",  value: fmt(totBen),   color: "#f39c12", bg: "#2a1a0a" },
            { label: "Total Retraits",   value: fmt(totRetr),  color: "#e74c3c", bg: "#2a0a0a" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{ background: bg, borderRadius: "14px", padding: "14px 12px", border: `1px solid ${color}22` }}>
              <p style={{ margin: "0 0 4px", fontSize: "10px", color: "#666", fontWeight: 600 }}>{label}</p>
              <p style={{ margin: 0, fontSize: "18px", fontWeight: 900, color }}>{value}</p>
            </div>
          ))}
        </div>

        <div style={{ background: "#1a1f2e", borderRadius: "14px", padding: "12px 14px", marginBottom: "14px" }}>
          <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 700, color: "#555", letterSpacing: "0.06em" }}>COMMISSION PAR CATÉGORIE</p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {(Object.entries(CATEGORIES) as [CategorieKey, { label: string; komisyon: number }][]).map(([key, cat]) => (
              <span key={key} style={{ background: "#0d1117", color: "#3498db", padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>
                {cat.label} : ${cat.komisyon}
              </span>
            ))}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "10px", color: "#555" }}>
            Total commission : <strong style={{ color: "#2ecc71" }}>{fmt(totKom)}</strong>
            {totalDepots(vendeur) > 0 && <> &nbsp;•&nbsp; Total dépôts : <strong style={{ color: "#2979ff" }}>{fmt(totalDepots(vendeur))}</strong></>}
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
          {can.ajoute && (
            <button onClick={() => setShowAddVente(true)} disabled={busy} style={{ flex: 1, padding: "12px", background: "#2ecc71", color: "#000", border: "none", borderRadius: "12px", fontSize: "12px", fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
              ➕ Ajouter une Vente
            </button>
          )}
          {can.depot && (
            <button onClick={() => setShowDepot(true)} disabled={busy} style={{ flex: 1, padding: "12px", background: "#2979ff", color: "#fff", border: "none", borderRadius: "12px", fontSize: "12px", fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
              💰 Dépôt
            </button>
          )}
          {can.retrait && (
            <button onClick={() => setShowRetrait(true)} disabled={busy} style={{ flex: 1, padding: "12px", background: "#e74c3c", color: "#fff", border: "none", borderRadius: "12px", fontSize: "12px", fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
              💸 Retrait
            </button>
          )}
        </div>

        <div style={{ display: "flex", background: "#1a1f2e", borderRadius: "12px", padding: "4px", marginBottom: "12px" }}>
          {([
            { key: "ventes",     label: `Ventes (${vendeur.ventes.length})` },
            { key: "historique", label: `Historique (${historiqueLignes.length})` },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{ flex: 1, padding: "9px", borderRadius: "10px", background: activeTab === key ? "#2a3050" : "transparent", border: "none", color: activeTab === key ? "#fff" : "#555", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === "ventes" && (
          sortedVentes.length === 0
            ? <div style={{ textAlign: "center", padding: "40px 20px" }}><p style={{ fontSize: "36px", margin: "0 0 8px" }}>📭</p><p style={{ color: "#444", fontSize: "13px" }}>Aucune vente enregistrée.</p></div>
            : sortedVentes.map((vente) => {
                const cat = CATEGORIES[vente.categorie];
                const isAnnule = vente.annule === true;
                return (
                  <div key={vente.id} style={{ background: "#1a1f2e", borderRadius: "14px", padding: "12px 14px", marginBottom: "8px", borderLeft: `3px solid ${isAnnule ? "#555" : vendeur.couleur}`, opacity: isAnnule ? 0.65 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <p style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#fff" }}>{vente.marque} {vente.modele}</p>
                          {isAnnule && <span style={{ background: "#2a0a0a", color: "#e74c3c", padding: "2px 6px", borderRadius: "6px", fontSize: "9px", fontWeight: 700 }}>ANNULÉE</span>}
                        </div>
                        <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#555" }}>🔖 ID : {vente.produitId}</p>
                        <span style={{ display: "inline-block", background: "#1a2a3a", color: "#3498db", padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700, marginTop: "4px" }}>
                          {cat.label}
                        </span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ margin: 0, fontSize: "11px", color: "#555" }}>Achat : {fmt(vente.prixStore)}</p>
                        <p style={{ margin: "2px 0 0", fontSize: "13px", fontWeight: 700, color: "#fff" }}>Vente : {fmt(vente.prixVente)}</p>
                      </div>
                    </div>
                    <div style={{ background: "#0d1117", borderRadius: "10px", padding: "10px 12px", marginBottom: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "11px", color: "#666" }}>Bénéfice ({fmt(vente.prixVente)} − {fmt(vente.prixStore)})</span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#f39c12" }}>{fmt(vente.benefis)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ fontSize: "11px", color: "#666" }}>Commission ({cat.label})</span>
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
                      {!isAnnule && can.annule && (
                        <button onClick={() => setConfirmAnnuleVente(vente.id)} disabled={busy} style={{ padding: "6px 12px", background: "#2a1a0a", border: "none", borderRadius: "8px", color: busy ? "#666" : "#f39c12", fontSize: "11px", fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
                          🚫 Annuler
                        </button>
                      )}
                      {isAnnule && can.restore && (
                        <button onClick={() => setConfirmRestoreVente(vente.id)} disabled={busy} style={{ padding: "6px 12px", background: "#0a2a1a", border: "none", borderRadius: "8px", color: busy ? "#666" : "#2ecc71", fontSize: "11px", fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
                          ♻️ Restaurer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
        )}

        {activeTab === "historique" && (
          historiqueLignes.length === 0
            ? <div style={{ textAlign: "center", padding: "40px 20px" }}><p style={{ fontSize: "36px", margin: "0 0 8px" }}>📜</p><p style={{ color: "#444", fontSize: "13px" }}>Aucun mouvement enregistré.</p></div>
            : historiqueLignes.map((l, i) => {
                const isCredit = l.montant > 0;
                const isDebit  = l.montant < 0;
                const soldeAvant = l.soldeApres - l.montant;
                const phrase = phraseMouvement(l.type, l.montant, soldeAvant, l.soldeApres);
                return (
                  <div key={i} style={{ background: "#1a1f2e", borderRadius: "14px", padding: "12px 14px", marginBottom: "8px", borderLeft: `3px solid ${vendeur.couleur}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "18px" }}>{ICON_MAP[l.type] ?? "🧾"}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#fff" }}>{TITRE_MAP[l.type] ?? "Mouvement"}</p>
                        <p style={{ margin: 0, fontSize: "10px", color: "#555" }}>🕐 {formatDate(l.date)}</p>
                      </div>
                      <span style={{ fontSize: "14px", fontWeight: 800, color: isCredit ? "#2ecc71" : isDebit ? "#e74c3c" : "#888" }}>
                        {isCredit ? `+${fmt(l.montant)}` : isDebit ? `-${fmt(Math.abs(l.montant))}` : "—"}
                      </span>
                    </div>
                    <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#888", lineHeight: 1.4 }}>{phrase}</p>
                    {(l.marque || l.modele || l.produitId) && (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "6px" }}>
                        {(l.marque || l.modele) && <span style={badgeStyle("#aaa")}>{`${l.marque ?? ""} ${l.modele ?? ""}`.trim()}</span>}
                        {l.produitId && <span style={badgeStyle("#555")}>ID : {l.produitId}</span>}
                        {l.categorie && <span style={badgeStyle("#3498db")}>{CATEGORIES[l.categorie as CategorieKey]?.label ?? l.categorie}</span>}
                      </div>
                    )}
                    {l.note && <p style={{ margin: "0 0 6px", fontSize: "10px", color: "#555", fontStyle: "italic" }}>"{l.note}"</p>}
                    <div style={{ textAlign: "right" }}>
                      <span style={badgeStyle(vendeur.couleur)}>Solde après : {fmt(l.soldeApres)}</span>
                    </div>
                  </div>
                );
              })
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

  const [can, setCan] = useState<Permissions>({
    voir: false, ajoute: false, modifye: false, siprime: false,
    retrait: false, depot: false, annule: false, restore: false,
  });

  const [vendeurs,      setVendeurs]      = useState<Vendeur[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState<"dashboard" | "vendeurs">("dashboard");
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [showVdrModal,  setShowVdrModal]  = useState(false);
  const [busyVdr,       setBusyVdr]       = useState(false);
  const [editingVdr,    setEditingVdr]    = useState<Vendeur | undefined>(undefined);
  const [confirmDelVdr, setConfirmDelVdr] = useState<Vendeur | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<Vendeur | null>(null);
  const [busyIds,       setBusyIds]       = useState<Set<string>>(new Set());
  const [snack,         setSnack]         = useState<{ msg: string; color: string } | null>(null);

  function notify(msg: string, color: string) {
    setSnack({ msg, color });
    setTimeout(() => setSnack(null), 2500);
  }

  useEffect(() => {
  const auth = getAuth();
  const unsub = onAuthStateChanged(auth, async (user) => {
    if (!user) { setLoading(false); return; }
    try {
      const snap = await getDoc(SITE_REF());
      if (snap.exists() && Array.isArray(snap.data()?.vendeurs)) {
        setVendeurs((snap.data()!.vendeurs as any[]).map(normalizeVendeur));
      }

      // ── AVAN: doc(db, "sitelogin", "loginsite") + usersObj[user.uid] ──
      // ── KOUNYE A: dokiman itilizatè a dirèkteman nan siteUsers/{uid} ──
      const userSnap = await getDoc(doc(db, "siteUsers", user.uid));
      if (userSnap.exists()) {
        const p = userSnap.data()?.permissions?.vendeurs ?? {};
        setCan({
          voir:    p.voir    ?? false,
          ajoute:  p.ajoute  ?? false,
          modifye: p.modifye ?? false,
          siprime: p.siprime ?? false,
          retrait: p.retrait ?? false,
          depot:   p.depot   ?? false,
          annule:  p.annule  ?? false,
          restore: p.restore ?? false,
        });
      }
    } catch (err) {
      console.error("Erreur de chargement :", err);
    } finally {
      setLoading(false);
    }
  });
  return () => unsub();
}, []);



  async function handleAjouterVendeur(nom: string) {
    if (busyVdr) return;
    setBusyVdr(true);
    try {
      const v = await ajouterVendeurAtomic(nom, vendeurs.length);
      setVendeurs(prev => [...prev, v]);
      setShowVdrModal(false);
      notify("✅ Vendeur ajouté.", "#2ecc71");
    } finally { setBusyVdr(false); }
  }

  async function handleModifierVendeur(vendeurId: string, nom: string) {
    if (busyVdr) return;
    setBusyVdr(true);
    try {
      const updated = await transactVendeur(vendeurId, (current) => ({ ...current, nom }));
      setVendeurs(prev => prev.map(v => v.id === vendeurId ? updated : v));
      setShowVdrModal(false);
      setEditingVdr(undefined);
      notify("✅ Vendeur modifié.", "#2ecc71");
    } finally { setBusyVdr(false); }
  }

  async function handleDeleteVendeur(v: Vendeur) {
    if (busyIds.has(v.id)) return;
    setBusyIds(prev => new Set(prev).add(v.id));
    try {
      await deleteVendeurAtomic(v.id);
      setVendeurs(prev => prev.filter(x => x.id !== v.id));
      setConfirmDelVdr(null);
      notify("✅ Vendeur supprimé.", "#2ecc71");
    } catch (e) {
      if (e instanceof Error && e.message === "BALANCE_NON_NULLE") {
        setConfirmDelVdr(null);
        setDeleteBlocked(v);
      } else {
        notify("❌ " + (e instanceof Error ? e.message : "Erreur inconnue."), "#e74c3c");
      }
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(v.id); return n; });
    }
  }

  function handleUpdateFromDetail(updated: Vendeur) {
    setVendeurs(prev => prev.map(v => v.id === updated.id ? updated : v));
  }

  const selectedVendeur = vendeurs.find((v) => v.id === selectedId) ?? null;

  if (selectedVendeur) {
    return (
      <VendeurDetail
        vendeur={selectedVendeur}
        can={can}
        onBack={() => setSelectedId(null)}
        onUpdate={handleUpdateFromDetail}
      />
    );
  }

  const sorted   = [...vendeurs].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
  const totalG   = vendeurs.reduce((s, v) => s + (v.balance ?? 0), 0);
  const maxGrand = Math.max(...vendeurs.map(totalGrandTotal), 1);

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "80px" }}>

      {showVdrModal && (
        <VendeurModal
          vendeur={editingVdr}
          colorIndex={vendeurs.length}
          busy={busyVdr}
          onClose={() => { setShowVdrModal(false); setEditingVdr(undefined); }}
          onConfirmAdd={handleAjouterVendeur}
          onConfirmEdit={(nom) => handleModifierVendeur(editingVdr!.id, nom)}
        />
      )}
      {confirmDelVdr && (
        <ConfirmDialog icon="🗑️" message={`Supprimer ${confirmDelVdr.nom} ? Cette action est irréversible.`} confirmLabel="Oui, supprimer" confirmColor="#e74c3c" busy={busyIds.has(confirmDelVdr.id)}
          onConfirm={() => handleDeleteVendeur(confirmDelVdr)} onCancel={() => setConfirmDelVdr(null)} />
      )}
      {deleteBlocked && (
        <DeleteBlockedModal nom={deleteBlocked.nom} balance={deleteBlocked.balance ?? 0} onClose={() => setDeleteBlocked(null)} />
      )}
      {snack && <Snackbar msg={snack.msg} color={snack.color} />}

      <header style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1f2e" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "#fff", fontSize: "22px", cursor: "pointer", padding: 0 }}>←</button>
          <p style={{ margin: 0, fontSize: "20px", fontWeight: 900 }}>Vendeurs</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {can.ajoute && (
            <button onClick={() => { setEditingVdr(undefined); setShowVdrModal(true); }} style={{ background: "#2ecc71", color: "#000", border: "none", borderRadius: "10px", padding: "8px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              ➕ Ajouter
            </button>
          )}
        </div>
      </header>

      <div style={{ display: "flex", borderBottom: "1px solid #1a1f2e" }}>
        {([{ key: "dashboard", label: "TABLEAU DE BORD" }, { key: "vendeurs", label: "VENDEURS" }] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ flex: 1, padding: "14px", border: "none", background: "none", color: activeTab === key ? "#2ecc71" : "#444", fontSize: "13px", fontWeight: 800, letterSpacing: "0.06em", borderBottom: activeTab === key ? "2.5px solid #2ecc71" : "2.5px solid transparent", cursor: "pointer", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px" }}>
          <p style={{ color: "#444" }}>Chargement...</p>
        </div>
      ) : (
        <div style={{ padding: "14px" }}>

          {activeTab === "dashboard" && (
            <>
              <div style={{ background: "#2ecc71", borderRadius: "20px", padding: "20px", marginBottom: "20px", position: "relative", overflow: "hidden" }}>
                <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 800, color: "rgba(0,0,0,0.5)", letterSpacing: "0.08em" }}>TOTAL GLOBAL À PAYER</p>
                <p style={{ margin: "0 0 6px", fontSize: "36px", fontWeight: 900, color: "#000", lineHeight: 1 }}>{fmt(totalG)}</p>
                <p style={{ margin: 0, fontSize: "13px", color: "rgba(0,0,0,0.5)" }}>{vendeurs.length} vendeur{vendeurs.length > 1 ? "s" : ""}</p>
                <div style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", width: "56px", height: "56px", borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>💰</div>
              </div>

              <p style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 800, color: "#fff" }}>Solde par Vendeur</p>
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

              <p style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 800, color: "#fff" }}>Classement des Vendeurs</p>
              {sorted.map((v, idx) => {
                const bal = v.balance ?? 0;
                return (
                  <div key={v.id} onClick={() => setSelectedId(v.id)} style={{ background: "#1a1f2e", borderRadius: "16px", padding: "14px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", border: `1px solid ${v.couleur}22` }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: v.couleur, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 900, color: "#000", flexShrink: 0 }}>{idx + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#fff" }}>{v.nom}</p>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#555" }}>{totalActives(v).length} vente(s) · Total : {fmt(totalGrandTotal(v))}</p>
                    </div>
                    <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: bal >= 0 ? v.couleur : "#e74c3c", flexShrink: 0 }}>{fmt(bal)}</p>
                  </div>
                );
              })}
            </>
          )}

          {activeTab === "vendeurs" && (
            vendeurs.length === 0
              ? <div style={{ textAlign: "center", padding: "60px 20px" }}><p style={{ fontSize: "40px", margin: "0 0 10px" }}>👥</p><p style={{ color: "#444", fontSize: "14px" }}>Aucun vendeur enregistré.</p></div>
              : vendeurs.map((v) => {
                  const bal = v.balance ?? 0;
                  return (
                    <div key={v.id} style={{ background: "#1a1f2e", borderRadius: "16px", padding: "14px", marginBottom: "10px", borderLeft: `4px solid ${v.couleur}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px", cursor: "pointer" }} onClick={() => setSelectedId(v.id)}>
                        <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: v.couleur, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: 900, color: "#000", flexShrink: 0 }}>{v.nom[0]?.toUpperCase()}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <p style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#fff" }}>{v.nom}</p>
                            <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: bal >= 0 ? "#2ecc71" : "#e74c3c" }}>{fmt(bal)}</p>
                          </div>
                          <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                            <p style={{ margin: 0, fontSize: "10px", color: "#555" }}>📦 {totalActives(v).length} vente(s)</p>
                            <p style={{ margin: 0, fontSize: "10px", color: "#555" }}>💸 {fmt(totalRetraits(v))} retiré</p>
                          </div>
                        </div>
                      </div>
                      {(can.voir || can.modifye || can.siprime) && (
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => setSelectedId(v.id)} style={{ flex: 1, padding: "8px", background: "#2a3050", border: "none", borderRadius: "10px", color: "#aaa", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>👁️ Détail</button>
                          {can.modifye && (
                            <button onClick={() => {
  if ((v.balance ?? 0) !== 0) {
    notify(`❌ ${v.nom} gen yon balans de ${fmt(v.balance ?? 0)}. Modifye pa posib toutotan balans lan pa $0.00.`, "#e74c3c");
    return;
  }
  setEditingVdr(v);
  setShowVdrModal(true);
}} style={{ flex: 1, padding: "8px", background: "#1a2a3a", border: "none", borderRadius: "10px", color: "#3498db", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✏️ Modifier</button>
                          )}
                          {can.siprime && (
                            <button onClick={() => setConfirmDelVdr(v)} disabled={busyIds.has(v.id)} style={{ padding: "8px 12px", background: "#2a0a0a", border: "none", borderRadius: "10px", color: busyIds.has(v.id) ? "#666" : "#e74c3c", fontSize: "11px", fontWeight: 700, cursor: busyIds.has(v.id) ? "default" : "pointer", fontFamily: "inherit" }}>🗑️</button>
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
          { icon: "🏠", label: "Boutique",       action: () => router.push("/"),          color: "#444"    },
          { icon: "⚡", label: "Tableau de bord", action: () => router.push("/dashboard"), color: "#e63946" },
          { icon: "🪪", label: "Vendeurs",        action: () => {},                        color: "#2ecc71" },
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
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════
type QuickAction = "filter_keyword" | "show_categories" | "filter_favorites" | "show_info" | "url" | "whatsapp" | "phone";

interface QuickButton {
  id: string;
  emoji: string;
  label: string;
  action: QuickAction;
  keyword?: string;
  infoKey?: string;
  infoText?: string;
  url?: string;
  phone?: string;
  order: number;
}

interface PaymentMethod {
  id: string;
  active: boolean;
  nom: string;
  subtitle: string;
  emoji: string;
  bgColor: string;
  initial: string;
  numero?: string;
  nomCompte?: string;
  instructions?: string;
}

interface AdminAccount {
  id: string;
  nom: string;
  username: string;
  role: "admin" | "staff" | "vendeur";
  actif: boolean;
}

interface SiteConfig {
  // Infos boutique
  nomBoutique: string;
  slogan: string;
  logoUrl: string;
  telephone1: string;
  telephone2: string;
  email: string;
  adresse: string;
  heures: string;
  whatsapp: string;
  // Textes info
  livraisonText: string;
  garantieText: string;
  // QuickButtons
  quickButtons: QuickButton[];
  // Bannière
  banniereActive: boolean;
  banniereTexte: string;
  banniereCouleur: string;
  // Paiement
  paymentMethods: PaymentMethod[];
  // Comptes
  adminAccounts: AdminAccount[];
}

const DEFAULT_PAYMENTS: PaymentMethod[] = [
  {
    id: "moncash", active: true, nom: "MonCash", subtitle: "Payer avec MonCash",
    emoji: "M", bgColor: "#e63946", initial: "M",
    numero: "+509 38332483", nomCompte: "MillionStore",
    instructions: "1) Ouvrez MonCash\n2) Envoyez le montant au numéro indiqué\n3) Revenez confirmer",
  },
  {
    id: "natcash", active: true, nom: "NatCash", subtitle: "Payer avec NatCash",
    emoji: "N", bgColor: "#1a3a8f", initial: "N",
    numero: "+509 35012813", nomCompte: "MillionStore",
    instructions: "1) Ouvrez NatCash\n2) Envoyez le montant au numéro indiqué\n3) Revenez confirmer",
  },
  {
    id: "banque", active: true, nom: "Virement Bancaire", subtitle: "BNC, Sogebank, BUH, UNIBANK",
    emoji: "🏦", bgColor: "#2d6a4f", initial: "🏦",
    numero: "123-456-789", nomCompte: "MillionStore Haiti SA",
    instructions: "1) Allez à votre banque\n2) Effectuez le virement\n3) Gardez votre reçu\n4) Revenez confirmer",
  },
];

const DEFAULT_CONFIG: SiteConfig = {
  nomBoutique: "MillionStore",
  slogan: "Votre boutique tech en Haïti",
  logoUrl: "https://i.ibb.co/gLmkySCv/ab785ed1481b.jpg",
  telephone1: "+509 38332483",
  telephone2: "+509 35012813",
  email: "millionstorehaiti@gmail.com",
  adresse: "Delmas 83, à proximité du BUH, Port-au-Prince, Haïti.",
  heures: "Lendi - Dimanche: 8h am - 5h pm",
  whatsapp: "50938332483",
  livraisonText: "Livraison disponible à Port-au-Prince.\nDélai: 24-48h après confirmation du paiement.\nFrais: $5 (gratuit pour commande +$300).",
  garantieText: "Garantie 3 mois sur tous nos produits.\nÉchange ou remboursement si problème.\nContactez-nous sur WhatsApp pour toute réclamation.",
  quickButtons: [
    { id: "tout",       emoji: "🛍️", label: "Tout",       action: "filter_keyword",  keyword: "",          order: 0 },
    { id: "categories", emoji: "🗂️", label: "Catégories", action: "show_categories",                       order: 1 },
    { id: "special",    emoji: "⭐",  label: "Spécial",    action: "filter_keyword",  keyword: "special",   order: 2 },
    { id: "favoris",    emoji: "🤍",  label: "Favoris",    action: "filter_favorites",                      order: 3 },
    { id: "livraison",  emoji: "🚚",  label: "Livraison",  action: "show_info",       infoKey: "livraison", order: 4 },
    { id: "garantie",   emoji: "🛡️",  label: "Garantie",   action: "show_info",       infoKey: "garantie",  order: 5 },
  ],
  banniereActive: false,
  banniereTexte: "🔥 Promo spéciale ce weekend!",
  banniereCouleur: "#e63946",
  paymentMethods: DEFAULT_PAYMENTS,
  adminAccounts: [
    { id: "acc1", nom: "Jean Admin", username: "admin", role: "admin", actif: true },
  ],
};

const ACTION_LABELS: Record<QuickAction, string> = {
  filter_keyword:   "🔍 Filtrer mot-clé",
  show_categories:  "🗂️ Catégories",
  filter_favorites: "🤍 Favoris",
  show_info:        "📄 Texte info",
  url:              "🔗 Lien URL",
  whatsapp:         "💬 WhatsApp",
  phone:            "📞 Téléphone",
};

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:   { bg: "#fce8e8", color: "#e63946" },
  staff:   { bg: "#e8f4fd", color: "#1a6fa8" },
  vendeur: { bg: "#e8fdf0", color: "#1a9e6e" },
};

// ══════════════════════════════════════════════════════════════════════════
// REUSABLE COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

function Section({ title, emoji, children, defaultOpen = true }: {
  title: string; emoji: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "#fff", borderRadius: "16px", marginBottom: "12px", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", padding: "14px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
        borderBottom: open ? "1px solid #f5f5f5" : "none",
      }}>
        <span style={{ fontSize: "14px", fontWeight: 800, color: "#1a1a2e" }}>{emoji} {title}</span>
        <span style={{ fontSize: "12px", color: "#aaa" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding: "14px 16px" }}>{children}</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", multiline = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; multiline?: boolean;
}) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>{label}</p>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3}
          style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e8e8e8", borderRadius: "12px", fontSize: "13px", outline: "none", fontFamily: "inherit", color: "#333", resize: "vertical", boxSizing: "border-box" }} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e8e8e8", borderRadius: "12px", fontSize: "13px", outline: "none", fontFamily: "inherit", color: "#333", boxSizing: "border-box" }} />
      )}
    </div>
  );
}

// ── QuickButton Editor ─────────────────────────────────────────────────────
function QuickButtonEditor({ btn, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  btn: QuickButton; onUpdate: (b: QuickButton) => void; onDelete: () => void;
  onMoveUp: () => void; onMoveDown: () => void; isFirst: boolean; isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: "#f8f9fa", borderRadius: "14px", marginBottom: "8px", overflow: "hidden", border: "1.5px solid #eee" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <button onClick={onMoveUp} disabled={isFirst} style={{ width: "24px", height: "24px", borderRadius: "6px", background: isFirst ? "#f0f0f0" : "#1a1a2e", color: isFirst ? "#ccc" : "#fff", border: "none", cursor: isFirst ? "not-allowed" : "pointer", fontSize: "10px" }}>▲</button>
          <button onClick={onMoveDown} disabled={isLast} style={{ width: "24px", height: "24px", borderRadius: "6px", background: isLast ? "#f0f0f0" : "#1a1a2e", color: isLast ? "#ccc" : "#fff", border: "none", cursor: isLast ? "not-allowed" : "pointer", fontSize: "10px" }}>▼</button>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          <span style={{ width: "34px", height: "34px", borderRadius: "9px", background: "#fff", border: "1.5px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", flexShrink: 0 }}>{btn.emoji}</span>
          <div>
            <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>{btn.label}</p>
            <p style={{ margin: 0, fontSize: "10px", color: "#aaa" }}>{ACTION_LABELS[btn.action]}</p>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#aaa" }}>{expanded ? "▲" : "▼"}</button>
        <button onClick={onDelete} style={{ background: "#fff0f0", border: "none", borderRadius: "8px", width: "30px", height: "30px", cursor: "pointer", fontSize: "13px", color: "#e63946", display: "flex", alignItems: "center", justifyContent: "center" }}>🗑️</button>
      </div>
      {expanded && (
        <div style={{ padding: "0 12px 12px", borderTop: "1px solid #eee" }}>
          <div style={{ display: "flex", gap: "8px", marginTop: "10px", marginBottom: "10px" }}>
            <div style={{ flex: "0 0 68px" }}>
              <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 700, color: "#888" }}>EMOJI</p>
              <input value={btn.emoji} onChange={(e) => onUpdate({ ...btn, emoji: e.target.value })}
                style={{ width: "100%", padding: "8px", textAlign: "center", border: "1.5px solid #e8e8e8", borderRadius: "10px", fontSize: "17px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 700, color: "#888" }}>LABEL</p>
              <input value={btn.label} onChange={(e) => onUpdate({ ...btn, label: e.target.value })} placeholder="Nom du bouton"
                style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e8e8e8", borderRadius: "10px", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>
          <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "#888" }}>ACTION</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "10px" }}>
            {(Object.entries(ACTION_LABELS) as [QuickAction, string][]).map(([key, label]) => (
              <button key={key} onClick={() => onUpdate({ ...btn, action: key })} style={{
                padding: "5px 9px", borderRadius: "8px",
                border: `1.5px solid ${btn.action === key ? "#1a1a2e" : "#e0e0e0"}`,
                background: btn.action === key ? "#1a1a2e" : "#fff",
                color: btn.action === key ? "#fff" : "#555",
                fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>{label}</button>
            ))}
          </div>
          {btn.action === "filter_keyword" && <Field label="MOT-CLÉ" value={btn.keyword ?? ""} onChange={(v) => onUpdate({ ...btn, keyword: v })} placeholder="special, promo..." />}
          {btn.action === "show_info" && (
            <>
              <Field label="CLÉ (livraison / garantie)" value={btn.infoKey ?? ""} onChange={(v) => onUpdate({ ...btn, infoKey: v })} placeholder="livraison" />
              <Field label="TEXTE DIRECT (optionnel)" value={btn.infoText ?? ""} onChange={(v) => onUpdate({ ...btn, infoText: v })} multiline />
            </>
          )}
          {btn.action === "url" && <Field label="URL" value={btn.url ?? ""} onChange={(v) => onUpdate({ ...btn, url: v })} placeholder="https://..." />}
          {(btn.action === "whatsapp" || btn.action === "phone") && <Field label="NUMÉRO" value={btn.phone ?? ""} onChange={(v) => onUpdate({ ...btn, phone: v })} placeholder="50938332483" />}
        </div>
      )}
    </div>
  );
}

// ── Payment Method Editor ──────────────────────────────────────────────────
function PaymentEditor({ method, onUpdate, onDelete }: {
  method: PaymentMethod; onUpdate: (m: PaymentMethod) => void; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: "#f8f9fa", borderRadius: "14px", marginBottom: "8px", border: "1.5px solid #eee", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: method.bgColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: 900, color: "#fff", flexShrink: 0 }}>
          {method.initial}
        </div>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>{method.nom}</p>
          <p style={{ margin: 0, fontSize: "10px", color: "#aaa" }}>{method.numero || "Aucun numéro"}</p>
        </div>
        {/* Toggle actif */}
        <button onClick={() => onUpdate({ ...method, active: !method.active })} style={{
          width: "42px", height: "22px", borderRadius: "999px",
          background: method.active ? "#1a9e6e" : "#ddd",
          border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
        }}>
          <div style={{ position: "absolute", top: "3px", left: method.active ? "21px" : "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s" }} />
        </button>
        <button onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#aaa" }}>{expanded ? "▲" : "▼"}</button>
        <button onClick={onDelete} style={{ background: "#fff0f0", border: "none", borderRadius: "8px", width: "28px", height: "28px", cursor: "pointer", fontSize: "13px", color: "#e63946", display: "flex", alignItems: "center", justifyContent: "center" }}>🗑️</button>
      </div>
      {expanded && (
        <div style={{ padding: "0 12px 12px", borderTop: "1px solid #eee" }}>
          <div style={{ marginTop: "10px" }}>
            <Field label="NOM" value={method.nom} onChange={(v) => onUpdate({ ...method, nom: v })} />
            <Field label="SOUS-TITRE" value={method.subtitle} onChange={(v) => onUpdate({ ...method, subtitle: v })} placeholder="Payer avec..." />
            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ flex: "0 0 68px" }}>
                <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 700, color: "#888" }}>ICÔNE</p>
                <input value={method.initial} onChange={(e) => onUpdate({ ...method, initial: e.target.value })}
                  style={{ width: "100%", padding: "8px", textAlign: "center", border: "1.5px solid #e8e8e8", borderRadius: "10px", fontSize: "16px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 700, color: "#888" }}>COULEUR</p>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {["#e63946", "#1a3a8f", "#2d6a4f", "#f79f1f", "#7c3aed", "#1a1a2e"].map((c) => (
                    <button key={c} onClick={() => onUpdate({ ...method, bgColor: c })} style={{
                      width: "28px", height: "28px", borderRadius: "50%", background: c, border: method.bgColor === c ? "2.5px solid #111" : "2.5px solid transparent", cursor: "pointer",
                    }} />
                  ))}
                  <input type="color" value={method.bgColor} onChange={(e) => onUpdate({ ...method, bgColor: e.target.value })}
                    style={{ width: "28px", height: "28px", borderRadius: "50%", border: "none", cursor: "pointer", padding: 0 }} />
                </div>
              </div>
            </div>
            <Field label="NUMÉRO / COMPTE" value={method.numero ?? ""} onChange={(v) => onUpdate({ ...method, numero: v })} placeholder="+509 3833 2483" />
            <Field label="NOM DU COMPTE" value={method.nomCompte ?? ""} onChange={(v) => onUpdate({ ...method, nomCompte: v })} placeholder="MillionStore" />
            <Field label="INSTRUCTIONS" value={method.instructions ?? ""} onChange={(v) => onUpdate({ ...method, instructions: v })} multiline placeholder="1) Ouvrez l'app..." />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Account Editor ───────────────────────────────────────────────────
function AccountEditor({ account, onUpdate, onDelete, isOnlyAdmin }: {
  account: AdminAccount; onUpdate: (a: AdminAccount) => void; onDelete: () => void; isOnlyAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newPass, setNewPass]   = useState("");
  const rc = ROLE_COLORS[account.role];

  return (
    <div style={{ background: "#f8f9fa", borderRadius: "14px", marginBottom: "8px", border: "1.5px solid #eee", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: rc.bg, border: `2px solid ${rc.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>
          {account.role === "admin" ? "👑" : account.role === "staff" ? "👤" : "🪪"}
        </div>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>{account.nom}</p>
          <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
            <span style={{ background: rc.bg, color: rc.color, padding: "1px 7px", borderRadius: "999px", fontSize: "10px", fontWeight: 700 }}>{account.role}</span>
            <span style={{ fontSize: "10px", color: account.actif ? "#1a9e6e" : "#aaa" }}>{account.actif ? "🟢 Actif" : "⚫ Inactif"}</span>
          </div>
        </div>
        <button onClick={() => onUpdate({ ...account, actif: !account.actif })} style={{
          width: "42px", height: "22px", borderRadius: "999px",
          background: account.actif ? "#1a9e6e" : "#ddd",
          border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
        }}>
          <div style={{ position: "absolute", top: "3px", left: account.actif ? "21px" : "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
        </button>
        <button onClick={() => setExpanded(!expanded)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#aaa" }}>{expanded ? "▲" : "▼"}</button>
        {!isOnlyAdmin && (
          <button onClick={onDelete} style={{ background: "#fff0f0", border: "none", borderRadius: "8px", width: "28px", height: "28px", cursor: "pointer", fontSize: "13px", color: "#e63946", display: "flex", alignItems: "center", justifyContent: "center" }}>🗑️</button>
        )}
      </div>
      {expanded && (
        <div style={{ padding: "0 12px 12px", borderTop: "1px solid #eee", marginTop: "0" }}>
          <div style={{ marginTop: "10px" }}>
            <Field label="NOM COMPLET" value={account.nom} onChange={(v) => onUpdate({ ...account, nom: v })} />
            <Field label="NOM D'UTILISATEUR" value={account.username} onChange={(v) => onUpdate({ ...account, username: v })} />
            <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "#888" }}>RÔLE</p>
            <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
              {(["admin", "staff", "vendeur"] as const).map((r) => {
                const c = ROLE_COLORS[r];
                return (
                  <button key={r} onClick={() => onUpdate({ ...account, role: r })} style={{
                    flex: 1, padding: "8px", borderRadius: "10px",
                    border: `1.5px solid ${account.role === r ? c.color : "#e0e0e0"}`,
                    background: account.role === r ? c.bg : "#fff",
                    color: account.role === r ? c.color : "#aaa",
                    fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}>{r === "admin" ? "👑 Admin" : r === "staff" ? "👤 Staff" : "🪪 Vendeur"}</button>
                );
              })}
            </div>
            <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "#888" }}>NOUVEAU MOT DE PASSE</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Laisser vide = pas de changement"
                style={{ flex: 1, padding: "9px 12px", border: "1.5px solid #e8e8e8", borderRadius: "10px", fontSize: "12px", outline: "none", fontFamily: "inherit" }} />
              {newPass && (
                <button onClick={() => { onUpdate({ ...account }); setNewPass(""); }} style={{
                  padding: "9px 12px", background: "#1a1a2e", color: "#fff",
                  border: "none", borderRadius: "10px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>💾</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ══════════════════════════════════════════════════════════════════════════
export default function ModifierSitePage() {
  const router = useRouter();
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [activeTab, setActiveTab] = useState<"infos" | "boutons" | "textes" | "paiement" | "comptes" | "banniere">("infos");

  // ── Firestore: collection website / doc siteweb ──────────────────────
  const SITE_REF = doc(db, "website", "siteweb");

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(SITE_REF);
        if (snap.exists()) setConfig({ ...DEFAULT_CONFIG, ...snap.data() as SiteConfig });
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(SITE_REF, config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { alert("Erreur lors de la sauvegarde."); }
    setSaving(false);
  };

  const upd = (key: keyof SiteConfig, value: any) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  // ── QuickButtons ─────────────────────────────────────────────────────
  const updateBtn   = (idx: number, btn: QuickButton) => { const b = [...config.quickButtons]; b[idx] = btn; upd("quickButtons", b); };
  const deleteBtn   = (idx: number) => upd("quickButtons", config.quickButtons.filter((_, i) => i !== idx).map((b, i) => ({ ...b, order: i })));
  const moveBtn     = (idx: number, dir: -1 | 1) => {
    const b = [...config.quickButtons]; const t = idx + dir;
    if (t < 0 || t >= b.length) return;
    [b[idx], b[t]] = [b[t], b[idx]];
    upd("quickButtons", b.map((x, i) => ({ ...x, order: i })));
  };
  const addBtn = () => upd("quickButtons", [...config.quickButtons, { id: `btn_${Date.now()}`, emoji: "✨", label: "Nouveau", action: "filter_keyword" as QuickAction, keyword: "", order: config.quickButtons.length }]);

  // ── Payment methods ──────────────────────────────────────────────────
  const updatePay = (idx: number, m: PaymentMethod) => { const p = [...config.paymentMethods]; p[idx] = m; upd("paymentMethods", p); };
  const deletePay = (idx: number) => upd("paymentMethods", config.paymentMethods.filter((_, i) => i !== idx));
  const addPay = () => upd("paymentMethods", [...config.paymentMethods, {
    id: `pay_${Date.now()}`, active: true, nom: "Nouveau", subtitle: "Payer avec...",
    emoji: "💳", bgColor: "#888", initial: "P", numero: "", nomCompte: "", instructions: "",
  }]);

  // ── Admin accounts ───────────────────────────────────────────────────
  const updateAcc = (idx: number, a: AdminAccount) => { const acc = [...config.adminAccounts]; acc[idx] = a; upd("adminAccounts", acc); };
  const deleteAcc = (idx: number) => upd("adminAccounts", config.adminAccounts.filter((_, i) => i !== idx));
  const addAcc = () => upd("adminAccounts", [...config.adminAccounts, {
    id: `acc_${Date.now()}`, nom: "Nouveau", username: "", role: "staff" as const, actif: true,
  }]);

  const adminCount = config.adminAccounts.filter((a) => a.role === "admin").length;

  const TABS = [
    { key: "infos",    emoji: "🏪", label: "Infos"    },
    { key: "boutons",  emoji: "🔘", label: "Boutons"  },
    { key: "textes",   emoji: "📄", label: "Textes"   },
    { key: "paiement", emoji: "💳", label: "Paiement" },
    { key: "comptes",  emoji: "👥", label: "Comptes"  },
    { key: "banniere", emoji: "📢", label: "Bannière" },
  ] as const;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#f5f6fa", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#888", fontSize: "14px" }}>Chargement...</p>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6fa", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "90px" }}>

      {/* Header */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #eee", padding: "10px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 1px 6px rgba(0,0,0,0.06)", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.back()} style={{ background: "#f0f0f0", border: "none", borderRadius: "8px", width: "34px", height: "34px", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
          <div>
            <p style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#1a1a2e", lineHeight: 1 }}>🖥️ Modifier le Site</p>
            <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#888" }}>website / siteweb</p>
          </div>
        </div>
        <button onClick={save} disabled={saving} style={{
          background: saved ? "#1a9e6e" : "#1a1a2e", color: "#fff", border: "none",
          borderRadius: "10px", padding: "8px 14px", fontSize: "12px", fontWeight: 700,
          cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.2s",
        }}>
          {saving ? "⏳..." : saved ? "✅ Sauvegardé!" : "💾 Sauvegarder"}
        </button>
      </header>

      {/* Tabs */}
      <div style={{
        display: "flex", background: "#fff", borderBottom: "1px solid #eee",
        position: "sticky", top: "57px", zIndex: 99,
        overflowX: "auto", scrollbarWidth: "none",
      }}>
        {TABS.map(({ key, emoji, label }) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: "11px 12px", border: "none", background: "none",
            cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            fontSize: "12px", fontWeight: 700,
            color: activeTab === key ? "#1a1a2e" : "#aaa",
            borderBottom: activeTab === key ? "2.5px solid #1a1a2e" : "2.5px solid transparent",
          }}>
            {emoji} {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "12px" }}>

        {/* ── INFOS ───────────────────────────────────────────────────── */}
        {activeTab === "infos" && (
          <>
            <Section title="Identité" emoji="🏪">
              <Field label="NOM DE LA BOUTIQUE" value={config.nomBoutique} onChange={(v) => upd("nomBoutique", v)} />
              <Field label="SLOGAN" value={config.slogan} onChange={(v) => upd("slogan", v)} />
              <Field label="URL DU LOGO" value={config.logoUrl} onChange={(v) => upd("logoUrl", v)} placeholder="https://..." />
              {config.logoUrl && <img src={config.logoUrl} alt="Logo" style={{ width: "56px", height: "56px", objectFit: "contain", borderRadius: "10px", background: "#f0f0f0", marginTop: "4px" }} />}
            </Section>
            <Section title="Contact & Localisation" emoji="📍">
              <Field label="TÉLÉPHONE 1" value={config.telephone1} onChange={(v) => upd("telephone1", v)} />
              <Field label="TÉLÉPHONE 2" value={config.telephone2} onChange={(v) => upd("telephone2", v)} />
              <Field label="WHATSAPP (chiffres)" value={config.whatsapp} onChange={(v) => upd("whatsapp", v)} placeholder="50938332483" />
              <Field label="EMAIL" value={config.email} onChange={(v) => upd("email", v)} type="email" />
              <Field label="ADRESSE" value={config.adresse} onChange={(v) => upd("adresse", v)} multiline />
              <Field label="HEURES D'OUVERTURE" value={config.heures} onChange={(v) => upd("heures", v)} />
            </Section>
          </>
        )}

        {/* ── BOUTONS ─────────────────────────────────────────────────── */}
        {activeTab === "boutons" && (
          <Section title="Quick Buttons" emoji="🔘">
            <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#888" }}>Boutons sous la barre de recherche. ▲▼ pour réordonner.</p>
            {/* Preview */}
            <div style={{ display: "flex", gap: "6px", padding: "8px 10px", background: "#f8f9fa", borderRadius: "12px", marginBottom: "12px", overflowX: "auto", scrollbarWidth: "none" }}>
              {[...config.quickButtons].sort((a, b) => a.order - b.order).map((btn) => (
                <span key={btn.id} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: "999px", background: "#1a1a2e", color: "#fff", fontSize: "11px", fontWeight: 600 }}>
                  {btn.emoji} {btn.label}
                </span>
              ))}
            </div>
            {[...config.quickButtons].sort((a, b) => a.order - b.order).map((btn, idx) => (
              <QuickButtonEditor key={btn.id} btn={btn}
                onUpdate={(updated) => updateBtn(idx, updated)}
                onDelete={() => deleteBtn(idx)}
                onMoveUp={() => moveBtn(idx, -1)}
                onMoveDown={() => moveBtn(idx, 1)}
                isFirst={idx === 0} isLast={idx === config.quickButtons.length - 1}
              />
            ))}
            <button onClick={addBtn} style={{ width: "100%", padding: "12px", background: "#f0f4ff", color: "#1a1a2e", border: "2px dashed #c7d7ff", borderRadius: "14px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: "4px" }}>
              ➕ Ajouter un bouton
            </button>
          </Section>
        )}

        {/* ── TEXTES ──────────────────────────────────────────────────── */}
        {activeTab === "textes" && (
          <>
            <Section title="Texte Livraison" emoji="🚚">
              <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#888" }}>Affiché quand le client clique sur "Livraison".</p>
              <Field label="TEXTE" value={config.livraisonText} onChange={(v) => upd("livraisonText", v)} multiline />
              <div style={{ background: "#f8f9fa", borderRadius: "12px", padding: "12px" }}>
                <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 700, color: "#aaa" }}>APERÇU</p>
                <p style={{ margin: 0, fontSize: "13px", color: "#333", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{config.livraisonText || "Aucun texte"}</p>
              </div>
            </Section>
            <Section title="Texte Garantie" emoji="🛡️">
              <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#888" }}>Affiché quand le client clique sur "Garantie".</p>
              <Field label="TEXTE" value={config.garantieText} onChange={(v) => upd("garantieText", v)} multiline />
              <div style={{ background: "#f8f9fa", borderRadius: "12px", padding: "12px" }}>
                <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 700, color: "#aaa" }}>APERÇU</p>
                <p style={{ margin: 0, fontSize: "13px", color: "#333", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{config.garantieText || "Aucun texte"}</p>
              </div>
            </Section>
          </>
        )}

        {/* ── PAIEMENT ────────────────────────────────────────────────── */}
        {activeTab === "paiement" && (
          <Section title="Méthodes de paiement" emoji="💳">
            <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#888" }}>
              Gérez les méthodes de paiement affichées aux clients lors du checkout.
            </p>
            {config.paymentMethods.map((m, idx) => (
              <PaymentEditor key={m.id} method={m}
                onUpdate={(updated) => updatePay(idx, updated)}
                onDelete={() => deletePay(idx)}
              />
            ))}
            <button onClick={addPay} style={{ width: "100%", padding: "12px", background: "#f0faf5", color: "#1a9e6e", border: "2px dashed #b7e4c7", borderRadius: "14px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: "4px" }}>
              ➕ Ajouter une méthode
            </button>
          </Section>
        )}

        {/* ── COMPTES ─────────────────────────────────────────────────── */}
        {activeTab === "comptes" && (
          <Section title="Comptes Admin" emoji="👥">
            <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#888" }}>
              {config.adminAccounts.length} compte{config.adminAccounts.length > 1 ? "s" : ""} — {adminCount} admin{adminCount > 1 ? "s" : ""}
            </p>
            {config.adminAccounts.map((acc, idx) => (
              <AccountEditor key={acc.id} account={acc}
                onUpdate={(updated) => updateAcc(idx, updated)}
                onDelete={() => deleteAcc(idx)}
                isOnlyAdmin={acc.role === "admin" && adminCount <= 1}
              />
            ))}
            <button onClick={addAcc} style={{ width: "100%", padding: "12px", background: "#f0f4ff", color: "#3b4dd4", border: "2px dashed #c7d7ff", borderRadius: "14px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: "4px" }}>
              ➕ Ajouter un compte
            </button>
          </Section>
        )}

        {/* ── BANNIÈRE ────────────────────────────────────────────────── */}
        {activeTab === "banniere" && (
          <Section title="Bannière d'annonce" emoji="📢">
            <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#888" }}>Bandeau affiché en haut du site pour promos et annonces.</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>Activer la bannière</p>
              <button onClick={() => upd("banniereActive", !config.banniereActive)} style={{ width: "48px", height: "26px", borderRadius: "999px", background: config.banniereActive ? "#1a9e6e" : "#ddd", border: "none", cursor: "pointer", position: "relative" }}>
                <div style={{ position: "absolute", top: "3px", left: config.banniereActive ? "24px" : "3px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </button>
            </div>
            <Field label="TEXTE DE LA BANNIÈRE" value={config.banniereTexte} onChange={(v) => upd("banniereTexte", v)} placeholder="🔥 Promo spéciale!" />
            <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 700, color: "#888" }}>COULEUR</p>
            <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
              {["#e63946", "#1a1a2e", "#1a9e6e", "#f79f1f", "#3b4dd4", "#7c3aed"].map((c) => (
                <button key={c} onClick={() => upd("banniereCouleur", c)} style={{ width: "34px", height: "34px", borderRadius: "50%", background: c, border: config.banniereCouleur === c ? "3px solid #111" : "3px solid transparent", cursor: "pointer" }} />
              ))}
              <input type="color" value={config.banniereCouleur} onChange={(e) => upd("banniereCouleur", e.target.value)} style={{ width: "34px", height: "34px", borderRadius: "50%", border: "none", cursor: "pointer", padding: 0 }} />
            </div>
            {config.banniereActive && (
              <div style={{ background: config.banniereCouleur, color: "#fff", padding: "10px 16px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, textAlign: "center" }}>
                {config.banniereTexte || "Texte de la bannière"}
              </div>
            )}
          </Section>
        )}
      </div>

      {/* Success toast */}
      {saved && (
        <div style={{ position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "#1a9e6e", color: "#fff", padding: "10px 24px", borderRadius: "999px", fontSize: "13px", fontWeight: 700, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
          ✅ Sauvegardé dans website/siteweb!
        </div>
      )}

      {/* Bottom bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #eee", display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 0 10px", boxShadow: "0 -2px 10px rgba(0,0,0,0.06)", zIndex: 100 }}>
        {[
          { icon: "🏠", label: "Boutique",     action: () => router.push("/"),          color: "#333"    },
          { icon: "⚡", label: "Dashboard",    action: () => router.push("/dashboard"), color: "#e63946" },
          { icon: "💾", label: "Sauvegarder",  action: save,                            color: "#1a9e6e" },
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
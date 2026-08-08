"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════
type Action = "voir" | "ajouter" | "modifier" | "supprimer";
type VendeurAction = "voir" | "ajoute" | "modifye" | "siprime" | "retrait" | "depot" | "annule" | "restore";

interface SectionPermission {
  voir: boolean;
  ajouter: boolean;
  modifier: boolean;
  supprimer: boolean;
}

// Pèmisyon espesyal pou seksyon Vandè a — matche egzatteman sa paj Vandè a li
interface VendeurPermission {
  voir: boolean;
  ajoute: boolean;
  modifye: boolean;
  siprime: boolean;
  retrait: boolean;
  depot: boolean;
  annule: boolean;
  restore: boolean;
}

interface Permissions {
  rapports:      SectionPermission;
  parametre:     SectionPermission;
  utilisateurs:  SectionPermission;
  vendeurs:      VendeurPermission;   // ← chanje: pa SectionPermission ankò
  commandes:     SectionPermission;
  modifierSite:  SectionPermission;
  produits:      SectionPermission;
}

interface SecurityQuestions {
  rep1: string; // Nom jeune fille manman
  rep2: string; // Lieu de naissance
  rep3: string; // Meilleur ami
}

interface User {
  id: string;
  nom: string;
  username: string;
  email: string;
  role: "admin" | "staff" | "vendeur";
  actif: boolean;
  permissions: Permissions;
  securityQuestions?: SecurityQuestions;
  loginAttempts: number;
  blockedUntil: string | null;
}

// ── Default permissions ───────────────────────────────────────────────────
const emptySection = (): SectionPermission => ({ voir: false, ajouter: false, modifier: false, supprimer: false });
const fullSection  = (): SectionPermission => ({ voir: true,  ajouter: true,  modifier: true,  supprimer: true  });
const voirOnly     = (): SectionPermission => ({ voir: true,  ajouter: false, modifier: false, supprimer: false });

const emptyVendeur    = (): VendeurPermission => ({ voir: false, ajoute: false, modifye: false, siprime: false, retrait: false, depot: false, annule: false, restore: false });
const fullVendeur     = (): VendeurPermission => ({ voir: true,  ajoute: true,  modifye: true,  siprime: true,  retrait: true,  depot: true,  annule: true,  restore: true  });
const voirOnlyVendeur = (): VendeurPermission => ({ voir: true,  ajoute: false, modifye: false, siprime: false, retrait: false, depot: false, annule: false, restore: false });

const defaultPermissions = (role: "admin" | "staff" | "vendeur"): Permissions => {
  if (role === "admin") {
    return {
      rapports:     fullSection(),
      parametre:    fullSection(),
      utilisateurs: fullSection(),
      vendeurs:     fullVendeur(),
      commandes:    fullSection(),
      modifierSite: fullSection(),
      produits:     fullSection(),
    };
  }
  if (role === "vendeur") {
    return {
      rapports:     voirOnly(),
      parametre:    { voir: true, ajouter: false, modifier: true, supprimer: false }, // chanje modpas
      utilisateurs: emptySection(),
      vendeurs:     voirOnlyVendeur(),
      commandes:    emptySection(),
      modifierSite: emptySection(),
      produits:     emptySection(),
    };
  }
  // staff — tout vide pa defo
  return {
    rapports:     emptySection(),
    parametre:    emptySection(),
    utilisateurs: emptySection(),
    vendeurs:     emptyVendeur(),
    commandes:    emptySection(),
    modifierSite: emptySection(),
    produits:     emptySection(),
  };
};

const SECTION_LABELS: { key: keyof Permissions; label: string; emoji: string }[] = [
  { key: "produits",     label: "Produits",      emoji: "📦" },
  { key: "commandes",    label: "Commandes",      emoji: "🧾" },
  { key: "rapports",     label: "Rapports",       emoji: "📊" },
  { key: "vendeurs",     label: "Vendeurs",        emoji: "🪪" },
  { key: "utilisateurs", label: "Utilisateurs",   emoji: "👤" },
  { key: "modifierSite", label: "Modifier Site",  emoji: "🖥️" },
  { key: "parametre",    label: "Paramètre",      emoji: "⚙️" },
];

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:   { bg: "#fce8e8", color: "#e63946" },
  staff:   { bg: "#e8f4fd", color: "#1a6fa8" },
  vendeur: { bg: "#e8fdf0", color: "#1a9e6e" },
};

const ACTION_CONFIG: { key: Action; label: string; color: string }[] = [
  { key: "voir",      label: "Voir",      color: "#3498db" },
  { key: "ajouter",   label: "Ajouter",   color: "#1a9e6e" },
  { key: "modifier",  label: "Modifier",  color: "#f79f1f" },
  { key: "supprimer", label: "Supprimer", color: "#e63946" },
];

// 8 aksyon espesifik seksyon Vandè a
const VENDEUR_ACTION_CONFIG: { key: VendeurAction; label: string; color: string }[] = [
  { key: "voir",    label: "Voir",      color: "#3498db" },
  { key: "ajoute",  label: "Ajouter",   color: "#1a9e6e" },
  { key: "modifye", label: "Modifier",  color: "#f79f1f" },
  { key: "siprime", label: "Supprimer", color: "#e63946" },
  { key: "retrait", label: "Retrait",   color: "#e67e22" },
  { key: "depot",   label: "Dépôt",     color: "#2979ff" },
  { key: "annule",  label: "Annuler",   color: "#9b59b6" },
  { key: "restore", label: "Restaurer", color: "#1abc9c" },
];

function isBlocked(user: User): boolean {
  if (!user.blockedUntil) return false;
  return new Date(user.blockedUntil) > new Date();
}

function blockTimeLeft(user: User): string {
  if (!user.blockedUntil) return "";
  const diff = new Date(user.blockedUntil).getTime() - Date.now();
  if (diff <= 0) return "";
  const mins = Math.ceil(diff / 60000);
  return mins > 60 ? `${Math.ceil(mins / 60)}h` : `${mins} min`;
}

// Total pèmisyon aktive nan yon objè Permissions, kèlkeswa konbyen chan chak seksyon genyen
function countOn(permissions: Permissions): number {
  return Object.values(permissions).reduce((sum, section) => sum + Object.values(section).filter(Boolean).length, 0);
}
function countPossible(permissions: Permissions): number {
  return Object.values(permissions).reduce((sum, section) => sum + Object.keys(section).length, 0);
}

const SAMPLE_USERS: User[] = [
  {
    id: "u1", nom: "Jean Admin", username: "admin",
    email: "admin@millionstore.com", role: "admin", actif: true,
    permissions: defaultPermissions("admin"),
    loginAttempts: 0, blockedUntil: null,
    securityQuestions: { rep1: "marie", rep2: "port-au-prince", rep3: "cesar" },
  },
];

// ══════════════════════════════════════════════════════════════════════════
// PERMISSION ROW — seksyon estanda (Voir/Ajouter/Modifier/Supprimer)
// ══════════════════════════════════════════════════════════════════════════
function PermRow({ label, emoji, perms, onChange }: {
  label: string; emoji: string;
  perms: SectionPermission;
  onChange: (action: Action, val: boolean) => void;
}) {
  return (
    <div style={{ background: "#f8f9fa", borderRadius: "14px", padding: "12px 14px", marginBottom: "8px" }}>
      <p style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: 800, color: "#1a1a2e" }}>
        {emoji} {label}
      </p>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {ACTION_CONFIG.map(({ key, label: aLabel, color }) => {
          const on = perms[key];
          return (
            <button key={key} onClick={() => onChange(key, !on)} style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "6px 12px", borderRadius: "999px",
              border: `1.5px solid ${on ? color : "#ddd"}`,
              background: on ? `${color}18` : "#fff",
              color: on ? color : "#bbb",
              fontSize: "11px", fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s",
            }}>
              <span style={{
                width: "14px", height: "14px", borderRadius: "50%",
                background: on ? color : "#ddd",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: "8px", color: "#fff", fontWeight: 900, flexShrink: 0,
              }}>{on ? "✓" : "✕"}</span>
              {aLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PERMISSION ROW — seksyon Vandè a (8 aksyon espesifik)
// ══════════════════════════════════════════════════════════════════════════
function PermRowVendeur({ label, emoji, perms, onChange }: {
  label: string; emoji: string;
  perms: VendeurPermission;
  onChange: (action: VendeurAction, val: boolean) => void;
}) {
  return (
    <div style={{ background: "#f8f9fa", borderRadius: "14px", padding: "12px 14px", marginBottom: "8px", border: "1px solid #eef0f4" }}>
      <p style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: 800, color: "#1a1a2e" }}>
        {emoji} {label} <span style={{ fontSize: "10px", fontWeight: 600, color: "#aaa" }}>(pèmisyon detaye)</span>
      </p>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {VENDEUR_ACTION_CONFIG.map(({ key, label: aLabel, color }) => {
          const on = perms[key];
          return (
            <button key={key} onClick={() => onChange(key, !on)} style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "6px 12px", borderRadius: "999px",
              border: `1.5px solid ${on ? color : "#ddd"}`,
              background: on ? `${color}18` : "#fff",
              color: on ? color : "#bbb",
              fontSize: "11px", fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s",
            }}>
              <span style={{
                width: "14px", height: "14px", borderRadius: "50%",
                background: on ? color : "#ddd",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: "8px", color: "#fff", fontWeight: 900, flexShrink: 0,
              }}>{on ? "✓" : "✕"}</span>
              {aLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PERMISSION SHEET
// ══════════════════════════════════════════════════════════════════════════
function PermissionSheet({ user, onClose, onSave }: {
  user: User; onClose: () => void; onSave: (u: User) => void;
}) {
  const [perms, setPerms] = useState<Permissions>(JSON.parse(JSON.stringify(user.permissions)));
  const roleC = ROLE_COLORS[user.role];

  // Toggle jenerik — mache pou seksyon estanda (4 chan) e pou vandè (8 chan)
  const toggle = (section: keyof Permissions, action: string, val: boolean) => {
    setPerms((prev) => ({
      ...prev,
      [section]: { ...(prev[section] as any), [action]: val },
    }));
  };

  const setAll = (full: boolean) => setPerms(defaultPermissions(full ? "admin" : "staff"));

  const totalOn = countOn(perms);
  const totalPossible = countPossible(perms);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", maxHeight: "92vh", overflowY: "auto", paddingBottom: "32px" }}>
        <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "12px auto 0" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
          <div>
            <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#1a1a2e" }}>🔐 Permissions</p>
            <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#888" }}>{user.nom} • {totalOn}/{totalPossible} actives</p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ background: roleC.bg, color: roleC.color, padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>{user.role}</span>
            <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#f1f1f1", border: "none", fontSize: "16px", cursor: "pointer" }}>×</button>
          </div>
        </div>

        {/* Quick presets */}
        <div style={{ display: "flex", gap: "6px", padding: "10px 16px", flexWrap: "wrap" }}>
          <button onClick={() => setAll(true)} style={{ flex: 1, padding: "8px", borderRadius: "10px", background: "#1a9e6e18", color: "#1a9e6e", border: "1.5px solid #1a9e6e", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✓ Tout activer</button>
          <button onClick={() => setAll(false)} style={{ flex: 1, padding: "8px", borderRadius: "10px", background: "#e6394618", color: "#e63946", border: "1.5px solid #e63946", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕ Tout désactiver</button>
          <button onClick={() => setPerms(defaultPermissions("vendeur"))} style={{ flex: 1, padding: "8px", borderRadius: "10px", background: "#e8f4fd", color: "#1a6fa8", border: "1.5px solid #1a6fa8", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>👁️ Voir seulement</button>
        </div>

        <div style={{ padding: "0 16px" }}>
          {SECTION_LABELS.map(({ key, label, emoji }) =>
            key === "vendeurs" ? (
              <PermRowVendeur
                key={key}
                label={label}
                emoji={emoji}
                perms={perms.vendeurs}
                onChange={(action, val) => toggle("vendeurs", action, val)}
              />
            ) : (
              <PermRow
                key={key}
                label={label}
                emoji={emoji}
                perms={perms[key] as SectionPermission}
                onChange={(action, val) => toggle(key, action, val)}
              />
            )
          )}
        </div>

        <div style={{ padding: "16px 16px 0" }}>
          <button onClick={() => onSave({ ...user, permissions: perms })} style={{ width: "100%", padding: "15px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            💾 Enregistrer les permissions
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ADD USER MODAL
// ══════════════════════════════════════════════════════════════════════════
function AddUserModal({ onClose, onAdd }: { onClose: () => void; onAdd: (u: User) => void }) {
  const [step, setStep]           = useState<"info" | "security">("info");
  const [nom, setNom]             = useState("");
  const [username, setUsername]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [role, setRole]           = useState<"staff" | "vendeur">("staff");
  const [rep1, setRep1]           = useState("");
  const [rep2, setRep2]           = useState("");
  const [rep3, setRep3]           = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  const goToSecurity = () => {
    if (!nom.trim() || !email.trim() || !password.trim()) { setError("Nom, email ak modpas obligatwa."); return; }
    if (password.length < 6) { setError("Modpas dwe gen omwen 6 karaktè."); return; }
    setError(""); setStep("security");
  };

  const submit = async () => {
    if (!rep1.trim() || !rep2.trim() || !rep3.trim()) { setError("Reponn tout 3 kesyon sekirite yo."); return; }
    setLoading(true);
    try {
      const auth = getAuth();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const newUser: User = {
        id: cred.user.uid,
        nom: nom.trim(),
        username: username.trim() || nom.trim().toLowerCase().replace(" ", ""),
        email: email.trim(),
        role,
        actif: true,
        permissions: defaultPermissions(role),
        securityQuestions: {
          rep1: rep1.trim().toLowerCase(),
          rep2: rep2.trim().toLowerCase(),
          rep3: rep3.trim().toLowerCase(),
        },
        loginAttempts: 0,
        blockedUntil: null,
      };
      onAdd(newUser);
      onClose();
    } catch (e: any) {
      if (e.code === "auth/email-already-in-use") setError("Email sa deja itilize.");
      else if (e.code === "auth/invalid-email") setError("Email pa valid.");
      else setError("Erè. Eseye ankò.");
    }
    setLoading(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", maxHeight: "92vh", overflowY: "auto", paddingBottom: "40px" }}>
        <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "12px auto 0" }} />

        {/* Progress */}
        <div style={{ display: "flex", gap: "6px", padding: "12px 16px 0" }}>
          {["info", "security"].map((s, i) => (
            <div key={s} style={{ flex: 1, height: "4px", borderRadius: "2px", background: step === "security" || (step === "info" && i === 0) ? "#1a1a2e" : "#e0e0e0" }} />
          ))}
        </div>

        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#1a1a2e" }}>
                {step === "info" ? "➕ Nouvel utilisateur" : "🔐 Questions de sécurité"}
              </h3>
              <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#888" }}>
                {step === "info" ? "Étape 1/2 — Informations" : "Étape 2/2 — Sécurité"}
              </p>
            </div>
            <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#f1f1f1", border: "none", fontSize: "16px", cursor: "pointer" }}>×</button>
          </div>

          {error && <div style={{ background: "#fff0f0", color: "#e63946", padding: "10px", borderRadius: "10px", fontSize: "12px", marginBottom: "12px", textAlign: "center" }}>{error}</div>}

          {step === "info" && (
            <>
              {[
                { label: "NOM COMPLET *", val: nom, set: setNom, ph: "Jean Pierre", type: "text" },
                { label: "USERNAME", val: username, set: setUsername, ph: "jeanpierre (optionnel)", type: "text" },
                { label: "EMAIL *", val: email, set: setEmail, ph: "jean@exemple.com", type: "email" },
              ].map(({ label, val, set, ph, type }) => (
                <div key={label} style={{ marginBottom: "12px" }}>
                  <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>{label}</p>
                  <input type={type} value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
                    style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e8e8e8", borderRadius: "12px", fontSize: "13px", outline: "none", fontFamily: "inherit", color: "#333", boxSizing: "border-box" }} />
                </div>
              ))}

              <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>MOT DE PASSE * (min. 6)</p>
              <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #e8e8e8", borderRadius: "12px", padding: "11px 14px", gap: "10px", marginBottom: "6px" }}>
                <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  style={{ flex: 1, border: "none", outline: "none", fontSize: "13px", fontFamily: "inherit", color: "#333", background: "transparent" }} />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "15px", padding: 0 }}>
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
              {password && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ height: "4px", borderRadius: "999px", background: "#f0f0f0", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: "999px", width: password.length >= 10 ? "100%" : password.length >= 6 ? "60%" : "25%", background: password.length >= 10 ? "#1a9e6e" : password.length >= 6 ? "#f79f1f" : "#e63946", transition: "width 0.3s" }} />
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: "10px", color: password.length >= 10 ? "#1a9e6e" : password.length >= 6 ? "#f79f1f" : "#e63946" }}>
                    {password.length >= 10 ? "Fort 💪" : password.length >= 6 ? "Moyen" : "Trop court"}
                  </p>
                </div>
              )}

              <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>RÔLE *</p>
              <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
                {(["staff", "vendeur"] as const).map((r) => {
                  const c = ROLE_COLORS[r];
                  return (
                    <button key={r} onClick={() => setRole(r)} style={{ flex: 1, padding: "10px", borderRadius: "12px", border: `1.5px solid ${role === r ? c.color : "#e0e0e0"}`, background: role === r ? c.bg : "#fff", color: role === r ? c.color : "#aaa", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      {r === "staff" ? "👤 Staff" : "🪪 Vendeur"}
                    </button>
                  );
                })}
              </div>

              <button onClick={goToSecurity} style={{ width: "100%", padding: "14px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                Suivant → Questions de sécurité
              </button>
            </>
          )}

          {step === "security" && (
            <>
              <div style={{ background: "#f0f4ff", borderRadius: "12px", padding: "10px 12px", marginBottom: "14px" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "#3b4dd4" }}>
                  ℹ️ Ces réponses serviront à récupérer le mot de passe. Mémorisez-les bien.
                </p>
              </div>

              {[
                { label: "1️⃣ Nom de jeune fille de ta maman", val: rep1, set: setRep1, ph: "Repons ou..." },
                { label: "2️⃣ Lieu de naissance", val: rep2, set: setRep2, ph: "Repons ou..." },
                { label: "3️⃣ Nom de votre meilleur(e) ami(e)", val: rep3, set: setRep3, ph: "Repons ou..." },
              ].map(({ label, val, set, ph }) => (
                <div key={label} style={{ background: "#f8f9fa", borderRadius: "14px", padding: "12px 14px", marginBottom: "10px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>{label}</p>
                  <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph}
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e0e0e0", borderRadius: "10px", fontSize: "13px", outline: "none", fontFamily: "inherit", color: "#333", boxSizing: "border-box" }} />
                </div>
              ))}

              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button onClick={() => { setStep("info"); setError(""); }} style={{ flex: 1, padding: "14px", background: "#f0f0f0", color: "#333", border: "none", borderRadius: "14px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  ← Retour
                </button>
                <button onClick={submit} disabled={loading} style={{ flex: 2, padding: "14px", background: loading ? "#888" : "#1a9e6e", color: "#fff", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {loading ? "⏳ Création..." : "✅ Créer l'utilisateur"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PAGE UTILISATEURS
// ══════════════════════════════════════════════════════════════════════════
export default function UtilisateursPage() {
  const router = useRouter();
  const [users, setUsers]               = useState<User[]>(SAMPLE_USERS);
  const [loading, setLoading]           = useState(true);
  const [editingPerms, setEditingPerms] = useState<User | null>(null);
  const [showAdd, setShowAdd]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast]               = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, "siteUsers"));
        const arr = snap.docs.map((d) => d.data() as User);
        if (arr.length > 0) setUsers(arr);
      } catch { }
      finally { setLoading(false); }
    };
    load();
  }, []);

  // ── Chak aksyon touche SÈLMAN dokiman itilizatè konsène a nan siteUsers ──

  const savePerms = async (updated: User) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setEditingPerms(null);
    try {
      await updateDoc(doc(db, "siteUsers", updated.id), { permissions: updated.permissions });
      showToast("Permissions mises à jour!", "success");
    } catch {
      showToast("Erè sauvegarde.", "error");
    }
  };

  const addUser = async (u: User) => {
    setUsers((prev) => [...prev, u]);
    try {
      await setDoc(doc(db, "siteUsers", u.id), u);
      showToast("Utilisateur créé!", "success");
    } catch {
      showToast("Erè sauvegarde.", "error");
    }
  };

  const deleteUser = async (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setConfirmDelete(null);
    try {
      await deleteDoc(doc(db, "siteUsers", id));
      showToast("Utilisateur supprimé.", "success");
    } catch {
      showToast("Erè sauvegarde.", "error");
    }
  };

  const toggleActif = async (id: string) => {
    const target = users.find((u) => u.id === id);
    if (!target) return;
    const newActif = !target.actif;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, actif: newActif } : u)));
    try {
      await updateDoc(doc(db, "siteUsers", id), { actif: newActif });
    } catch {
      showToast("Erè sauvegarde.", "error");
    }
  };

  const deblokeKont = async (id: string) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, loginAttempts: 0, blockedUntil: null } : u)));
    try {
      await updateDoc(doc(db, "siteUsers", id), { loginAttempts: 0, blockedUntil: null });
      showToast("Compte débloqué!", "success");
    } catch {
      showToast("Erè sauvegarde.", "error");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6fa", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "70px" }}>

      {toast && (
        <div style={{ position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: toast.type === "success" ? "#1a9e6e" : "#e63946", color: "#fff", padding: "10px 24px", borderRadius: "999px", fontSize: "13px", fontWeight: 700, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", whiteSpace: "nowrap" }}>
          {toast.type === "success" ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      {editingPerms && <PermissionSheet user={editingPerms} onClose={() => setEditingPerms(null)} onSave={savePerms} />}
      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onAdd={addUser} />}

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "20px", padding: "24px 20px", width: "100%", maxWidth: "320px", textAlign: "center" }}>
            <p style={{ fontSize: "40px", margin: "0 0 10px" }}>🗑️</p>
            <p style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 800, color: "#1a1a2e" }}>Supprimer cet utilisateur?</p>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#888" }}>Cette action est irréversible.</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "12px", borderRadius: "12px", background: "#f0f0f0", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
              <button onClick={() => deleteUser(confirmDelete)} style={{ flex: 1, padding: "12px", borderRadius: "12px", background: "#e63946", color: "#fff", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <header style={{ background: "#fff", borderBottom: "1px solid #eee", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => router.back()} style={{ background: "#f0f0f0", border: "none", borderRadius: "8px", width: "34px", height: "34px", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
          <div>
            <p style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#1a1a2e", lineHeight: 1 }}>👤 Utilisateurs</p>
            <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#888" }}>{users.length} compte{users.length > 1 ? "s" : ""} • siteUsers</p>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "10px", padding: "8px 14px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ➕ Ajouter
        </button>
      </header>

      <div style={{ padding: "12px" }}>
        {loading ? (
          [...Array(2)].map((_, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: "16px", height: "120px", marginBottom: "10px", animation: "pulse 1.5s infinite" }} />
          ))
        ) : (
          users.map((user) => {
            const roleC = ROLE_COLORS[user.role];
            const blocked = isBlocked(user);
            const timeLeft = blockTimeLeft(user);
            const totalOn = countOn(user.permissions);
            const totalPossible = countPossible(user.permissions);

            return (
              <div key={user.id} style={{ background: "#fff", borderRadius: "16px", marginBottom: "10px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden", opacity: user.actif ? 1 : 0.55, borderLeft: blocked ? "4px solid #e63946" : "4px solid transparent" }}>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid #f5f5f5" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: roleC.bg, border: `2px solid ${roleC.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>
                      {user.role === "admin" ? "👑" : user.role === "staff" ? "👤" : "🪪"}
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#1a1a2e" }}>{user.nom}</p>
                      <p style={{ margin: "1px 0 0", fontSize: "10px", color: "#aaa" }}>{user.email}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", flexWrap: "wrap" }}>
                        <span style={{ background: roleC.bg, color: roleC.color, padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700 }}>{user.role}</span>
                        {blocked ? (
                          <span style={{ fontSize: "10px", color: "#e63946", fontWeight: 700 }}>🔒 Bloqué {timeLeft}</span>
                        ) : (
                          <span style={{ fontSize: "10px", color: user.actif ? "#1a9e6e" : "#aaa", fontWeight: 600 }}>
                            {user.actif ? "🟢 Actif" : "⚫ Inactif"}
                          </span>
                        )}
                        {user.loginAttempts > 0 && !blocked && (
                          <span style={{ fontSize: "10px", color: "#f79f1f", fontWeight: 600 }}>⚠️ {user.loginAttempts}/5</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => toggleActif(user.id)} style={{ width: "44px", height: "24px", borderRadius: "999px", background: user.actif ? "#1a9e6e" : "#ddd", border: "none", cursor: "pointer", position: "relative", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: "3px", left: user.actif ? "22px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                  </button>
                </div>

                {blocked && (
                  <div style={{ background: "#fff0f0", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#e63946" }}>🔒 Bloqué — {timeLeft} rete</p>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#e63946" }}>5 tantativ ekwoke</p>
                    </div>
                    <button onClick={() => deblokeKont(user.id)} style={{ background: "#e63946", color: "#fff", border: "none", borderRadius: "8px", padding: "7px 12px", fontSize: "11px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      🔓 Débloquer
                    </button>
                  </div>
                )}

                <div style={{ padding: "10px 14px", background: "#fafafa" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <p style={{ margin: 0, fontSize: "11px", color: "#888", fontWeight: 600 }}>PERMISSIONS: {totalOn}/{totalPossible}</p>
                    <div style={{ width: "80px", height: "5px", background: "#e8e8e8", borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: "999px", width: `${(totalOn / totalPossible) * 100}%`, background: totalOn === 0 ? "#ddd" : totalOn > totalPossible * 0.6 ? "#e63946" : "#1a9e6e", transition: "width 0.3s" }} />
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "10px" }}>
                    {SECTION_LABELS.map(({ key, emoji }) => {
                      const p = user.permissions[key];
                      const count = Object.values(p).filter(Boolean).length;
                      const outOf = Object.keys(p).length;
                      return (
                        <span key={key} style={{ background: count > 0 ? "#1a1a2e10" : "#f0f0f0", color: count > 0 ? "#1a1a2e" : "#ccc", padding: "3px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700 }}>
                          {emoji} {count}/{outOf}
                        </span>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => setEditingPerms(user)} style={{ flex: 1, padding: "9px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "10px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      🔐 Permissions
                    </button>
                    {user.role !== "admin" && (
                      <button onClick={() => setConfirmDelete(user.id)} style={{ padding: "9px 14px", background: "#fff0f0", color: "#e63946", border: "1.5px solid #fdd", borderRadius: "10px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #eee", display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 0 10px", boxShadow: "0 -2px 10px rgba(0,0,0,0.06)", zIndex: 100 }}>
        {[
          { icon: "🏠", label: "Boutique",  href: "/",          color: "#333"    },
          { icon: "⚡", label: "Dashboard", href: "/dashboard", color: "#e63946" },
          { icon: "👤", label: "Comptes",   href: "#",          color: "#1a1a2e" },
        ].map(({ icon, label, href, color }) => (
          <button key={label} onClick={() => router.push(href)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", fontFamily: "inherit" }}>
            <span style={{ fontSize: "20px" }}>{icon}</span>
            <span style={{ fontSize: "10px", color, fontWeight: 600 }}>{label}</span>
          </button>
        ))}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } } * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }`}</style>
    </div>
  );
}
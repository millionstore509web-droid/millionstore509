"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, runTransaction, getDocs, collection } from "firebase/firestore";
import {
  getAuth,
  signInWithEmailAndPassword,
  updatePassword,
  createUserWithEmailAndPassword,
  deleteUser,
} from "firebase/auth";

const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 60 * 60 * 1000;

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════
type Action = "voir" | "ajouter" | "modifier" | "supprimer";
interface SectionPermission { voir: boolean; ajouter: boolean; modifier: boolean; supprimer: boolean; }
interface Permissions {
  rapports: SectionPermission; parametre: SectionPermission; utilisateurs: SectionPermission;
  vendeurs: SectionPermission; commandes: SectionPermission; modifierSite: SectionPermission; produits: SectionPermission;
}
interface SecurityQuestions { rep1: string; rep2: string; rep3: string; }
interface User {
  id: string; nom: string; username: string; email: string;
  role: "admin" | "staff" | "vendeur"; actif: boolean;
  permissions: Permissions; securityQuestions?: SecurityQuestions;
  loginAttempts: number; blockedUntil: string | null;
}

const emptySection = (): SectionPermission => ({ voir: false, ajouter: false, modifier: false, supprimer: false });
const voirOnly     = (): SectionPermission => ({ voir: true,  ajouter: false, modifier: false, supprimer: false });

const defaultPermissions = (role: "admin" | "staff" | "vendeur"): Permissions => {
  if (role === "vendeur") {
    return {
      rapports:     voirOnly(),
      parametre:    { voir: true, ajouter: false, modifier: true, supprimer: false },
      utilisateurs: emptySection(),
      vendeurs:     voirOnly(),
      commandes:    emptySection(),
      modifierSite: emptySection(),
      produits:     emptySection(),
    };
  }
  return {
    rapports: emptySection(), parametre: emptySection(), utilisateurs: emptySection(),
    vendeurs: emptySection(), commandes: emptySection(), modifierSite: emptySection(), produits: emptySection(),
  };
};

// ══════════════════════════════════════════════════════════════════════════
// MODAL D'INSCRIPTION
// ══════════════════════════════════════════════════════════════════════════
function RegisterModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep]         = useState<"info" | "security">("info");
  const [nom, setNom]           = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [rep1, setRep1]         = useState("");
  const [rep2, setRep2]         = useState("");
  const [rep3, setRep3]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const goToSecurity = () => {
    if (loading) return;
    if (!nom.trim() || !email.trim() || !password.trim()) {
      setError("Le nom, l'email et le mot de passe sont obligatoires."); return;
    }
    if (password.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères."); return; }
    setError(""); setStep("security");
  };

  const submit = async () => {
    if (loading) return; // pwoteje kont doub-klik
    if (!rep1.trim() || !rep2.trim() || !rep3.trim()) {
      setError("Répondez aux 3 questions de sécurité."); return;
    }
    setLoading(true);
    setError("");

    let cred;
    try {
      const auth = getAuth();
      cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      if (e.code === "auth/email-already-in-use") setError("Cet email est déjà utilisé. Essayez de vous connecter.");
      else if (e.code === "auth/invalid-email") setError("Email invalide.");
      else setError("Erreur. Veuillez réessayer.");
      setLoading(false);
      return;
    }

    // Compte Auth créé. Si l'écriture Firestore échoue à partir d'ici,
    // on annule le compte Auth pour ne pas laisser un compte "cassé"
    // (Auth existe mais aucun profil) — c'est ça qui empêchait certains
    // utilisateurs de se connecter après inscription.
    try {
      const newUser: User = {
        id: cred.user.uid,
        nom: nom.trim(),
        username: username.trim() || nom.trim().toLowerCase().replace(/\s+/g, ""),
        email: email.trim(),
        role: "vendeur",
        actif: true,
        permissions: defaultPermissions("vendeur"),
        securityQuestions: {
          rep1: rep1.trim().toLowerCase(),
          rep2: rep2.trim().toLowerCase(),
          rep3: rep3.trim().toLowerCase(),
        },
        loginAttempts: 0,
        blockedUntil: null,
      };

      // Chak itilizatè kounye a se pwòp dokiman li nan siteUsers/{uid}
      await setDoc(doc(db, "siteUsers", newUser.id), newUser);

      onSuccess();
      onClose();
    } catch (e: any) {
      // Rollback : le compte Auth existe déjà, mais aucun profil n'a pu être
      // enregistré. On supprime le compte Auth pour permettre à la personne
      // de recommencer l'inscription proprement.
      try { await deleteUser(cred.user); } catch {}
      setError("La création du profil a échoué. Vérifiez votre connexion et réessayez l'inscription depuis le début.");
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    border: "1.5px solid #e8e8e8", borderRadius: "12px",
    fontSize: "14px", outline: "none",
    fontFamily: "inherit", color: "#333",
    boxSizing: "border-box", background: "#f8f8f8",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", maxHeight: "93vh", overflowY: "auto", paddingBottom: "40px" }}
      >
        {/* Poignée */}
        <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "12px auto 0" }} />

        {/* Barre de progression */}
        <div style={{ display: "flex", gap: "6px", padding: "12px 18px 0" }}>
          {["info", "security"].map((s, i) => (
            <div key={s} style={{
              flex: 1, height: "4px", borderRadius: "2px",
              background: (step === "security" && i === 0) || (step === "info" && i === 0) ? "#1a1a2e" : step === "security" ? "#1a1a2e" : "#e0e0e0",
            }} />
          ))}
        </div>

        <div style={{ padding: "14px 18px 0" }}>
          {/* En-tête */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 900, color: "#1a1a2e" }}>
                {step === "info" ? "🆕 Créer un compte" : "🔐 Questions de sécurité"}
              </h3>
              <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#888" }}>
                {step === "info" ? "Étape 1/2 — Vos informations" : "Étape 2/2 — Pour votre sécurité"}
              </p>
            </div>
            <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#f1f1f1", border: "none", fontSize: "16px", cursor: "pointer" }}>×</button>
          </div>

          {/* Badge de rôle */}
          <div style={{ background: "#e8fdf0", borderRadius: "10px", padding: "8px 12px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px" }}>🪪</span>
            <p style={{ margin: 0, fontSize: "12px", color: "#1a9e6e", fontWeight: 700 }}>
              Votre compte sera créé en tant que <strong>Vendeur</strong>
            </p>
          </div>

          {/* Erreur */}
          {error && (
            <div style={{ background: "#fff0f0", color: "#e63946", padding: "10px 12px", borderRadius: "10px", fontSize: "12px", marginBottom: "12px", textAlign: "center" }}>
              {error}
            </div>
          )}

          {/* ── ÉTAPE 1 : INFOS ── */}
          {step === "info" && (
            <>
              <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>NOM COMPLET *</p>
              <input style={{ ...inputStyle, marginBottom: "12px" }} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Jean Pierre" />

              <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>NOM D'UTILISATEUR (optionnel)</p>
              <input style={{ ...inputStyle, marginBottom: "12px" }} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jeanpierre" />

              <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>EMAIL *</p>
              <input style={{ ...inputStyle, marginBottom: "12px" }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jean@exemple.com" />

              <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>MOT DE PASSE * (min. 6)</p>
              <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #e8e8e8", borderRadius: "12px", padding: "11px 14px", gap: "10px", marginBottom: "6px", background: "#f8f8f8" }}>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ flex: 1, border: "none", outline: "none", fontSize: "14px", fontFamily: "inherit", color: "#333", background: "transparent" }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "15px", padding: 0 }}>
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>

              {/* Barre de force */}
              {password && (
                <div style={{ marginBottom: "18px" }}>
                  <div style={{ height: "4px", borderRadius: "999px", background: "#f0f0f0", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: "999px",
                      width: password.length >= 10 ? "100%" : password.length >= 6 ? "60%" : "25%",
                      background: password.length >= 10 ? "#1a9e6e" : password.length >= 6 ? "#f79f1f" : "#e63946",
                      transition: "width 0.3s",
                    }} />
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: "10px", color: password.length >= 10 ? "#1a9e6e" : password.length >= 6 ? "#f79f1f" : "#e63946" }}>
                    {password.length >= 10 ? "Fort 💪" : password.length >= 6 ? "Moyen" : "Trop court"}
                  </p>
                </div>
              )}

              <button onClick={goToSecurity} disabled={loading} style={{ width: "100%", padding: "14px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", marginTop: password ? 0 : "18px" }}>
                Suivant → Questions de sécurité
              </button>
            </>
          )}

          {/* ── ÉTAPE 2 : SÉCURITÉ ── */}
          {step === "security" && (
            <>
              <div style={{ background: "#f0f4ff", borderRadius: "12px", padding: "10px 12px", marginBottom: "14px" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "#3b4dd4" }}>
                  ℹ️ Ces réponses serviront à récupérer votre mot de passe si vous l'oubliez. Mémorisez-les bien !
                </p>
              </div>

              {[
                { label: "1️⃣ Quel est le nom de jeune fille de votre mère ?", val: rep1, set: setRep1 },
                { label: "2️⃣ Où êtes-vous né(e) ?", val: rep2, set: setRep2 },
                { label: "3️⃣ Quel est le nom de votre meilleur(e) ami(e) ?", val: rep3, set: setRep3 },
              ].map(({ label, val, set }) => (
                <div key={label} style={{ background: "#f8f9fa", borderRadius: "14px", padding: "12px 14px", marginBottom: "10px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>{label}</p>
                  <input
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    placeholder="Votre réponse..."
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e0e0e0", borderRadius: "10px", fontSize: "13px", outline: "none", fontFamily: "inherit", color: "#333", boxSizing: "border-box" }}
                  />
                </div>
              ))}

              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button
                  onClick={() => { setStep("info"); setError(""); }}
                  style={{ flex: 1, padding: "14px", background: "#f0f0f0", color: "#333", border: "none", borderRadius: "14px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  ← Retour
                </button>
                <button
                  onClick={submit}
                  disabled={loading}
                  style={{ flex: 2, padding: "14px", background: loading ? "#888" : "#1a9e6e", color: "#fff", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                >
                  {loading ? "⏳ Création..." : "✅ Créer mon compte"}
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
// MODAL DE RÉINITIALISATION DE MOT DE PASSE
// ══════════════════════════════════════════════════════════════════════════
function ResetPasswordModal({ onClose }: { onClose: () => void }) {
  const [step, setStep]               = useState<"questions" | "newpass">("questions");
  const [email, setEmail]             = useState("");
  const [rep1, setRep1]               = useState("");
  const [rep2, setRep2]               = useState("");
  const [rep3, setRep3]               = useState("");
  const [newPass, setNewPass]         = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");

  const verifyAnswers = async () => {
    if (loading) return; // pwoteje kont doub-klik
    if (!email || !rep1 || !rep2 || !rep3) { setError("Remplissez tous les champs."); return; }
    setLoading(true); setError("");
    try {
      const allUsersSnap = await getDocs(collection(db, "siteUsers"));
      const userEntry = allUsersSnap.docs
        .map((d) => d.data())
        .find((u: any) => u.email?.toLowerCase() === email.toLowerCase()) as any;
      if (!userEntry) { setError("Email introuvable."); setLoading(false); return; }
      const q = userEntry.securityQuestions;
      if (!q) { setError("Aucune question de sécurité pour ce compte."); setLoading(false); return; }
      const ok =
        q.rep1?.toLowerCase().trim() === rep1.toLowerCase().trim() &&
        q.rep2?.toLowerCase().trim() === rep2.toLowerCase().trim() &&
        q.rep3?.toLowerCase().trim() === rep3.toLowerCase().trim();
      if (!ok) { setError("Une ou plusieurs réponses sont incorrectes."); setLoading(false); return; }
      setStep("newpass");
    } catch { setError("Erreur. Veuillez réessayer."); }
    setLoading(false);
  };

  const saveNewPassword = async () => {
    if (loading) return; // pwoteje kont doub-klik
    if (newPass.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères."); return; }
    if (newPass !== confirmPass) { setError("Les mots de passe ne correspondent pas."); return; }
    setLoading(true); setError("");
    try {
      const auth = getAuth();
      const allUsersSnap = await getDocs(collection(db, "siteUsers"));
      const userDoc = allUsersSnap.docs.find((d) => d.data().email?.toLowerCase() === email.toLowerCase());
      if (userDoc && auth.currentUser) {
        await updatePassword(auth.currentUser, newPass);
        await updateDoc(doc(db, "siteUsers", userDoc.id), {
          loginAttempts: 0,
          blockedUntil: null,
        });
      }
      setSuccess("✅ Mot de passe changé avec succès !");
      setTimeout(() => onClose(), 2000);
    } catch (e: any) {
      if (e.code === "auth/requires-recent-login") setError("Vous devez vous reconnecter récemment. Retournez à la connexion et réessayez.");
      else setError("Erreur. Veuillez réessayer.");
    }
    setLoading(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", maxHeight: "92vh", overflowY: "auto", paddingBottom: "40px" }}>
        <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div>
              <p style={{ margin: 0, fontSize: "17px", fontWeight: 900, color: "#1a1a2e" }}>
                {step === "questions" ? "🔐 Mot de passe oublié" : "🔒 Nouveau mot de passe"}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#888" }}>
                {step === "questions" ? "Répondez aux 3 questions de sécurité" : "Choisissez un nouveau mot de passe"}
              </p>
            </div>
            <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#f1f1f1", border: "none", fontSize: "16px", cursor: "pointer" }}>×</button>
          </div>

          {error   && <div style={{ background: "#fff0f0", color: "#e63946", padding: "10px 12px", borderRadius: "10px", fontSize: "12px", marginBottom: "14px", textAlign: "center" }}>{error}</div>}
          {success && <div style={{ background: "#e8fdf0", color: "#1a9e6e", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", marginBottom: "14px", textAlign: "center", fontWeight: 700 }}>{success}</div>}

          {step === "questions" && (
            <>
              <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>VOTRE EMAIL</p>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemple.com" type="email"
                style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e8e8e8", borderRadius: "12px", fontSize: "14px", outline: "none", fontFamily: "inherit", color: "#333", boxSizing: "border-box", marginBottom: "14px" }} />
              {[
                { label: "1️⃣ Quel est le nom de jeune fille de votre mère ?", val: rep1, set: setRep1 },
                { label: "2️⃣ Où êtes-vous né(e) ?", val: rep2, set: setRep2 },
                { label: "3️⃣ Quel est le nom de votre meilleur(e) ami(e) ?", val: rep3, set: setRep3 },
              ].map(({ label, val, set }) => (
                <div key={label} style={{ background: "#f8f9fa", borderRadius: "14px", padding: "14px", marginBottom: "10px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 700, color: "#1a1a2e" }}>{label}</p>
                  <input value={val} onChange={(e) => set(e.target.value)} placeholder="Votre réponse..."
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e0e0e0", borderRadius: "10px", fontSize: "13px", outline: "none", fontFamily: "inherit", color: "#333", boxSizing: "border-box" }} />
                </div>
              ))}
              <button onClick={verifyAnswers} disabled={loading} style={{ width: "100%", padding: "15px", background: loading ? "#888" : "#1a1a2e", color: "#fff", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", marginTop: "6px" }}>
                {loading ? "⏳ Vérification..." : "✅ Vérifier mes réponses"}
              </button>
            </>
          )}

          {step === "newpass" && (
            <>
              <div style={{ background: "#e8fdf0", borderRadius: "12px", padding: "12px", marginBottom: "16px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "13px", color: "#1a9e6e", fontWeight: 700 }}>✅ Réponses correctes ! Entrez votre nouveau mot de passe.</p>
              </div>
              <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>NOUVEAU MOT DE PASSE</p>
              <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #e8e8e8", borderRadius: "12px", padding: "11px 14px", gap: "10px", marginBottom: "10px" }}>
                <input type={showNew ? "text" : "password"} value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Min. 6 caractères"
                  style={{ flex: 1, border: "none", outline: "none", fontSize: "14px", fontFamily: "inherit", color: "#333", background: "transparent" }} />
                <button type="button" onClick={() => setShowNew(!showNew)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "15px", padding: 0 }}>{showNew ? "🙈" : "👁️"}</button>
              </div>
              {newPass && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ height: "4px", borderRadius: "999px", background: "#f0f0f0", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: "999px", width: newPass.length >= 10 ? "100%" : newPass.length >= 6 ? "60%" : "25%", background: newPass.length >= 10 ? "#1a9e6e" : newPass.length >= 6 ? "#f79f1f" : "#e63946", transition: "width 0.3s" }} />
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: "10px", color: newPass.length >= 10 ? "#1a9e6e" : newPass.length >= 6 ? "#f79f1f" : "#e63946" }}>
                    {newPass.length >= 10 ? "Fort 💪" : newPass.length >= 6 ? "Moyen" : "Trop court"}
                  </p>
                </div>
              )}
              <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>CONFIRMER LE MOT DE PASSE</p>
              <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${confirmPass && confirmPass !== newPass ? "#e63946" : "#e8e8e8"}`, borderRadius: "12px", padding: "11px 14px", gap: "10px", marginBottom: "6px" }}>
                <input type={showConfirm ? "text" : "password"} value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder="Répétez le mot de passe"
                  style={{ flex: 1, border: "none", outline: "none", fontSize: "14px", fontFamily: "inherit", color: "#333", background: "transparent" }} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "15px", padding: 0 }}>{showConfirm ? "🙈" : "👁️"}</button>
              </div>
              {confirmPass && confirmPass !== newPass && <p style={{ margin: "0 0 12px", fontSize: "11px", color: "#e63946" }}>❌ Les mots de passe ne correspondent pas</p>}
              {confirmPass && confirmPass === newPass && <p style={{ margin: "0 0 12px", fontSize: "11px", color: "#1a9e6e" }}>✅ Les mots de passe correspondent</p>}
              <button onClick={saveNewPassword} disabled={loading} style={{ width: "100%", padding: "15px", background: loading ? "#888" : "#1a9e6e", color: "#fff", border: "none", borderRadius: "14px", fontSize: "14px", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", marginTop: "8px" }}>
                {loading ? "⏳ Sauvegarde..." : "💾 Changer le mot de passe"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CONTENU DE LA PAGE DE CONNEXION
// ══════════════════════════════════════════════════════════════════════════
function LoginContent() {
  const router       = useRouter();
  const [username, setUsername]         = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [showReset, setShowReset]       = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [successMsg, setSuccessMsg]     = useState("");

  const auth = getAuth();

  const getEmail = async (u: string): Promise<string> => {
    if (u.includes("@")) return u;
    try {
      const allUsersSnap = await getDocs(collection(db, "siteUsers"));
      const found = allUsersSnap.docs
        .map((d) => d.data())
        .find((x: any) =>
          x.username?.toLowerCase() === u.toLowerCase() ||
          x.nom?.toLowerCase() === u.toLowerCase()
        ) as any;
      if (found?.email) return found.email;
    } catch {}
    return `${u}@millionstore.com`;
  };

  // Tout la logik "tantativ echwe / blokaj" nan yon SÈL transaksyon atomik
  // pou evite ke doub-klik oswa 2 tantativ an menm tan konte de fwa oswa
  // kreye yon blokaj ki pa dwe la.
  const checkBlocked = async (email: string): Promise<boolean> => {
    try {
      const allUsersSnap = await getDocs(collection(db, "siteUsers"));
      const userEntry = allUsersSnap.docs
        .map((d) => d.data())
        .find((u: any) => u.email?.toLowerCase() === email.toLowerCase()) as any;
      if (!userEntry) return false;
      if (userEntry.blockedUntil && new Date(userEntry.blockedUntil) > new Date()) {
        const diff = new Date(userEntry.blockedUntil).getTime() - Date.now();
        const mins = Math.ceil(diff / 60000);
        setError(`🔒 Votre compte est bloqué. Contactez MillionStore.\n(${mins} minute${mins > 1 ? "s" : ""} restante${mins > 1 ? "s" : ""})`);
        return true;
      }
      return false;
    } catch { return false; }
  };

  const recordFailed = async (email: string): Promise<number> => {
    try {
      // Transaksyon Firestore pa aksepte "query" anndan l — se pou sa
      // nou dwe jwenn userId a AVAN nou antre nan runTransaction.
      const allUsersSnap = await getDocs(collection(db, "siteUsers"));
      const userDoc = allUsersSnap.docs.find((d) => d.data().email?.toLowerCase() === email.toLowerCase());
      if (!userDoc) return 1;
      const USER_REF = doc(db, "siteUsers", userDoc.id);

      return await runTransaction(db, async (tx) => {
        const snap = await tx.get(USER_REF);
        if (!snap.exists()) return 1;
        const attempts = (snap.data().loginAttempts ?? 0) + 1;
        const updateData: any = { loginAttempts: attempts };
        if (attempts >= MAX_ATTEMPTS) updateData.blockedUntil = new Date(Date.now() + BLOCK_DURATION_MS).toISOString();
        tx.update(USER_REF, updateData);
        return attempts;
      });
    } catch { return 1; }
  };

  const resetAttempts = async (email: string) => {
    try {
      const allUsersSnap = await getDocs(collection(db, "siteUsers"));
      const userDoc = allUsersSnap.docs.find((d) => d.data().email?.toLowerCase() === email.toLowerCase());
      if (!userDoc) return;
      await updateDoc(doc(db, "siteUsers", userDoc.id), { loginAttempts: 0, blockedUntil: null });
    } catch {}
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // pwoteje kont doub-klik
    setError(""); setSuccessMsg("");
    setLoading(true);
    const email   = await getEmail(username);
    const blocked = await checkBlocked(email);
    if (blocked) { setLoading(false); return; }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await resetAttempts(email);
      router.push("/dashboard");
    } catch (err: any) {
      if (["auth/wrong-password", "auth/invalid-credential", "auth/invalid-login-credentials"].includes(err.code)) {
        const attempts  = await recordFailed(email);
        const remaining = MAX_ATTEMPTS - attempts;
        setError(attempts >= MAX_ATTEMPTS
          ? `🔒 Votre compte est bloqué pendant 1 heure après ${MAX_ATTEMPTS} tentatives. Contactez MillionStore.`
          : `Mot de passe incorrect. ${remaining} tentative${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}.`);
      } else if (err.code === "auth/user-not-found") {
        setError("Utilisateur introuvable.");
      } else if (err.code === "auth/too-many-requests") {
        setError("🔒 Trop de tentatives. Réessayez plus tard.");
      } else {
        setError(`Erreur de connexion : ${err.code}`);
      }
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", padding: "16px" }}>

      {showReset    && <ResetPasswordModal onClose={() => setShowReset(false)} />}
      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onSuccess={() => {
            setSuccessMsg("✅ Votre compte a été créé ! Vous pouvez vous connecter maintenant.");
            setTimeout(() => setSuccessMsg(""), 5000);
          }}
        />
      )}

      {/* Carte principale — fond blanc, contour noir arrondi, comme la maquette */}
      <div style={{ background: "#fff", borderRadius: "36px", width: "100%", maxWidth: "420px", padding: "36px 28px 30px", border: "10px solid #16161f", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ width: "76px", height: "76px", borderRadius: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "10px", overflow: "hidden" }}>
            <img src="https://i.ibb.co/gLmkySCv/ab785ed1481b.jpg" alt="MillionStore" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: "28px", fontWeight: 900, color: "#1a1a2e" }}>
            Million<span style={{ color: "#e63946" }}>Store</span>
          </h1>
          <p style={{ margin: 0, fontSize: "15px", color: "#888" }}>Connectez-vous ou créez un compte</p>
        </div>

        {/* Message de succès après inscription */}
        {successMsg && (
          <div style={{ background: "#e8fdf0", color: "#1a9e6e", padding: "10px 12px", borderRadius: "10px", fontSize: "12px", marginBottom: "16px", textAlign: "center", fontWeight: 700 }}>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ display: "flex", alignItems: "center", background: "#fafafa", border: "1.5px solid #ececec", borderRadius: "16px", padding: "15px 18px", gap: "12px", marginBottom: "14px" }}>
            <span style={{ fontSize: "20px", color: "#1a1a2e" }}>👤</span>
            <input type="text" placeholder="Nom d'utilisateur" value={username} onChange={(e) => setUsername(e.target.value)} required
              style={{ flex: 1, border: "none", background: "transparent", fontSize: "16px", outline: "none", color: "#333", fontFamily: "inherit" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", background: "#fafafa", border: "1.5px solid #ececec", borderRadius: "16px", padding: "15px 18px", gap: "12px", marginBottom: "10px" }}>
            <span style={{ fontSize: "20px", color: "#f2b705" }}>🔒</span>
            <input type={showPassword ? "text" : "password"} placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required
              style={{ flex: 1, border: "none", background: "transparent", fontSize: "16px", outline: "none", color: "#333", fontFamily: "inherit" }} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", padding: 0 }}>
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>

          <div style={{ textAlign: "right", marginBottom: "18px" }}>
            <button type="button" onClick={() => setShowReset(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e63946", fontSize: "15px", fontWeight: 800, fontFamily: "inherit" }}>
              Mot de passe oublié ?
            </button>
          </div>

          {error && (
            <div style={{ margin: "0 0 12px", color: "#e63946", fontSize: "12px", textAlign: "center", background: "#fff0f0", padding: "10px 12px", borderRadius: "10px", lineHeight: 1.5, whiteSpace: "pre-line" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ width: "100%", padding: "17px", background: loading ? "#555" : "#16161f", color: "#fff", border: "none", borderRadius: "18px", fontSize: "16px", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.06em", fontFamily: "inherit" }}>
            {loading ? "Connexion..." : "SE CONNECTER"}
          </button>
        </form>

        {/* Bouton S'inscrire */}
        <button
          onClick={() => setShowRegister(true)}
          style={{ width: "100%", padding: "17px", background: "#e63946", color: "#fff", border: "none", borderRadius: "18px", fontSize: "16px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginTop: "12px" }}
        >
          S'inscrire
        </button>

        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <a href="/" style={{ fontSize: "14px", color: "#999", textDecoration: "none" }}>← Retour à la boutique</a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#f4f4f6" }} />}>
      <LoginContent />
    </Suspense>
  );
}
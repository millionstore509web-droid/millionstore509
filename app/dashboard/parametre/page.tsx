"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getAuth, updatePassword, updateProfile, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════
interface UserProfile {
  nom: string;
  username: string;
  email: string;
  role: "admin" | "staff" | "vendeur";
  photoUrl?: string;
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:   { bg: "#fce8e8", color: "#e63946" },
  staff:   { bg: "#e8f4fd", color: "#1a6fa8" },
  vendeur: { bg: "#e8fdf0", color: "#1a9e6e" },
};

// ── Toast ──────────────────────────────────────────────────────────────────
function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div style={{
      position: "fixed", bottom: "80px", left: "50%",
      transform: "translateX(-50%)", zIndex: 9999,
      background: type === "success" ? "#1a9e6e" : "#e63946",
      color: "#fff", padding: "10px 24px",
      borderRadius: "999px", fontSize: "13px", fontWeight: 700,
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      whiteSpace: "nowrap",
    }}>
      {type === "success" ? "✅" : "❌"} {message}
    </div>
  );
}

// ── Field ──────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = "text", readOnly = false }: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; type?: string; readOnly?: boolean;
}) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>{label}</p>
      <input
        type={type} value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder} readOnly={readOnly}
        style={{
          width: "100%", padding: "12px 14px",
          border: `1.5px solid ${readOnly ? "#f0f0f0" : "#e8e8e8"}`,
          borderRadius: "12px", fontSize: "14px",
          outline: "none", fontFamily: "inherit",
          color: readOnly ? "#aaa" : "#333",
          background: readOnly ? "#fafafa" : "#fff",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PAGE PARAMETRE
// ══════════════════════════════════════════════════════════════════════════
export default function ParametrePage() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [profile, setProfile] = useState<UserProfile>({
    nom: "", username: "", email: user?.email ?? "", role: "staff", photoUrl: "",
  });
  const [loading, setLoading]   = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password section
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass]         = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPass, setSavingPass]   = useState(false);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load profile from Firestore ──────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const uid = user?.uid ?? "default";
        const snap = await getDoc(doc(db, "parametresite", "siteweb"));
        if (snap.exists()) {
          const data = snap.data();
          // Load user-specific profile by uid
          const userProfile = data?.users?.[uid];
          if (userProfile) {
            setProfile({ ...profile, ...userProfile, email: user?.email ?? "" });
          } else {
            // Fallback: use Firebase Auth display name
            setProfile((p) => ({
              ...p,
              nom: user?.displayName ?? "",
              email: user?.email ?? "",
            }));
          }
        }
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  // ── Save profile ─────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!profile.nom.trim()) { showToast("Le nom ne peut pas être vide.", "error"); return; }
    setSavingProfile(true);
    try {
      const uid = user?.uid ?? "default";
      // Update Firestore parametresite/siteweb
      const snap = await getDoc(doc(db, "parametresite", "siteweb"));
      const existing = snap.exists() ? snap.data() : {};
      await setDoc(doc(db, "parametresite", "siteweb"), {
        ...existing,
        users: {
          ...(existing?.users ?? {}),
          [uid]: {
            nom: profile.nom,
            username: profile.username,
            role: profile.role,
            photoUrl: profile.photoUrl ?? "",
            email: user?.email ?? "",
            updatedAt: new Date().toISOString(),
          },
        },
      });
      // Update Firebase Auth display name
      if (user) await updateProfile(user, { displayName: profile.nom });
      showToast("Profil mis à jour!", "success");
    } catch (e) {
      showToast("Erreur lors de la sauvegarde.", "error");
    }
    setSavingProfile(false);
  };

  // ── Change password ──────────────────────────────────────────────────
  const changePassword = async () => {
    if (!currentPass) { showToast("Entrez votre mot de passe actuel.", "error"); return; }
    if (newPass.length < 6) { showToast("Nouveau mot de passe: min. 6 caractères.", "error"); return; }
    if (newPass !== confirmPass) { showToast("Les mots de passe ne correspondent pas.", "error"); return; }

    setSavingPass(true);
    try {
      if (!user || !user.email) throw new Error("Non connecté");
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(user.email, currentPass);
      await reauthenticateWithCredential(user, credential);
      // Update password
      await updatePassword(user, newPass);
      setCurrentPass(""); setNewPass(""); setConfirmPass("");
      showToast("Mot de passe modifié!", "success");
    } catch (e: any) {
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        showToast("Mot de passe actuel incorrect.", "error");
      } else {
        showToast("Erreur. Reconnectez-vous et réessayez.", "error");
      }
    }
    setSavingPass(false);
  };

  const roleC = ROLE_COLORS[profile.role] ?? ROLE_COLORS.staff;
  const initials = profile.nom ? profile.nom.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "?";

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#f5f6fa", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#888", fontSize: "14px" }}>Chargement...</p>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6fa", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "90px" }}>

      {toast && <Toast message={toast.message} type={toast.type} />}

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
              ⚙️ Paramètres
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#888" }}>parametresite / siteweb</p>
          </div>
        </div>
      </header>

      <div style={{ padding: "14px 12px" }}>

        {/* Avatar + role */}
        <div style={{
          background: "#fff", borderRadius: "20px",
          padding: "24px 16px", textAlign: "center",
          marginBottom: "12px",
          boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
        }}>
          {/* Avatar */}
          <div style={{
            width: "72px", height: "72px", borderRadius: "50%",
            background: profile.photoUrl ? "transparent" : "#1a1a2e",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: "26px", fontWeight: 900, color: "#fff",
            marginBottom: "10px", overflow: "hidden",
            border: "3px solid #f0f0f0",
          }}>
            {profile.photoUrl
              ? <img src={profile.photoUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : initials
            }
          </div>

          <p style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: 900, color: "#1a1a2e" }}>
            {profile.nom || "Mon profil"}
          </p>
          <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#888" }}>{user?.email}</p>

          <span style={{
            background: roleC.bg, color: roleC.color,
            padding: "5px 16px", borderRadius: "999px",
            fontSize: "12px", fontWeight: 700,
          }}>
            {profile.role === "admin" ? "👑" : profile.role === "staff" ? "👤" : "🪪"} {profile.role}
          </span>
        </div>

        {/* ── Informations personnelles ────────────────────────────── */}
        <div style={{ background: "#fff", borderRadius: "16px", padding: "16px", marginBottom: "12px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
          <p style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 800, color: "#1a1a2e" }}>
            👤 Informations personnelles
          </p>

          <Field
            label="NOM COMPLET"
            value={profile.nom}
            onChange={(v) => setProfile((p) => ({ ...p, nom: v }))}
            placeholder="Jean Pierre"
          />
          <Field
            label="NOM D'UTILISATEUR"
            value={profile.username}
            onChange={(v) => setProfile((p) => ({ ...p, username: v }))}
            placeholder="jeanpierre"
          />
          <Field
            label="EMAIL"
            value={profile.email}
            readOnly
            placeholder="email@exemple.com"
          />
          <Field
            label="URL PHOTO DE PROFIL (optionnel)"
            value={profile.photoUrl ?? ""}
            onChange={(v) => setProfile((p) => ({ ...p, photoUrl: v }))}
            placeholder="https://..."
          />

          <button onClick={saveProfile} disabled={savingProfile} style={{
            width: "100%", padding: "14px",
            background: savingProfile ? "#888" : "#1a1a2e",
            color: "#fff", border: "none", borderRadius: "12px",
            fontSize: "14px", fontWeight: 800,
            cursor: savingProfile ? "not-allowed" : "pointer",
            fontFamily: "inherit", marginTop: "4px",
          }}>
            {savingProfile ? "⏳ Sauvegarde..." : "💾 Mettre à jour le profil"}
          </button>
        </div>

        {/* ── Changer mot de passe ─────────────────────────────────── */}
        <div style={{ background: "#fff", borderRadius: "16px", padding: "16px", marginBottom: "12px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
          <p style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 800, color: "#1a1a2e" }}>
            🔒 Changer le mot de passe
          </p>

          {/* Current password */}
          <div style={{ marginBottom: "12px" }}>
            <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>MOT DE PASSE ACTUEL</p>
            <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #e8e8e8", borderRadius: "12px", padding: "12px 14px", gap: "10px" }}>
              <input type={showCurrent ? "text" : "password"} value={currentPass} onChange={(e) => setCurrentPass(e.target.value)}
                placeholder="••••••••"
                style={{ flex: 1, border: "none", outline: "none", fontSize: "14px", fontFamily: "inherit", color: "#333", background: "transparent" }} />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", padding: 0 }}>
                {showCurrent ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {/* New password */}
          <div style={{ marginBottom: "12px" }}>
            <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>NOUVEAU MOT DE PASSE</p>
            <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #e8e8e8", borderRadius: "12px", padding: "12px 14px", gap: "10px" }}>
              <input type={showNew ? "text" : "password"} value={newPass} onChange={(e) => setNewPass(e.target.value)}
                placeholder="Min. 6 caractères"
                style={{ flex: 1, border: "none", outline: "none", fontSize: "14px", fontFamily: "inherit", color: "#333", background: "transparent" }} />
              <button type="button" onClick={() => setShowNew(!showNew)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", padding: 0 }}>
                {showNew ? "🙈" : "👁️"}
              </button>
            </div>
            {/* Strength indicator */}
            {newPass && (
              <div style={{ marginTop: "6px" }}>
                <div style={{ height: "4px", borderRadius: "999px", background: "#f0f0f0", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "999px", transition: "width 0.3s",
                    width: newPass.length >= 10 ? "100%" : newPass.length >= 6 ? "60%" : "25%",
                    background: newPass.length >= 10 ? "#1a9e6e" : newPass.length >= 6 ? "#f79f1f" : "#e63946",
                  }} />
                </div>
                <p style={{ margin: "3px 0 0", fontSize: "10px", color: newPass.length >= 10 ? "#1a9e6e" : newPass.length >= 6 ? "#f79f1f" : "#e63946" }}>
                  {newPass.length >= 10 ? "Fort 💪" : newPass.length >= 6 ? "Moyen" : "Trop court"}
                </p>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div style={{ marginBottom: "16px" }}>
            <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.06em" }}>CONFIRMER NOUVEAU MOT DE PASSE</p>
            <div style={{
              display: "flex", alignItems: "center",
              border: `1.5px solid ${confirmPass && confirmPass !== newPass ? "#e63946" : "#e8e8e8"}`,
              borderRadius: "12px", padding: "12px 14px", gap: "10px",
            }}>
              <input type={showConfirm ? "text" : "password"} value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="Répétez le mot de passe"
                style={{ flex: 1, border: "none", outline: "none", fontSize: "14px", fontFamily: "inherit", color: "#333", background: "transparent" }} />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", padding: 0 }}>
                {showConfirm ? "🙈" : "👁️"}
              </button>
            </div>
            {confirmPass && confirmPass !== newPass && (
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#e63946" }}>❌ Les mots de passe ne correspondent pas</p>
            )}
            {confirmPass && confirmPass === newPass && (
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#1a9e6e" }}>✅ Les mots de passe correspondent</p>
            )}
          </div>

          <button onClick={changePassword} disabled={savingPass} style={{
            width: "100%", padding: "14px",
            background: savingPass ? "#888" : "#e63946",
            color: "#fff", border: "none", borderRadius: "12px",
            fontSize: "14px", fontWeight: 800,
            cursor: savingPass ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}>
            {savingPass ? "⏳ Modification..." : "🔒 Changer le mot de passe"}
          </button>
        </div>

        {/* ── Déconnexion ──────────────────────────────────────────── */}
        <div style={{ background: "#fff", borderRadius: "16px", padding: "16px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
          <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 800, color: "#1a1a2e" }}>
            🚪 Session
          </p>
          <button onClick={async () => {
            try { await auth.signOut(); router.push("/login"); } catch { router.push("/login"); }
          }} style={{
            width: "100%", padding: "14px",
            background: "#fff0f0", color: "#e63946",
            border: "1.5px solid #fdd", borderRadius: "12px",
            fontSize: "14px", fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            🚪 Se déconnecter
          </button>
        </div>
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
          { icon: "🏠", label: "Boutique",  action: () => router.push("/"),          color: "#333"    },
          { icon: "⚡", label: "Dashboard", action: () => router.push("/dashboard"), color: "#e63946" },
          { icon: "⚙️", label: "Paramètres",action: () => {},                        color: "#1a1a2e" },
        ].map(({ icon, label, action, color }) => (
          <button key={label} onClick={action} style={{
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
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
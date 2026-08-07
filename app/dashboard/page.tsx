"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════
interface SectionPermission {
  voir: boolean;
  ajouter: boolean;
  modifier: boolean;
  supprimer: boolean;
}
interface Permissions {
  rapports:      SectionPermission;
  parametre:     SectionPermission;
  utilisateurs:  SectionPermission;
  vendeurs:      SectionPermission;
  commandes:     SectionPermission;
  modifierSite:  SectionPermission;
  produits:      SectionPermission;
}
interface UserData {
  nom: string;
  role: "admin" | "staff" | "vendeur";
  permissions: Permissions;
}

// ══════════════════════════════════════════════════════════════════════════
// SVG ICONS
// ══════════════════════════════════════════════════════════════════════════
function IconRapports() {
  return (
    <svg width="38" height="38" viewBox="0 0 64 64" fill="none">
      <rect x="10" y="30" width="12" height="28" rx="3" fill="#e63946"/>
      <rect x="26" y="16" width="12" height="42" rx="3" fill="#e63946"/>
      <rect x="42" y="22" width="12" height="36" rx="3" fill="#e63946" opacity="0.7"/>
    </svg>
  );
}
function IconParametre() {
  return (
    <svg width="38" height="38" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="10" fill="#bbb"/>
      <path d="M32 8l3 6.5L42 12l-2.5 6.5 6.5 1.5-5 5 2.5 6-6.5-2L32 54l-4.5-25-6.5 2 2.5-6-5-5 6.5-1.5L22 12l7 2.5L32 8z" fill="#aaa"/>
      <circle cx="32" cy="32" r="6" fill="#ccc"/>
    </svg>
  );
}
function IconUtilisateur() {
  return (
    <svg width="38" height="38" viewBox="0 0 72 64" fill="none">
      <rect x="4" y="26" width="16" height="5" rx="2.5" fill="#00897b"/>
      <rect x="9.5" y="20.5" width="5" height="16" rx="2.5" fill="#00897b"/>
      <circle cx="44" cy="18" r="12" fill="#00897b"/>
      <path d="M20 58c0-13.25 10.75-24 24-24s24 10.75 24 24" fill="#00897b"/>
    </svg>
  );
}
function IconVendeurs() {
  return (
    <svg width="38" height="38" viewBox="0 0 64 64" fill="none">
      <rect x="8" y="16" width="48" height="36" rx="7" fill="#3b4dd4"/>
      <rect x="29" y="4" width="6" height="14" rx="3" fill="#5060e8"/>
      <circle cx="26" cy="30" r="6" fill="#fff" opacity="0.9"/>
      <path d="M14 48c0-6.63 5.37-12 12-12" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.9"/>
      <rect x="36" y="26" width="14" height="3" rx="1.5" fill="#fff" opacity="0.7"/>
      <rect x="36" y="33" width="10" height="3" rx="1.5" fill="#fff" opacity="0.5"/>
    </svg>
  );
}
function IconCommandes() {
  return (
    <svg width="38" height="38" viewBox="0 0 64 64" fill="none">
      <rect x="10" y="10" width="44" height="44" rx="8" fill="#f79f1f" opacity="0.15"/>
      <rect x="10" y="10" width="44" height="44" rx="8" stroke="#f79f1f" strokeWidth="3" fill="none"/>
      <rect x="18" y="22" width="28" height="3" rx="1.5" fill="#f79f1f"/>
      <rect x="18" y="30" width="20" height="3" rx="1.5" fill="#f79f1f"/>
      <rect x="18" y="38" width="24" height="3" rx="1.5" fill="#f79f1f"/>
    </svg>
  );
}
function IconModifierSite() {
  return (
    <svg width="38" height="38" viewBox="0 0 64 64" fill="none">
      <rect x="6" y="10" width="52" height="38" rx="7" fill="#7c3aed" opacity="0.12"/>
      <rect x="6" y="10" width="52" height="38" rx="7" stroke="#7c3aed" strokeWidth="3" fill="none"/>
      <rect x="6" y="10" width="52" height="11" rx="7" fill="#7c3aed" opacity="0.25"/>
      <circle cx="16" cy="16" r="2.5" fill="#7c3aed"/>
      <circle cx="24" cy="16" r="2.5" fill="#7c3aed" opacity="0.6"/>
      <circle cx="32" cy="16" r="2.5" fill="#7c3aed" opacity="0.3"/>
      <path d="M36 38l10-10-4-4-10 10v4h4z" fill="#7c3aed"/>
      <path d="M44 26l2-2a2 2 0 0 0-3-3l-2 2 3 3z" fill="#7c3aed"/>
    </svg>
  );
}
function IconProduits() {
  return (
    <svg width="38" height="38" viewBox="0 0 64 64" fill="none">
      <rect x="8" y="20" width="48" height="34" rx="7" fill="#f59e0b" opacity="0.15"/>
      <rect x="8" y="20" width="48" height="34" rx="7" stroke="#f59e0b" strokeWidth="3" fill="none"/>
      <path d="M22 20v-4a10 10 0 0 1 20 0v4" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="32" cy="36" r="5" fill="#f59e0b" opacity="0.7"/>
    </svg>
  );
}

function IconInformation() {
  return (
    <svg width="38" height="38" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="26" fill="#1565C0" opacity="0.12"/>
      <circle cx="32" cy="32" r="26" stroke="#1565C0" strokeWidth="3" fill="none"/>
      <circle cx="32" cy="20" r="3.5" fill="#1565C0"/>
      <rect x="28" y="28" width="8" height="20" rx="3" fill="#1565C0"/>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CARD CONFIG
// ══════════════════════════════════════════════════════════════════════════
const ALL_CARDS = [
  { id: "rapports",      permKey: "rapports"      as keyof Permissions, icon: <IconRapports />,     label: "Rapports",      href: "/dashboard/rapports"      },
  { id: "commandes",     permKey: "commandes"     as keyof Permissions, icon: <IconCommandes />,    label: "Commandes",     href: "/dashboard/commandes"     },
  { id: "produits",      permKey: "produits"      as keyof Permissions, icon: <IconProduits />,     label: "Produits",      href: "/dashboard/produits"      },
  { id: "vendeurs",      permKey: "vendeurs"      as keyof Permissions, icon: <IconVendeurs />,     label: "Vendeurs",      href: "/dashboard/vendeurs"      },
  { id: "utilisateur",   permKey: "utilisateurs"  as keyof Permissions, icon: <IconUtilisateur />,  label: "Utilisateur",   href: "/dashboard/utilisateurs"  },
  { id: "modifier-site", permKey: "modifierSite"  as keyof Permissions, icon: <IconModifierSite />, label: "Modifier Site", href: "/dashboard/modifier-site" },
  { id: "parametre",     permKey: "parametre"     as keyof Permissions, icon: <IconParametre />,    label: "Paramètre",     href: "/dashboard/parametre"     },
  { id: "information",   permKey: null,            icon: <IconInformation />,  label: "Information",   href: "/dashboard/information"   },
];

// ── Yon seksyon vizib si itilizatè a gen omwen "voir" ────────────────────
function hasAccess(perms: Permissions, key: keyof Permissions | null): boolean {
  if (key === null) return true;
  return perms[key]?.voir === true;
}

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD PAGE
// ══════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const router = useRouter();
  const [userData, setUserData]     = useState<UserData | null>(null);
  const [loading, setLoading]       = useState(true);
  // "found" distingue 2 ka byen diferan pou userData === null :
  //   - loading fini + profileFound === false → kont Auth egziste men okenn
  //     pwofil pa jwenn nan Firestore (kont "kase" oswa Google login kliyan)
  //   - loading fini + profileFound === true  → tout bon, pwofil chaje
  const [profileFound, setProfileFound] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "siteUsers", firebaseUser.uid));
        const found = snap.exists() ? (snap.data() as UserData) : undefined;
        if (found) {
          setUserData(found);
          setProfileFound(true);
        } else {
          // Itilizatè Firebase egziste men pa gen pwofil nan Firestore
          // (Google login kliyan, oswa yon ansyen kont "kase" ki chape).
          setUserData(null);
          setProfileFound(false);
        }
      } catch {
        setUserData(null);
        setProfileFound(false);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  // Filtre kat yo selon permissions
  const visibleCards = userData
    ? ALL_CARDS.filter((c) => hasAccess(userData.permissions, c.permKey))
    : [];

  // Salitasyon selon lè
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : "Bonsoir";

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#fdf0ee", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "40px", height: "40px", border: "4px solid #e63946", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <p style={{ color: "#999", fontSize: "13px" }}>Chargement...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Kont konekte men OKENN pwofil pa jwenn nan Firestore ──
  // Sa a se pi souvan yon kont "kase" (kreye pandan yon echèk pasaje) —
  // pa yon moun ki tout bon pa gen aksè. Yo dwe kontakte yon admin,
  // pa wè yon mesaj konfizan tankou "Bonsoir Admin".
  if (!profileFound) {
    return (
      <div style={{ minHeight: "100vh", background: "#fdf0ee", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", padding: "20px" }}>
        <div style={{ background: "#fff", borderRadius: "20px", padding: "32px 24px", textAlign: "center", maxWidth: "360px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
          <p style={{ fontSize: "40px", margin: "0 0 12px" }}>⚠️</p>
          <h2 style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 900, color: "#1a1a2e" }}>Pwofil ou pa konplè</h2>
          <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#888", lineHeight: 1.5 }}>
            Kont ou konekte, men nou pa jwenn pwofil ou nan sistèm nan. Kontakte yon administratè MillionStore pou rezoud sa.
          </p>
          <button
            onClick={() => { getAuth().signOut(); router.push("/login"); }}
            style={{ width: "100%", padding: "13px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "12px", fontSize: "14px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
          >
            🚪 Deconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fdf0ee", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "64px", display: "flex", flexDirection: "column", alignItems: "center" }}>

      {/* ── Header ── */}
      <header style={{ background: "#fff", borderBottom: "1px solid #f0e8e6", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", position: "sticky", top: 0, zIndex: 100, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "8px", overflow: "hidden", background: "#1a1a2e", flexShrink: 0 }}>
            <img src="https://i.ibb.co/gLmkySCv/ab785ed1481b.jpg" alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: "15px", fontWeight: 900, color: "#1a1a2e", lineHeight: 1 }}>
              Million<span style={{ color: "#e63946" }}>Store</span>
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#888" }}>
              {`Espace ${userData!.role.charAt(0).toUpperCase() + userData!.role.slice(1)}`}
            </p>
          </div>
        </div>
        <button
          onClick={() => { getAuth().signOut(); router.push("/login"); }}
          style={{ background: "#fff0ef", border: "1.5px solid #f0ddd9", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, color: "#e63946", cursor: "pointer", fontFamily: "inherit" }}
        >
          🚪 Deconnecter
        </button>
      </header>

      {/* ── Welcome ── */}
      <div style={{ padding: "14px 16px 8px", width: "100%", maxWidth: "400px" }}>
        <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 900, color: "#1a1a2e" }}>
          {greeting}, {userData!.nom?.split(" ")[0] || "Utilisateur"} 👋
        </h2>
        <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#999" }}>
          {visibleCards.length > 0
            ? `vous avez accès à ${visibleCards.length} section.`
            : "Vous n'avez accès à aucune section pour le moment."}
        </p>

        {/* Role badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "8px", background: userData!.role === "admin" ? "#fce8e8" : userData!.role === "vendeur" ? "#e8fdf0" : "#e8f4fd", borderRadius: "999px", padding: "4px 12px" }}>
          <span style={{ fontSize: "12px" }}>{userData!.role === "admin" ? "👑" : userData!.role === "vendeur" ? "🪪" : "👤"}</span>
          <span style={{ fontSize: "11px", fontWeight: 700, color: userData!.role === "admin" ? "#e63946" : userData!.role === "vendeur" ? "#1a9e6e" : "#1a6fa8" }}>
            {userData!.role.charAt(0).toUpperCase() + userData!.role.slice(1)}
          </span>
        </div>
      </div>

      {/* ── Cards ── */}
      {visibleCards.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#bbb" }}>
          <p style={{ fontSize: "40px", margin: "0 0 10px" }}>🔒</p>
          <p style={{ fontSize: "14px", fontWeight: 700, color: "#aaa" }}>Okenn aksè disponible</p>
          <p style={{ fontSize: "12px", color: "#ccc" }}>contacter Millionstore pour permissions.</p>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: visibleCards.length === 1 ? "1fr" : "repeat(2, 1fr)",
          gap: "10px",
          padding: "4px 0 16px",
          justifyContent: "center",
          width: "100%",
          maxWidth: "340px",
        }}>
          {visibleCards.map((card) => (
            <button
              key={card.id}
              onClick={() => router.push(card.href)}
              style={{ background: "#fff", border: "none", borderRadius: "18px", padding: "28px 16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "14px", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", fontFamily: "inherit", transition: "transform 0.12s, box-shadow 0.12s", width: "auto", height: "auto" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.03)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.12)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)"; }}
              onTouchStart={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
              onTouchEnd={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
            >
              {card.icon}
              <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#1a1a2e", textAlign: "center", lineHeight: 1.2 }}>
                {card.label}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* ── Bottom bar ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #f0e8e6", display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 0 10px", boxShadow: "0 -2px 10px rgba(0,0,0,0.06)", zIndex: 100 }}>
        {[
          { icon: "🏠", label: "Boutik",    action: () => router.push("/"),           color: "#333"    },
          { icon: "⚡", label: "Dashboard", action: () => router.push("/dashboard"),  color: "#e63946" },
          { icon: "⚙️", label: "Paramèt",  action: () => router.push("/dashboard/parametre"), color: "#333" },
        ].map(({ icon, label, action, color }) => (
          <button key={label} onClick={action} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", fontFamily: "inherit" }}>
            <span style={{ fontSize: "20px" }}>{icon}</span>
            <span style={{ fontSize: "10px", color, fontWeight: 600 }}>{label}</span>
          </button>
        ))}
      </div>

      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
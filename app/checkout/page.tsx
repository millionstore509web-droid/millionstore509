"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ── Types ──────────────────────────────────────────────────────────────────
interface PaymentMethod {
  id: string;
  name: string;
  subtitle: string;
  bgColor: string;
  textColor: string;
  initial: string;
  isImage?: boolean;
  imageUrl?: string;
}

const METHODS: PaymentMethod[] = [
  {
    id: "moncash",
    name: "MonCash",
    subtitle: "Payer avec MonCash",
    bgColor: "#e63946",
    textColor: "#fff",
    initial: "M",
  },
  {
    id: "natcash",
    name: "NatCash",
    subtitle: "Payer avec NatCash",
    bgColor: "#1a3a8f",
    textColor: "#fff",
    initial: "N",
  },
  {
    id: "banque",
    name: "Virement Bancaire",
    subtitle: "BNC, Sogebank, BUH, UNIBANK",
    bgColor: "#2d6a4f",
    textColor: "#fff",
    initial: "🏦",
    isImage: false,
  },
];

// ── MonCash Detail Sheet ───────────────────────────────────────────────────
function MonCashSheet({ amount, productName, onClose, onConfirm }: {
  amount: number; productName: string; onClose: () => void; onConfirm: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const phone = "38083793";

  const copy = () => {
    navigator.clipboard?.writeText(phone).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "24px 24px 0 0",
        width: "100%", maxWidth: "480px",
        padding: "0 0 40px", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "50%",
              background: "#e63946", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: "22px", fontWeight: 900, color: "#fff", flexShrink: 0,
            }}>M</div>
            <div>
              <p style={{ margin: 0, fontSize: "17px", fontWeight: 900, color: "#1a1a2e" }}>MonCash</p>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888" }}>Instructions de paiement</p>
            </div>
            <button onClick={onClose} style={{
              marginLeft: "auto", width: "32px", height: "32px", borderRadius: "50%",
              background: "#f1f1f1", border: "none", fontSize: "16px",
              cursor: "pointer", flexShrink: 0,
            }}>×</button>
          </div>

          <div style={{
            background: "#fff5f5", border: "1.5px solid #fdd",
            borderRadius: "16px", padding: "16px", textAlign: "center", marginBottom: "16px",
          }}>
            <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#888" }}>Montant à envoyer</p>
            <p style={{ margin: 0, fontSize: "34px", fontWeight: 900, color: "#e63946" }}>
              ${amount.toLocaleString()}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#888" }}>{productName}</p>
          </div>

          <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800, color: "#888", letterSpacing: "0.06em" }}>
            ENVOYER AU NUMÉRO
          </p>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#f8f8f8", border: "1.5px solid #e8e8e8",
            borderRadius: "14px", padding: "14px 16px", marginBottom: "20px",
          }}>
            <div>
              <p style={{ margin: 0, fontSize: "22px", fontWeight: 900, color: "#1a1a2e", letterSpacing: "0.05em" }}>
                +509 {phone}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#888" }}>Compte MonCash - Cesar Bernadin</p>
            </div>
            <button onClick={copy} style={{
              background: copied ? "#1a9e6e" : "#1a1a2e",
              color: "#fff", border: "none", borderRadius: "10px",
              padding: "9px 14px", fontSize: "12px", fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.2s",
            }}>
              {copied ? "✓ Copié" : "📋 Copier"}
            </button>
          </div>

          <div style={{ background: "#f8f9fa", borderRadius: "14px", padding: "14px", marginBottom: "20px" }}>
            {[
              "Ouvrez votre app MonCash",
              `Envoyez $${amount.toLocaleString()} au +509 ${phone}`,
              "Revenez ici et confirmez",
              "Nous vérifions et vous contactons",
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: i < 3 ? "12px" : 0 }}>
                <div style={{
                  width: "24px", height: "24px", borderRadius: "50%",
                  background: "#e63946", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "12px", fontWeight: 800, flexShrink: 0,
                }}>{i + 1}</div>
                <p style={{ margin: 0, fontSize: "13px", color: "#444", lineHeight: 1.5 }}>{step}</p>
              </div>
            ))}
          </div>

          <button onClick={onConfirm} style={{
            width: "100%", padding: "16px",
            background: "#e63946", color: "#fff",
            border: "none", borderRadius: "14px",
            fontSize: "15px", fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            ✅ J'ai effectué le paiement
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NatCash Detail Sheet ───────────────────────────────────────────────────
function NatCashSheet({ amount, productName, onClose, onConfirm }: {
  amount: number; productName: string; onClose: () => void; onConfirm: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const phone = "35071099";

  const copy = () => {
    navigator.clipboard?.writeText(phone).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "24px 24px 0 0",
        width: "100%", maxWidth: "480px",
        padding: "0 0 40px", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "50%",
              background: "#1a3a8f", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: "22px", fontWeight: 900, color: "#fff", flexShrink: 0,
            }}>N</div>
            <div>
              <p style={{ margin: 0, fontSize: "17px", fontWeight: 900, color: "#1a1a2e" }}>NatCash</p>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888" }}>Instructions de paiement</p>
            </div>
            <button onClick={onClose} style={{
              marginLeft: "auto", width: "32px", height: "32px", borderRadius: "50%",
              background: "#f1f1f1", border: "none", fontSize: "16px",
              cursor: "pointer", flexShrink: 0,
            }}>×</button>
          </div>

          <div style={{
            background: "#f0f4ff", border: "1.5px solid #c7d7ff",
            borderRadius: "16px", padding: "16px", textAlign: "center", marginBottom: "16px",
          }}>
            <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#888" }}>Montant à envoyer</p>
            <p style={{ margin: 0, fontSize: "34px", fontWeight: 900, color: "#1a3a8f" }}>
              ${amount.toLocaleString()}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#888" }}>{productName}</p>
          </div>

          <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800, color: "#888", letterSpacing: "0.06em" }}>
            ENVOYER AU NUMÉRO
          </p>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#f8f8f8", border: "1.5px solid #e8e8e8",
            borderRadius: "14px", padding: "14px 16px", marginBottom: "20px",
          }}>
            <div>
              <p style={{ margin: 0, fontSize: "22px", fontWeight: 900, color: "#1a1a2e", letterSpacing: "0.05em" }}>
                +509 {phone}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#888" }}>Compte NatCash - Cesar Bernadin</p>
            </div>
            <button onClick={copy} style={{
              background: copied ? "#1a9e6e" : "#1a3a8f",
              color: "#fff", border: "none", borderRadius: "10px",
              padding: "9px 14px", fontSize: "12px", fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.2s",
            }}>
              {copied ? "✓ Copié" : "📋 Copier"}
            </button>
          </div>

          <div style={{ background: "#f8f9fa", borderRadius: "14px", padding: "14px", marginBottom: "20px" }}>
            {[
              "Ouvrez votre app NatCash",
              `Envoyez $${amount.toLocaleString()} au +509 ${phone}`,
              "Revenez ici et confirmez",
              "Nous vérifions et vous contactons",
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: i < 3 ? "12px" : 0 }}>
                <div style={{
                  width: "24px", height: "24px", borderRadius: "50%",
                  background: "#1a3a8f", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "12px", fontWeight: 800, flexShrink: 0,
                }}>{i + 1}</div>
                <p style={{ margin: 0, fontSize: "13px", color: "#444", lineHeight: 1.5 }}>{step}</p>
              </div>
            ))}
          </div>

          <button onClick={onConfirm} style={{
            width: "100%", padding: "16px",
            background: "#1a3a8f", color: "#fff",
            border: "none", borderRadius: "14px",
            fontSize: "15px", fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            ✅ J'ai effectué le paiement
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Banque Detail Sheet ────────────────────────────────────────────────────
type BankKey = "BNC" | "Sogebank" | "BUH" | "UNIBANK";

function BanqueSheet({ amount, productName, onClose, onConfirm }: {
  amount: number; productName: string; onClose: () => void; onConfirm: () => void;
}) {
  const [selectedBank, setSelectedBank] = useState<BankKey>("BNC");
  const [selectedCurrency, setSelectedCurrency] = useState<"gourde" | "dollar">("gourde");
  const [copied, setCopied] = useState(false);

  const banks: Record<BankKey, { name: string; titulaire: string; gourde: string; dollar: string }> = {
    BNC:      { name: "BNC - Banque Nationale de Crédit",   titulaire: "Christian Hotes", gourde: "27100 22696",        dollar: "27110 08200"        },
    Sogebank: { name: "SOGEBANK",                           titulaire: "Cesar Bernadin",  gourde: "140 129 875 5",      dollar: "141 113 489 1"      },
    BUH:      { name: "BUH - Banque de l'Union Haïtienne",  titulaire: "Christian Hotes", gourde: "310000 17984",       dollar: "310000 17992"       },
    UNIBANK:  { name: "UNIBANK",                            titulaire: "Cesar Bernadin",  gourde: "1802 0152 4191 238", dollar: "1832 0163 1763 967" },
  };

  const copy = () => {
    navigator.clipboard?.writeText(banks[selectedBank][selectedCurrency]).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "24px 24px 0 0",
        width: "100%", maxWidth: "480px",
        padding: "0 0 40px", maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "50%",
              background: "#2d6a4f", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: "22px", flexShrink: 0,
            }}>🏦</div>
            <div>
              <p style={{ margin: 0, fontSize: "17px", fontWeight: 900, color: "#1a1a2e" }}>Virement Bancaire</p>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888" }}>Choisissez votre banque</p>
            </div>
            <button onClick={onClose} style={{
              marginLeft: "auto", width: "32px", height: "32px", borderRadius: "50%",
              background: "#f1f1f1", border: "none", fontSize: "16px",
              cursor: "pointer", flexShrink: 0,
            }}>×</button>
          </div>

          <div style={{
            background: "#f0faf5", border: "1.5px solid #b7e4c7",
            borderRadius: "16px", padding: "16px", textAlign: "center", marginBottom: "16px",
          }}>
            <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#888" }}>Montant à virer</p>
            <p style={{ margin: 0, fontSize: "34px", fontWeight: 900, color: "#2d6a4f" }}>
              ${amount.toLocaleString()}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#888" }}>{productName}</p>
          </div>

          <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800, color: "#888", letterSpacing: "0.06em" }}>
            SÉLECTIONNEZ VOTRE BANQUE
          </p>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            {(Object.keys(banks) as BankKey[]).map((b) => (
              <button key={b} onClick={() => setSelectedBank(b)} style={{
                padding: "8px 14px", borderRadius: "10px",
                border: `1.5px solid ${selectedBank === b ? "#2d6a4f" : "#e0e0e0"}`,
                background: selectedBank === b ? "#f0faf5" : "#fff",
                color: selectedBank === b ? "#2d6a4f" : "#888",
                fontSize: "13px", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}>{b}</button>
            ))}
          </div>

          <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800, color: "#888", letterSpacing: "0.06em" }}>
            DEVISE
          </p>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {(["gourde", "dollar"] as const).map((cur) => (
              <button key={cur} onClick={() => setSelectedCurrency(cur)} style={{
                padding: "6px 14px", borderRadius: "10px",
                border: `1.5px solid ${selectedCurrency === cur ? "#2d6a4f" : "#e0e0e0"}`,
                background: selectedCurrency === cur ? "#f0faf5" : "#fff",
                color: selectedCurrency === cur ? "#2d6a4f" : "#888",
                fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>{cur === "gourde" ? "🇭🇹 Gourde" : "🇺🇸 Dollar"}</button>
            ))}
          </div>

          <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800, color: "#888", letterSpacing: "0.06em" }}>
            NUMÉRO DE COMPTE
          </p>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#f8f8f8", border: "1.5px solid #e8e8e8",
            borderRadius: "14px", padding: "14px 16px", marginBottom: "20px",
          }}>
            <div>
              <p style={{ margin: 0, fontSize: "20px", fontWeight: 900, color: "#1a1a2e", letterSpacing: "0.06em" }}>
                {banks[selectedBank][selectedCurrency]}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#888" }}>
                {banks[selectedBank].name} — {banks[selectedBank].titulaire}
              </p>
            </div>
            <button onClick={copy} style={{
              background: copied ? "#1a9e6e" : "#2d6a4f",
              color: "#fff", border: "none", borderRadius: "10px",
              padding: "9px 14px", fontSize: "12px", fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              {copied ? "✓ Copié" : "📋 Copier"}
            </button>
          </div>

          <div style={{ background: "#f8f9fa", borderRadius: "14px", padding: "14px", marginBottom: "20px" }}>
            {[
              `Allez à votre banque ou app ${selectedBank}`,
              `Effectuez le virement de $${amount.toLocaleString()} au compte ci-dessus`,
              "Gardez votre reçu de transaction",
              "Revenez ici et confirmez avec votre reçu",
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: i < 3 ? "12px" : 0 }}>
                <div style={{
                  width: "24px", height: "24px", borderRadius: "50%",
                  background: "#2d6a4f", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "12px", fontWeight: 800, flexShrink: 0,
                }}>{i + 1}</div>
                <p style={{ margin: 0, fontSize: "13px", color: "#444", lineHeight: 1.5 }}>{step}</p>
              </div>
            ))}
          </div>

          <button onClick={onConfirm} style={{
            width: "100%", padding: "16px",
            background: "#2d6a4f", color: "#fff",
            border: "none", borderRadius: "14px",
            fontSize: "15px", fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            ✅ J'ai effectué le virement
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirmation Screen ────────────────────────────────────────────────────
function ConfirmationScreen({ productName, method, onClose }: {
  productName: string; method: string; onClose: () => void;
}) {
  const auth = getAuth();
  const user = auth.currentUser;
  const [tel, setTel] = useState("");
  const [adresse, setAdresse] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    try {
      await addDoc(collection(db, "profils_clients"), {
        uid: user.uid, email: user.email, nom: user.displayName,
        tel: tel.trim(), adresse: adresse.trim(),
        updatedAt: new Date().toISOString(),
      });
      setSaved(true);
    } catch (e) { console.error(e); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    border: "1.5px solid #e8e8e8", borderRadius: "12px",
    fontSize: "14px", outline: "none",
    fontFamily: "inherit", color: "#333",
    boxSizing: "border-box", background: "#f8f8f8",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "40px" }}>
      <div style={{ background: "#1a1a2e", padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "8px", overflow: "hidden", background: "#fff" }}>
          <img src="https://i.ibb.co/gLmkySCv/ab785ed1481b.jpg" alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <p style={{ margin: 0, fontSize: "16px", fontWeight: 900, color: "#fff" }}>
          Million<span style={{ color: "#e63946" }}>Store</span>
        </p>
      </div>
      <div style={{ padding: "16px" }}>
        <div style={{ background: "#e8fdf0", borderRadius: "16px", padding: "16px", marginBottom: "16px", textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontSize: "32px" }}>✅</p>
          <p style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 900, color: "#1a9e6e" }}>Paiement soumis!</p>
          <p style={{ margin: 0, fontSize: "12px", color: "#555" }}>
            <strong>{productName}</strong> via <strong>{method}</strong> — en attente de vérification.
          </p>
        </div>
        <div style={{ background: "#fff", borderRadius: "16px", padding: "16px", marginBottom: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px", paddingBottom: "14px", borderBottom: "1px solid #f0f0f0" }}>
            {user?.photoURL && <img src={user.photoURL} alt="avatar" style={{ width: "48px", height: "48px", borderRadius: "50%", flexShrink: 0 }} />}
            <div>
              <p style={{ margin: "0 0 2px", fontSize: "15px", fontWeight: 800, color: "#1a1a2e" }}>{user?.displayName}</p>
              <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#888" }}>{user?.email}</p>
              <span style={{ background: "#e8fdf0", color: "#1a9e6e", fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px" }}>✅ Client vérifié via Google</span>
            </div>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: 800, color: "#1a1a2e" }}>📋 Mon Profil</p>
          <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888" }}>👤 Nom complet</p>
          <input value={user?.displayName ?? ""} disabled style={{ ...inputStyle, marginBottom: "10px", opacity: 0.7 }} />
          <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888" }}>📞 Téléphone</p>
          <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="+509 XXXX XXXX" style={{ ...inputStyle, marginBottom: "10px" }} />
          <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: "#888" }}>📍 Adresse de livraison</p>
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Delmas 33, Port-au-Prince..." style={{ ...inputStyle, marginBottom: "14px" }} />
          <button onClick={handleSave} disabled={saved} style={{
            width: "100%", padding: "13px",
            background: saved ? "#1a9e6e" : "#1a1a2e", color: "#fff",
            border: "none", borderRadius: "12px", fontSize: "14px", fontWeight: 800,
            cursor: saved ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>{saved ? "✅ Profil sauvegardé!" : "💾 Sauvegarder"}</button>
        </div>
        <a href="/mes-commandes" style={{
          display: "flex", alignItems: "center", gap: "10px",
          background: "#fff", borderRadius: "16px", padding: "14px 16px",
          textDecoration: "none", marginBottom: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <span style={{ fontSize: "22px" }}>🛍️</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#1a1a2e" }}>Mes Commandes</p>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#888" }}>Voir l'état de vos commandes</p>
          </div>
          <span style={{ color: "#ccc", fontSize: "18px" }}>›</span>
        </a>
        <div style={{ background: "#fff", borderRadius: "16px", padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <p style={{ margin: "0 0 12px", fontSize: "13px", fontWeight: 800, color: "#1a1a2e" }}>⚡ Actions rapides</p>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={onClose} style={{
              flex: 1, padding: "12px", background: "#1a1a2e", color: "#fff",
              border: "none", borderRadius: "12px", fontSize: "13px", fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>🛒 Retourner à la boutique</button>
            <a href="https://wa.me/50938083793" target="_blank" rel="noopener noreferrer" style={{
              flex: 1, padding: "12px", background: "#25D366", color: "#fff",
              borderRadius: "12px", textDecoration: "none", fontSize: "13px", fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            }}>💬 Contacter MillionStore</a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CHECKOUT CONTENT — separe pou Suspense ka travay
// ══════════════════════════════════════════════════════════════════════════
function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const productName  = searchParams.get("product")  ?? "Produit";
  const productPrice = Number(searchParams.get("price") ?? 0);
  const productId    = searchParams.get("id") ?? "";

  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [showHowTo, setShowHowTo]     = useState(true);
  const [confirmed, setConfirmed]     = useState(false);
  const [confirmedMethod, setConfirmedMethod] = useState("");

  const handleConfirm = async (methodName: string) => {
    const auth = getAuth();
    const user = auth.currentUser;

    const adminRef = await addDoc(collection(db, "commandes"), {
      nomClient: user?.displayName ?? "Anonyme",
      email:     user?.email ?? "",
      telephone: "",
      produit:   productName,
      produitId: productId,
      prix:      productPrice,
      methode:   methodName,
      statut:    "en_attente",
      uid:       user?.uid ?? "anonyme",
      createdAt: new Date(),
    });

    await addDoc(collection(db, "commandes_clients"), {
      productId:   productId,
      productName: productName,
      price:       productPrice,
      method:      methodName,
      status:      "en_attente",
      uid:         user?.uid ?? "anonyme",
      email:       user?.email ?? "",
      displayName: user?.displayName ?? "",
      commandeId:  adminRef.id,
      createdAt:   new Date().toISOString(),
    });

    setActiveSheet(null);
    setConfirmedMethod(methodName);
    setConfirmed(true);
  };

  if (confirmed) {
    return <ConfirmationScreen productName={productName} method={confirmedMethod} onClose={() => router.push("/")} />;
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#fff",
      fontFamily: "'Segoe UI', sans-serif", paddingBottom: "40px",
      maxWidth: "480px", margin: "0 auto",
    }}>
      {activeSheet === "moncash" && (
        <MonCashSheet amount={productPrice} productName={productName}
          onClose={() => setActiveSheet(null)} onConfirm={() => handleConfirm("MonCash")} />
      )}
      {activeSheet === "natcash" && (
        <NatCashSheet amount={productPrice} productName={productName}
          onClose={() => setActiveSheet(null)} onConfirm={() => handleConfirm("NatCash")} />
      )}
      {activeSheet === "banque" && (
        <BanqueSheet amount={productPrice} productName={productName}
          onClose={() => setActiveSheet(null)} onConfirm={() => handleConfirm("Virement Bancaire")} />
      )}

      <header style={{
        background: "#fff", borderBottom: "1px solid #eee",
        padding: "10px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "9px", overflow: "hidden", background: "#f0f0f0", flexShrink: 0 }}>
            <img src="https://i.ibb.co/gLmkySCv/ab785ed1481b.jpg" alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#1a1a2e", lineHeight: 1 }}>
              Million<span style={{ color: "#e63946" }}>Store</span>
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#2ecc71" }}>🟢 En ligne</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span style={{ fontSize: "20px" }}>✅</span>
            <span style={{ fontSize: "10px", color: "#666" }}>Compte</span>
          </button>
          <button style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span style={{ fontSize: "20px" }}>🛒</span>
            <span style={{ fontSize: "10px", color: "#666" }}>Panier</span>
          </button>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span style={{ fontSize: "20px" }}>✕</span>
            <span style={{ fontSize: "10px", color: "#666" }}>Menu</span>
          </button>
        </div>
      </header>

      <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "14px auto 0" }} />

      <div style={{ textAlign: "center", padding: "18px 20px 16px" }}>
        <p style={{ margin: "0 0 6px", fontSize: "14px", color: "#888" }}>Total à payer</p>
        <p style={{ margin: "0 0 6px", fontSize: "48px", fontWeight: 900, color: "#111", lineHeight: 1 }}>
          ${productPrice.toLocaleString()}
        </p>
        <p style={{ margin: 0, fontSize: "14px", color: "#888" }}>{productName}</p>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #f0f0f0", margin: "0 16px 20px" }} />

      <p style={{ margin: "0 16px 14px", fontSize: "11px", fontWeight: 800, color: "#aaa", letterSpacing: "0.08em" }}>
        CHOISIR MÉTHODE DE PAIEMENT
      </p>

      <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {METHODS.map((m) => (
          <button key={m.id} onClick={() => setActiveSheet(m.id)} style={{
            display: "flex", alignItems: "center", gap: "14px",
            background: "#fff", border: "1.5px solid #eee",
            borderRadius: "16px", padding: "14px 16px",
            cursor: "pointer", fontFamily: "inherit",
            width: "100%", textAlign: "left",
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}>
            <div style={{
              width: "52px", height: "52px", borderRadius: "50%",
              background: m.bgColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: m.id === "banque" ? "24px" : "22px",
              fontWeight: 900, color: m.textColor, flexShrink: 0,
            }}>{m.initial}</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#111" }}>{m.name}</p>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#888" }}>{m.subtitle}</p>
            </div>
            <span style={{ fontSize: "16px", color: "#ccc" }}>›</span>
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 14px 0" }}>
        <button onClick={() => setShowHowTo(!showHowTo)} style={{
          width: "100%", padding: "13px 16px",
          background: "#f5f5f5", border: "1.5px dashed #ddd",
          borderRadius: "14px", cursor: "pointer",
          fontSize: "14px", fontWeight: 700, color: "#333",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          fontFamily: "inherit",
        }}>
          <span>ℹ️ Comment payer</span>
          <span style={{ fontSize: "12px", display: "inline-block", transform: showHowTo ? "rotate(180deg)" : "rotate(0deg)" }}>▲</span>
        </button>

        {showHowTo && (
          <div style={{
            background: "#f9f9f9", border: "1px solid #eee",
            borderRadius: "0 0 14px 14px", padding: "14px 16px", marginTop: "-2px",
          }}>
            {[
              "Choisissez la méthode (MonCash, NatCash, Banque).",
              "Effectuez le transfert au numéro/compte indiqué.",
              "Revenez cliquer sur Confirmer le paiement.",
              "Nous vérifions et vous contactons.",
              "Garantie complète — échange ou remboursement si problème.",
            ].map((line, i) => (
              <p key={i} style={{ margin: i < 4 ? "0 0 10px" : 0, fontSize: "13px", color: "#444", lineHeight: 1.6 }}>
                {i + 1}) {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CHECKOUT PAGE — avèk Suspense (sa ki te manke a!)
// ══════════════════════════════════════════════════════════════════════════
export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center",
        fontFamily: "'Segoe UI', sans-serif",
      }}>
        <p style={{ color: "#888", fontSize: "15px" }}>Chajman...</p>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

interface Product {
  id: string;
  marque: string;
  modele: string;
  category?: string;
  prixVente: number;
  stock: number;
  imagePath?: string;
  imagePaths?: string[];
  description?: string;
  isDeleted?: boolean;
  ram?: string | number;
  RAM?: string | number;
  stockage?: string | number;
  storage?: string | number;
  views?: number;
  clicks?: number;
  map?: string;
  prixWeb?: number;
}

interface QuickButton {
  id: string;
  emoji: string;
  label: string;
  action: "filter_keyword" | "show_categories" | "filter_favorites" | "show_info" | "url" | "whatsapp" | "phone";
  keyword?: string;       // pour filter_keyword
  infoText?: string;      // pour show_info (livraison/garantie)
  infoKey?: string;       // "livraison" | "garantie" — pour fetch depuis Firestore
  url?: string;
  phone?: string;
  order: number;
}
interface PanierItem {
  product: Product;
  quantity: number;
}

function getImages(p: Product): string[] {
  if (p.imagePaths && p.imagePaths.length > 0)
    return p.imagePaths.filter((u) => u?.startsWith("http"));
  if (p.imagePath?.startsWith("http")) return [p.imagePath];
  return [];
}

function getCatColor(cat: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    Ordinateur: { bg: "#e0f7f4", text: "#00897b" },
    Laptop:     { bg: "#e0f7f4", text: "#00897b" },
    Tablette:   { bg: "#fff3e0", text: "#e65100" },
    Accessoire: { bg: "#fff8e1", text: "#f79f1f" },
  };
  return map[cat] ?? { bg: "#f0f4ff", text: "#1a1a2e" };
}

function getCatEmoji(cat: string): string {
  const map: Record<string, string> = {
    Ordinateur: "🖥️", Laptop: "💻",
    Tablette: "📟", Accessoire: "🎧",
  };
  return map[cat] ?? "📦";
}

// Parse RAM/Stockage value from product (flexible)
function getRamValue(p: Product): number {
  const raw = p.ram ?? p.RAM;
  if (raw !== undefined) {
    const n = parseInt(String(raw));
    if (!isNaN(n)) return n;
  }
  // Try parsing from description
  const desc = `${p.modele ?? ""} ${p.description ?? ""}`.toLowerCase();
  const ramMatch = desc.match(/(\d+)\s*gb?\s*(ram|memory|mémoire)/i) ?? desc.match(/ram\s*:?\s*(\d+)/i);
  if (ramMatch) return parseInt(ramMatch[1]);
  return 0;
}

function getStorageValue(p: Product): number {
  const raw = p.stockage ?? p.storage;
  if (raw !== undefined) {
    const n = parseInt(String(raw));
    if (!isNaN(n)) return n;
  }
  const desc = `${p.modele ?? ""} ${p.description ?? ""}`.toLowerCase();
  const match = desc.match(/(\d+)\s*(tb|go|gb)\s*(ssd|hdd|nvme|stockage|storage)?/i) ?? desc.match(/(ssd|hdd|nvme)\s*:?\s*(\d+)/i);
  if (match) {
    const val = parseInt(match[1] ?? match[2]);
    const unit = (match[2] ?? match[1] ?? "").toLowerCase();
    if (unit === "tb") return val * 1000;
    return val;
  }
  return 0;
}

// ── INFO SHEET (Livraison / Garantie) ──────────────────────────────────────
function InfoSheet({ text, title, emoji, onClose }: { text: string; title: string; emoji: string; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 8500,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "24px 24px 0 0",
        width: "100%", maxWidth: "600px",
        maxHeight: "75vh", overflowY: "auto",
        padding: "0 0 40px",
      }}>
        <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#1a1a2e" }}>
              {emoji} {title}
            </h2>
            <button onClick={onClose} style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: "#f1f1f1", border: "none", fontSize: "18px",
              cursor: "pointer",
            }}>×</button>
          </div>
          <div style={{
            background: "#f8f9fa", borderRadius: "16px", padding: "18px",
            fontSize: "15px", color: "#333", lineHeight: 1.7,
            whiteSpace: "pre-wrap",
          }}>
            {text || "Aucune information disponible pour le moment."}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CATEGORY PICKER SHEET ──────────────────────────────────────────────────
function CategorySheet({ categories, onSelect, onClose }: {
  categories: string[];
  onSelect: (cat: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 8500,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "24px 24px 0 0",
        width: "100%", maxWidth: "600px",
        maxHeight: "70vh", overflowY: "auto",
        padding: "0 0 40px",
      }}>
        <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "12px auto 0" }} />
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#1a1a2e" }}>🗂️ Catégories</h2>
            <button onClick={onClose} style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: "#f1f1f1", border: "none", fontSize: "18px", cursor: "pointer",
            }}>×</button>
          </div>

          {/* Tout */}
          <button onClick={() => { onSelect("Tout"); onClose(); }} style={{
            width: "100%", display: "flex", alignItems: "center", gap: "14px",
            padding: "16px 14px", background: "#f8f9fa", borderRadius: "14px",
            border: "none", cursor: "pointer", marginBottom: "10px",
            fontFamily: "inherit",
          }}>
            <span style={{ fontSize: "32px" }}>🛍️</span>
            <div style={{ textAlign: "left" }}>
              <p style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#1a1a2e" }}>Tous les produits</p>
              <p style={{ margin: 0, fontSize: "12px", color: "#888" }}>Voir tout</p>
            </div>
          </button>

          {categories.map((cat) => {
            const c = getCatColor(cat);
            return (
              <button key={cat} onClick={() => { onSelect(cat); onClose(); }} style={{
                width: "100%", display: "flex", alignItems: "center", gap: "14px",
                padding: "16px 14px", background: c.bg, borderRadius: "14px",
                border: `1.5px solid ${c.text}33`, cursor: "pointer", marginBottom: "10px",
                fontFamily: "inherit",
              }}>
                <span style={{ fontSize: "32px" }}>{getCatEmoji(cat)}</span>
                <div style={{ textAlign: "left" }}>
                  <p style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: c.text }}>{cat}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DrawerMenu({ onClose, categories, onFilter, whatsapp, siteConfig }: {
  onClose: () => void;
  categories: string[];
  onFilter: (cat: string) => void;
  whatsapp: string;
  siteConfig: any;
}) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9000,
      display: "flex", justifyContent: "flex-end",
      background: "rgba(0,0,0,0.45)",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "min(340px, 88vw)", background: "#fff",
        height: "100%", display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}>
        <div style={{
          background: "#1a1a2e", padding: "20px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "52px", height: "52px", borderRadius: "10px",
              background: "#fff", overflow: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <img src="https://i.ibb.co/gLmkySCv/ab785ed1481b.jpg" alt="MillionStore"
                style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <p style={{ margin: 0, color: "#fff", fontWeight: 800, fontSize: "18px", lineHeight: 1 }}>MillionStore</p>
              <p style={{ margin: "4px 0 0", color: "#aaa", fontSize: "12px" }}>
  {siteConfig?.heures ?? "Lendi - Dimanche: 8h am - 5h pm"}
</p>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: "rgba(255,255,255,0.15)", border: "none",
            color: "#fff", fontSize: "20px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        <div style={{ padding: "20px 16px", borderBottom: "1px solid #f0f0f0" }}>
          <p style={{ margin: "0 0 14px", fontSize: "12px", fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em" }}>Informations</p>
          {[
            { icon: "📍", text: siteConfig?.adresse    ?? "Delmas 83, Port-au-Prince" },
{ icon: "📞", text: siteConfig?.telephone1 ?? "+509 38083793" },
{ icon: "📞", text: siteConfig?.telephone2 ?? "+509 35071099" },
{ icon: "✉️", text: siteConfig?.email      ?? "bernadincesar91@gmail.com" },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: "flex", gap: "12px", marginBottom: "14px", alignItems: "flex-start" }}>
              <span style={{ fontSize: "18px", flexShrink: 0 }}>{icon}</span>
              <p style={{ margin: 0, fontSize: "14px", color: "#333", lineHeight: 1.4 }}>{text}</p>
            </div>
          ))}
        </div>

        <div style={{ padding: "16px", borderBottom: "1px solid #f0f0f0" }}>
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            background: "#25D366", color: "#fff", padding: "12px 24px",
            borderRadius: "14px", textDecoration: "none", fontWeight: 700, fontSize: "15px",
          }}>💬 WhatsApp</a>
        </div>

        <div style={{ padding: "0 16px 16px", flex: 1 }}>
          <p style={{ margin: "16px 0 12px", fontSize: "12px", fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em" }}>Catégories</p>
          {[{ cat: "Tout", emoji: "🛍️", label: "Tous les produits" }, ...categories.map(c => ({ cat: c, emoji: getCatEmoji(c), label: c }))].map(({ cat, emoji, label }) => (
            <button key={cat} onClick={() => { onFilter(cat); onClose(); }} style={{
              width: "100%", textAlign: "left", padding: "14px 0",
              border: "none", background: "transparent", cursor: "pointer",
              fontSize: "16px", fontWeight: 600, color: "#1a1a2e",
              display: "flex", alignItems: "center", gap: "14px",
              borderBottom: "1px solid #f5f5f5",
            }}>
              <span style={{ fontSize: "26px" }}>{emoji}</span> {label}
            </button>
          ))}
        </div>

        <div style={{ padding: "16px" }}>
          <a href="/login" style={{
  display: "block", textAlign: "center",
  background: "#1a1a2e", color: "#fff", padding: "16px",
  borderRadius: "14px", textDecoration: "none", fontWeight: 700, fontSize: "16px",
}}>🔐 Espace Admin</a>
        </div>
      </div>
    </div>
  );
}

// ── PRODUCT MODAL ──────────────────────────────────────────────────────────
function ProductModal({ product, onClose, router, onAddToPanier }: {
  product: Product; onClose: () => void;
  router: ReturnType<typeof useRouter>;
  onAddToPanier: (p: Product) => void;
}) {
  const imgs = getImages(product);
  const [imgIdx, setImgIdx] = useState(0);
  const cat = getCatColor(product.category ?? "");
  const lowStock = product.stock <= 2;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 8000,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "24px 24px 0 0",
        width: "100%", maxWidth: "600px",
        maxHeight: "94vh", overflowY: "auto",
        paddingBottom: "30px",
      }}>
        <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "12px auto 0" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", overflow: "hidden", background: "#f0f0f0" }}>
              <img src="https://i.ibb.co/gLmkySCv/ab785ed1481b.jpg" alt="Logo"
                style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#1a1a2e", lineHeight: 1 }}>
                Million<span style={{ color: "#e63946" }}>Store</span>
              </p>
              <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#2ecc71" }}>🟢 En ligne</p>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: "#f1f1f1", border: "none", fontSize: "18px",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            marginLeft: "4px",
          }}>×</button>
        </div>

        <div style={{ padding: "0 14px", marginBottom: "12px" }}>
          <div style={{
            borderRadius: "18px", overflow: "hidden",
            background: "#fff", border: "1px solid #f0f0f0",
            width: "100%", aspectRatio: "4/3",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          }}>
            {imgs.length > 0 ? (
              <img src={imgs[imgIdx]} alt={`${product.marque} ${product.modele}`}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", padding: "8px" }} />
            ) : (
              <span style={{ fontSize: "72px" }}>💻</span>
            )}
          </div>
        </div>

        {imgs.length > 1 && (
          <div style={{
            display: "flex", gap: "10px", padding: "0 14px",
            marginBottom: "16px", overflowX: "auto", scrollbarWidth: "none",
          }}>
            {imgs.map((img, i) => (
              <div key={i} onClick={() => setImgIdx(i)} style={{
                width: "82px", height: "82px", flexShrink: 0,
                borderRadius: "10px", overflow: "hidden", cursor: "pointer",
                border: i === imgIdx ? "2.5px solid #00897b" : "2px solid #e8e8e8",
                background: "#f5f5f5",
              }}>
                <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: "0 16px" }}>
          {product.category && (
            <span style={{
              display: "inline-block", background: cat.bg, color: cat.text,
              padding: "5px 14px", borderRadius: "999px",
              fontSize: "13px", fontWeight: 700, marginBottom: "10px",
              border: `1px solid ${cat.text}40`,
            }}>{product.category}</span>
          )}
          <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#888" }}>🔖 ID: {product.id}</p>
          <h2 style={{ margin: "0 0 10px", fontSize: "24px", fontWeight: 800, color: "#111", lineHeight: 1.2 }}>
            {product.marque} {product.modele}
          </h2>
          {product.description && (
  <p style={{ margin: "0 0 8px", fontSize: "14px", color: "#555", lineHeight: 1.6 }}>
    {product.description}
  </p>
)}

{product.map && (
  <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#7c3aed", fontWeight: 600, lineHeight: 1.5 }}>
    ℹ️ {product.map}
  </p>
)}

<p style={{ margin: "0 0 12px", fontSize: "42px", fontWeight: 900, color: "#111", lineHeight: 1 }}>
  ${Number(product.prixWeb && product.prixWeb > 0 ? product.prixWeb : product.prixVente).toLocaleString()}
</p>
          {lowStock && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              background: "#fff3e0", color: "#e65100",
              padding: "8px 16px", borderRadius: "999px",
              fontSize: "13px", fontWeight: 700, marginBottom: "24px",
            }}>⚠️ Seulement {product.stock} restant!</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
            <button style={{
              width: "100%", padding: "17px", background: "#1a1a2e", color: "#fff",
              border: "none", borderRadius: "14px", fontSize: "16px", fontWeight: 700, cursor: "pointer",
            }}
            onClick={() => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    router.push(`/login-client?redirect=/checkout&product=${encodeURIComponent(product.marque + " " + product.modele)}&price=${product.prixVente}&id=${product.id}`);
  } else {
    router.push(`/checkout?product=${encodeURIComponent(product.marque + " " + product.modele)}&price=${product.prixVente}&id=${product.id}`);
  }
}}>🛒 Acheter maintenant</button>
            <button onClick={() => window.open("https://wa.me/50938083793", "_blank")} style={{
              width: "100%", padding: "17px", background: "#fff", color: "#1a1a2e",
              border: "2px solid #1a1a2e", borderRadius: "14px", fontSize: "16px", fontWeight: 600, cursor: "pointer",
            }}>💬 Nous contacter</button>
            <button onClick={() => { onAddToPanier(product); onClose(); }} style={{
              width: "100%", padding: "17px", background: "#1a9e6e", color: "#fff",
              border: "none", borderRadius: "14px", fontSize: "16px", fontWeight: 700, cursor: "pointer",
            }}>➕ Ajouter au panier</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PanierSheet({ panier, onClose, onRemove, onUpdateQty, onCheckout }: {
  panier: { product: any; quantity: number }[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onUpdateQty: (id: string, qty: number) => void;
  onCheckout: () => void;
}) {
  const total = panier.reduce((s, item) => s + item.product.prixVente * item.quantity, 0);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 8500,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "24px 24px 0 0",
        width: "100%", maxWidth: "600px",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        {/* Handle */}
        <div style={{ width: "40px", height: "4px", background: "#e0e0e0", borderRadius: "2px", margin: "12px auto 0", flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid #f0f0f0", flexShrink: 0,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: "17px", fontWeight: 900, color: "#1a1a2e" }}>
              🛒 Mon Panier
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#888" }}>
              {panier.length} produit{panier.length > 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={onClose} style={{
            width: "34px", height: "34px", borderRadius: "50%",
            background: "#f1f1f1", border: "none", fontSize: "16px",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        {/* Liste produits */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
          {panier.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <p style={{ fontSize: "48px", margin: "0 0 10px" }}>🛒</p>
              <p style={{ color: "#888", fontSize: "14px" }}>Votre panier est vide.</p>
            </div>
          ) : (
            panier.map((item) => {
              const imgs = item.product.imagePaths?.filter((u: string) => u?.startsWith("http")) ?? [];
              const thumb = imgs[0] ?? item.product.imagePath;
              return (
                <div key={item.product.id} style={{
                  display: "flex", gap: "12px", alignItems: "center",
                  padding: "12px 0", borderBottom: "1px solid #f5f5f5",
                }}>
                  {/* Image */}
                  <div style={{
                    width: "64px", height: "64px", borderRadius: "12px",
                    background: "#f5f5f5", flexShrink: 0, overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {thumb
                      ? <img src={thumb} alt={item.product.modele} style={{ width: "100%", height: "100%", objectFit: "contain", padding: "4px" }} />
                      : <span style={{ fontSize: "28px" }}>💻</span>
                    }
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: "0 0 2px", fontSize: "13px", fontWeight: 800, color: "#111",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.product.marque} {item.product.modele}
                    </p>
                    <p style={{ margin: "0 0 6px", fontSize: "13px", fontWeight: 900, color: "#e63946" }}>
                      ${Number(item.product.prixVente).toLocaleString()}
                    </p>

                    {/* Quantity controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                        style={{
                          width: "28px", height: "28px", borderRadius: "8px",
                          background: "#f0f0f0", border: "none", fontSize: "16px",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, color: "#333",
                        }}>−</button>
                      <span style={{ fontSize: "14px", fontWeight: 800, color: "#1a1a2e", minWidth: "20px", textAlign: "center" }}>
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
                        style={{
                          width: "28px", height: "28px", borderRadius: "8px",
                          background: "#1a1a2e", border: "none", fontSize: "16px",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, color: "#fff",
                        }}>+</button>
                    </div>
                  </div>

                  {/* Subtotal + delete */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 900, color: "#111" }}>
                      ${(item.product.prixVente * item.quantity).toLocaleString()}
                    </p>
                    <button
                      onClick={() => onRemove(item.product.id)}
                      style={{
                        background: "#fff0f0", border: "none", borderRadius: "8px",
                        padding: "5px 8px", cursor: "pointer", fontSize: "13px",
                        color: "#e63946",
                      }}>🗑️</button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer — total + checkout */}
        {panier.length > 0 && (
          <div style={{
            padding: "14px 16px", borderTop: "1px solid #f0f0f0",
            flexShrink: 0, background: "#fff",
            borderRadius: "0 0 0 0",
          }}>
            {/* Résumé */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <p style={{ margin: 0, fontSize: "14px", color: "#888" }}>
                {panier.reduce((s, i) => s + i.quantity, 0)} article{panier.reduce((s, i) => s + i.quantity, 0) > 1 ? "s" : ""}
              </p>
              <p style={{ margin: 0, fontSize: "22px", fontWeight: 900, color: "#1a1a2e" }}>
                Total: ${total.toLocaleString()}
              </p>
            </div>

            {/* Checkout button */}
            <button onClick={onCheckout} style={{
              width: "100%", padding: "16px",
              background: "#1a1a2e", color: "#fff",
              border: "none", borderRadius: "14px",
              fontSize: "15px", fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              🛒 Passer la commande — ${total.toLocaleString()}
            </button>

            {/* WhatsApp alternative */}
            <button
              onClick={() => window.open(`https://wa.me/50938332483?text=Bonjour, je voudrais commander: ${panier.map(i => `${i.product.marque} ${i.product.modele} (x${i.quantity})`).join(", ")}. Total: $${total}`, "_blank")}
              style={{
                width: "100%", padding: "13px",
                background: "#fff", color: "#25D366",
                border: "1.5px solid #25D366", borderRadius: "14px",
                fontSize: "14px", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                marginTop: "8px",
              }}>
              💬 Commander via WhatsApp
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  HOME PAGE
// ══════════════════════════════════════════════════════════════════════════
export default function Home() {
  const router = useRouter();
  const [produits, setProduits]           = useState<Product[]>([]);
  const [siteConfig, setSiteConfig] = useState<any>({});
  const [loading, setLoading]             = useState(true);
  const [recherche, setRecherche]         = useState("");
  const [catActive, setCatActive]         = useState("Tout");
  const [showDrawer, setShowDrawer]       = useState(false);
  const [selected, setSelected]           = useState<Product | null>(null);
  const [activeBtn, setActiveBtn]         = useState("Tout");
  const [showCatSheet, setShowCatSheet]   = useState(false);
  const [infoSheet, setInfoSheet]         = useState<{ title: string; emoji: string; text: string } | null>(null);
  const [panier, setPanier] = useState<PanierItem[]>([]);
  const [showPanier, setShowPanier] = useState(false);
  const [infoCache, setInfoCache]         = useState<Record<string, string>>({});

  // ── Default QuickButtons ─────────────────────────────────────────────
  const defaultButtons: QuickButton[] = siteConfig?.quickButtons ?? [
    { id: "tout",       emoji: "🛍️", label: "Tout",       action: "filter_keyword", keyword: "",        order: 0 },
    { id: "categories", emoji: "🗂️", label: "Catégories", action: "show_categories",                    order: 1 },
    { id: "special",    emoji: "⭐", label: "Spécial",     action: "filter_keyword", keyword: "special", order: 2 },
    { id: "favoris",    emoji: "🤍", label: "Favoris",     action: "filter_favorites",                   order: 3 },
    { id: "livraison",  emoji: "🚚", label: "Livraison",   action: "show_info",      infoKey: "livraison", order: 4 },
    { id: "garantie",   emoji: "🛡️", label: "Garantie",    action: "show_info",      infoKey: "garantie",  order: 5 },
  ];

  const [quickButtons, setQuickButtons] = useState<QuickButton[]>(defaultButtons);
  // NB: Dans une vraie implémentation admin, quickButtons viendrait de Firestore
  // et serait modifiable (ordre, ajout, suppression).

  // ── Fetch produits ───────────────────────────────────────────────────
  useEffect(() => {
    const fetchProduits = async () => {
      try {
        const localsSnapshot = await getDocs(collection(db, "locals"));
        let toutPwodui: Product[] = [];
        for (const localDoc of localsSnapshot.docs) {
          const productsSnapshot = await getDocs(
            collection(db, "locals", localDoc.id, "products")
          );
          const pwodui = productsSnapshot.docs
            .map((d) => ({ id: d.id, ...d.data() } as Product))
            .filter((p) => !p.isDeleted && p.prixVente > 0 && p.stock > 0);
          toutPwodui = [...toutPwodui, ...pwodui];
        }
        setProduits(toutPwodui);
      } catch (error) {
        console.error("Erè:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProduits();
  fetchProduits();
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const snap = await getDoc(doc(db, "website", "siteweb"));
        if (snap.exists()) {
          console.log("Config chaje:", snap.data());
          setSiteConfig(snap.data());
          if (snap.data()?.quickButtons?.length > 0) {
            setQuickButtons(snap.data().quickButtons);
          }
        }
        // ✅ AJOUTE SA — fetch taux
    const tauxSnap = await getDoc(doc(db, "parametres", "taux"));
    if (tauxSnap.exists()) {
      setSiteConfig((prev: any) => ({ ...prev, taux: tauxSnap.data().taux }));
    }

      } catch (e) {
        console.error("Erè config:", e);
      }
    };
    loadConfig();
  }, []);

  const categories = Array.from(
    new Set(produits.map((p) => p.category ?? "Lòt").filter(Boolean))
  );

  // ── Fetch info text from Firestore settings ──────────────────────────
  const fetchInfoText = async (key: string): Promise<string> => {
    if (key === "livraison" && siteConfig?.livraisonText) return siteConfig.livraisonText;
    if (key === "garantie"  && siteConfig?.garantieText)  return siteConfig.garantieText;
    if (infoCache[key]) return infoCache[key];
    try {
      const snap = await getDoc(doc(db, "settings", key));
      const text = snap.exists() ? (snap.data()?.text ?? snap.data()?.content ?? "") : "";
      setInfoCache((prev) => ({ ...prev, [key]: text }));
      return text;
    } catch {
      return "";
    }
  };

  // ── Handle QuickButton click ─────────────────────────────────────────
  const handleQuickBtn = async (btn: QuickButton) => {
    setActiveBtn(btn.id);

    switch (btn.action) {
      case "filter_keyword":
        setCatActive("Tout");
        setRecherche(btn.keyword ?? "");
        break;

      case "show_categories":
        setShowCatSheet(true);
        break;

      case "filter_favorites":
        setCatActive("Tout");
        setRecherche("");
        // Sorting handled below in pwodwiFiltire
        break;

      case "show_info": {
        const key = btn.infoKey ?? btn.id;
        const text = btn.infoText ?? (await fetchInfoText(key));
        setInfoSheet({ title: btn.label, emoji: btn.emoji, text });
        break;
      }

      case "url":
        if (btn.url) window.open(btn.url, "_blank");
        break;

      case "whatsapp":
        window.open(`https://wa.me/${btn.phone ?? "50938083793"}`, "_blank");
        break;

      case "phone":
        if (btn.phone) window.location.href = `tel:${btn.phone}`;
        break;
    }
  };

  // ── Filtered + sorted products ───────────────────────────────────────
  let pwodwiFiltire = produits.filter((p) => {
    const matchCat = catActive === "Tout" || p.category === catActive;
    const q = recherche.toLowerCase();
    const matchQ = `${p.modele} ${p.marque} ${p.description ?? ""}`.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  // Favoris: sort by RAM desc, then storage desc
  if (activeBtn === "favoris") {
    pwodwiFiltire = [...pwodwiFiltire].sort((a, b) => {
      const ramDiff = getRamValue(b) - getRamValue(a);
      if (ramDiff !== 0) return ramDiff;
      return getStorageValue(b) - getStorageValue(a);
    });
  }

  // Special: only show if matches, else show all unchanged
  if (activeBtn === "special" && recherche === "special") {
    const specialOnes = pwodwiFiltire.filter((p) =>
      `${p.modele} ${p.marque} ${p.description ?? ""}`.toLowerCase().includes("special")
    );
    if (specialOnes.length > 0) pwodwiFiltire = specialOnes;
    // else keep pwodwiFiltire as-is (no change, no empty state)
  }
  const addToPanier = (product: Product) => {
    setPanier((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromPanier = (productId: string) => {
    setPanier((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) { removeFromPanier(productId); return; }
    setPanier((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: qty } : item
      )
    );
  };

  const totalPanier = panier.reduce((s, item) => s + item.product.prixVente * item.quantity, 0);
  const countPanier = panier.reduce((s, item) => s + item.quantity, 0);

  const sortedButtons = [...quickButtons].sort((a, b) => a.order - b.order);

  return (
    <main style={{ minHeight: "100vh", background: "#f0f0f0", fontFamily: "'Segoe UI', sans-serif", paddingBottom: "80px" }}>
      {showPanier && (
        <PanierSheet
          panier={panier}
          onClose={() => setShowPanier(false)}
          onRemove={removeFromPanier}
          onUpdateQty={updateQuantity}
          onCheckout={() => {
            setShowPanier(false);
            const items = panier.map(i => `${encodeURIComponent(i.product.marque + " " + i.product.modele)}`).join(",");
            router.push(`/checkout?product=${panier[0] ? encodeURIComponent(panier[0].product.marque + " " + panier[0].product.modele) : ""}&price=${totalPanier}&id=${panier[0]?.product.id ?? ""}&multi=true`);
          }}
        />
      )}
      {showDrawer && <DrawerMenu onClose={() => setShowDrawer(false)} categories={categories} onFilter={(cat) => { setCatActive(cat); setActiveBtn("Tout"); }} whatsapp={siteConfig?.whatsapp ?? "50938332483"} siteConfig={siteConfig} />}
        {siteConfig?.banniereActive && (
        <div style={{
          background: siteConfig.banniereCouleur ?? "#e63946",
          color: "#fff", padding: "8px 16px",
          textAlign: "center", fontSize: "13px", fontWeight: 700,
        }}>
          {siteConfig.banniereTexte}
        </div>
      )}
      {selected && <ProductModal product={selected} onClose={() => setSelected(null)} router={router} onAddToPanier={addToPanier} />}
      {showCatSheet && <CategorySheet categories={categories} onSelect={(cat) => { setCatActive(cat); setActiveBtn("categories"); }} onClose={() => setShowCatSheet(false)} />}
      {infoSheet && <InfoSheet title={infoSheet.title} emoji={infoSheet.emoji} text={infoSheet.text} onClose={() => setInfoSheet(null)} />}

      {/* ── NAVBAR ── */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #eee",
        position: "sticky", top: 0, zIndex: 1000,
        boxShadow: "0 1px 6px rgba(0,0,0,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "10px", overflow: "hidden", background: "#f0f0f0", flexShrink: 0 }}>
              <img src="https://i.ibb.co/gLmkySCv/ab785ed1481b.jpg" alt="Logo"
                style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#1a1a2e", lineHeight: 1 }}>
                {siteConfig?.nomBoutique?.replace("Store","") ?? "Million"}<span style={{ color: "#e63946" }}>Store</span>
              </p>
              <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#2ecc71" }}>🟢 En ligne</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <a href="/login" style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", padding: "6px 8px" }}>
              <span style={{ fontSize: "22px" }}>👤</span>
              <span style={{ fontSize: "10px", color: "#666" }}>Compte</span>
            </a>
            
              <button onClick={() => setShowPanier(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", position: "relative" }}>
              <span style={{ fontSize: "22px" }}>🛒</span>
              {countPanier > 0 && (
                <div style={{ position: "absolute", top: "2px", right: "2px", background: "#e63946", color: "#fff", borderRadius: "50%", width: "16px", height: "16px", fontSize: "9px", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {countPanier}
                </div>
              )}
              <span style={{ fontSize: "10px", color: "#666" }}>Panier</span>
            </button>
            
            <button onClick={() => setShowDrawer(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
              <span style={{ fontSize: "22px" }}>☰</span>
              <span style={{ fontSize: "10px", color: "#666" }}>Menu</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: "0 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", background: "#f8f8f8", border: "1.5px solid #e0e0e0", borderRadius: "999px", overflow: "hidden" }}>
            <span style={{ padding: "0 12px", fontSize: "16px", color: "#aaa" }}>🔍</span>
            <input
              type="search" placeholder="Rechercher un produit, ID, IMEI..."
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                setActiveBtn("Tout");
              }}
              style={{ flex: 1, padding: "11px 0", border: "none", background: "transparent", fontSize: "14px", outline: "none", fontFamily: "inherit", color: "#333" }}
            />
          </div>
        </div>

        {/* ── QUICK BUTTONS (dynamic, ordered) ── */}
        <div style={{ display: "flex", gap: "8px", padding: "0 16px 12px", overflowX: "auto", scrollbarWidth: "none" }}>
          {sortedButtons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => handleQuickBtn(btn)}
              style={{
                flexShrink: 0, padding: "7px 16px", borderRadius: "999px",
                border: activeBtn === btn.id ? "1.5px solid #1a1a2e" : "1.5px solid #e0e0e0",
                background: activeBtn === btn.id ? "#1a1a2e" : "#fff",
                color: activeBtn === btn.id ? "#fff" : "#333",
                fontSize: "13px", fontWeight: 600, cursor: "pointer",
                whiteSpace: "nowrap", fontFamily: "inherit",
              }}
            >
              {btn.emoji} {btn.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── TAUX DU JOUR ── */}
{siteConfig?.taux && (
  <div style={{
    margin: "0 12px 10px",
    background: "#fff8e1",
    border: "1.5px solid #f79f1f",
    borderRadius: "12px",
    padding: "8px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  }}>
    <span style={{ fontSize: "13px", color: "#888", fontWeight: 600 }}>
      💱 Taux du jour
    </span>
    <span style={{ fontSize: "14px", fontWeight: 900, color: "#e65100" }}>
      1$ = {siteConfig.taux} HTG
    </span>
  </div>
)}



      {/* ── PRODUCT GRID ── */}
      <div style={{ padding: "12px" }}>
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: "16px", height: "280px", animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
        ) : pwodwiFiltire.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ fontSize: "48px", margin: "0 0 12px" }}>🔍</p>
            <p style={{ color: "#888", fontSize: "16px" }}>Okenn pwodwi jwenn.</p>
          </div>
        ) : (
          <>
            {/* ── 2 COLUMNS ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {pwodwiFiltire.map((p) => {
                const imgs     = getImages(p);
                const thumb    = imgs[0];
                const lowStock = p.stock <= 2;
                const cat      = getCatColor(p.category ?? "");

                return (
                  <div key={p.id} onClick={() => setSelected(p)} style={{
                    background: "#fff", borderRadius: "14px",
                    overflow: "hidden", cursor: "pointer",
                    boxShadow: "0 1px 5px rgba(0,0,0,0.08)",
                    display: "flex", flexDirection: "column",
                  }}>
                    {/* Image */}
                    <div style={{
                      position: "relative", width: "100%",
                      height: "150px", background: "#fafafa",
                      overflow: "hidden",
                    }}>
                      {thumb ? (
                        <img src={thumb} alt={p.modele} style={{
                          width: "100%", height: "100%",
                          objectFit: "contain", display: "block",
                          padding: "6px",
                        }} />
                      ) : (
                        <div style={{
                          width: "100%", height: "100%",
                          display: "flex", alignItems: "center",
                          justifyContent: "center", fontSize: "40px",
                          background: "#f5f5f5",
                        }}>💻</div>
                      )}

                      {lowStock && (
                        <span style={{
                          position: "absolute", top: "8px", left: "8px",
                          background: "#f0522a", color: "#fff",
                          borderRadius: "999px", padding: "4px 10px",
                          fontSize: "11px", fontWeight: 800,
                        }}>Dèrnier {p.stock}!</span>
                      )}

                      {imgs.length > 1 && (
                        <div style={{
                          position: "absolute", bottom: "6px", right: "6px",
                          background: "rgba(40,40,40,0.70)", color: "#fff",
                          borderRadius: "6px", padding: "3px 7px",
                          fontSize: "11px", fontWeight: 600,
                          display: "flex", alignItems: "center", gap: "3px",
                        }}>📷 {imgs.length}</div>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ padding: "6px 8px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                        {p.category ? (
                          <span style={{
                            display: "inline-block", background: cat.bg, color: cat.text,
                            padding: "2px 8px", borderRadius: "999px",
                            fontSize: "10px", fontWeight: 700,
                            border: `1px solid ${cat.text}33`,
                          }}>{p.category}</span>
                        ) : <span />}
                        <div style={{
                          width: "24px", height: "24px", borderRadius: "50%",
                          background: "#f0f0f0", border: "1px solid #e0e0e0",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "12px", flexShrink: 0,
                        }}>
                          {p.marque?.toLowerCase().includes("dell")    ? "🔵" :
                           p.marque?.toLowerCase().includes("hp")      ? "🔵" :
                           p.marque?.toLowerCase().includes("apple")   ? "🍎" :
                           p.marque?.toLowerCase().includes("lenovo")  ? "⬛" :
                           p.marque?.toLowerCase().includes("samsung") ? "🔷" : "📦"}
                        </div>
                      </div>

                      <p style={{ margin: "0 0 3px", fontSize: "12px", color: "#333", fontWeight: 700 }}>
                        🔖 ID: {p.id}
                      </p>

                      <p style={{
                        margin: "0 0 3px", fontSize: "13px",
                        fontWeight: 800, color: "#111", lineHeight: 1.2,
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>{p.marque} {p.modele}</p>

                      {p.description && (
  <p style={{ margin: "0 0 4px", fontSize: "11px", color: "#888", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
    {p.description}
  </p>
)}

{p.map && (
  <p style={{ margin: "0 0 6px", fontSize: "11px", color: "#7c3aed", fontWeight: 600, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
    ℹ️ {p.map}
  </p>
)}

<p style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 900, color: "#111" }}>
  ${Number(p.prixWeb && p.prixWeb > 0 ? p.prixWeb : p.prixVente).toLocaleString()}
</p>


                      <button onClick={(e) => { e.stopPropagation(); setSelected(p); }} style={{
                        width: "100%", padding: "10px",
                        background: "#1a1a2e", color: "#fff",
                        border: "none", borderRadius: "8px",
                        fontSize: "12px", fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                      }}>Voir détails</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── BOTTOM BAR ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "#fff", borderTop: "1px solid #eee",
        display: "flex", justifyContent: "space-around", alignItems: "center",
        padding: "10px 0 14px", zIndex: 2000,
        boxShadow: "0 -2px 10px rgba(0,0,0,0.08)",
      }}>
        <button onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setActiveBtn("Tout"); setCatActive("Tout"); setRecherche(""); }} style={{
          background: "none", border: "none", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
        }}>
          <span style={{ fontSize: "24px" }}>🏠</span>
          <span style={{ fontSize: "11px", color: "#333", fontWeight: 600 }}>Accueil</span>
        </button>

        <a href={`https://wa.me/${siteConfig?.whatsapp ?? "50938083793"}`} target="_blank" rel="noopener noreferrer" style={{
          textDecoration: "none",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
        }}>
          <span style={{ fontSize: "24px" }}>💬</span>
          <span style={{ fontSize: "11px", color: "#25D366", fontWeight: 700 }}>WhatsApp</span>
        </a>

        <a href="/mes-commandes" style={{
  textDecoration: "none",
  display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
}}>
  <span style={{ fontSize: "24px" }}>👤</span>
  <span style={{ fontSize: "11px", color: "#333", fontWeight: 600 }}>Mes Commandes</span>
</a>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        ::-webkit-scrollbar { display: none; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input[type="search"]::-webkit-search-cancel-button { display: none; }
      `}</style>
    </main>
  );
}
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";

function LoginClientContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleGoogle = async () => {
  try {
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    
    // ✅ Save itilizatè a nan localStorage
    const user = result.user;
    localStorage.setItem("ms_client_user", JSON.stringify({
      uid:         user.uid,
      displayName: user.displayName,
      email:       user.email,
      photoURL:    user.photoURL,
    }));

    const redirect = searchParams.get("redirect") ?? "/";
    const product  = searchParams.get("product") ?? "";
    const price    = searchParams.get("price") ?? "";
    const id       = searchParams.get("id") ?? "";
    router.push(product ? `${redirect}?product=${product}&price=${price}&id=${id}` : redirect);
  } catch {
    alert("Erè Google. Eseye ankò.");
  }
};

  return (
    <div style={{ minHeight: "100vh", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "24px", width: "100%", maxWidth: "400px", padding: "32px 24px", boxShadow: "0 20px 50px rgba(0,0,0,0.35)", textAlign: "center" }}>
        
        {/* Logo */}
        <div style={{ width: "56px", height: "56px", background: "#1a1a2e", borderRadius: "13px", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "12px", overflow: "hidden" }}>
          <img src="https://i.ibb.co/gLmkySCv/ab785ed1481b.jpg" alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 900, color: "#1a1a2e" }}>
          Million<span style={{ color: "#e63946" }}>Store</span>
        </h1>
        <p style={{ margin: "0 0 28px", fontSize: "13px", color: "#888" }}>
          🛒 Espace Client — Konekte pou kontinye achte
        </p>

        {/* Google Button */}
        <button onClick={handleGoogle} style={{ width: "100%", padding: "15px", background: "#fff", color: "#333", border: "1.5px solid #e8e8e8", borderRadius: "14px", fontSize: "15px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Konekte avèk Google
        </button>

        <div style={{ marginTop: "20px" }}>
            <a href="/mes-commandes" style={{
  display: "block", width: "100%", padding: "13px",
  background: "#f0f4ff", color: "#1a1a2e",
  border: "1.5px solid #e0e8ff", borderRadius: "12px",
  fontSize: "14px", fontWeight: 700, textDecoration: "none",
  textAlign: "center", marginBottom: "10px",
}}>
  🛒 Wè Komand mwen yo
</a>
          <a href="/" style={{ fontSize: "12px", color: "#888", textDecoration: "none" }}>← Retounen nan boutik la</a>
        </div>
      </div>
    </div>
  );
}

export default function LoginClientPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#1a1a2e" }} />}>
      <LoginClientContent />
    </Suspense>
  );
}
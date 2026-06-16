// AuthGate.jsx — gate the app behind a light email sign-in.
// While signed out: a branded magic-link screen.
// Once signed in: install the Supabase-backed window.storage, then render BakeLab.
import React, { useEffect, useState } from "react";
import { supabase, isConfigured } from "./supabase.js";
import { installSupabaseStorage } from "./storage-supabase.js";
import App from "./BakeLab.jsx";

function HapMark() {
  return (
    <svg width="44" height="44" viewBox="0 0 512 512" aria-hidden="true">
      <g transform="translate(256 256)">
        <rect x="-104" y="-104" width="208" height="208" transform="rotate(45)" rx="14" fill="none" stroke="#f5efe3" strokeWidth="14" />
        <rect x="-46" y="-46" width="92" height="92" transform="rotate(45)" fill="#b5651d" />
      </g>
    </svg>
  );
}

const wrap = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a0f07", padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif" };
const card = { width: "100%", maxWidth: 380, background: "#2f1c0f", border: "1.5px solid rgba(245,239,227,0.12)", borderRadius: 16, padding: 28, color: "#f5efe3", textAlign: "center" };
const title = { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 24, margin: "14px 0 4px" };
const sub = { fontSize: 13, color: "#b09070", margin: "0 0 22px", lineHeight: 1.5 };
const input = { width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 10, border: "1.5px solid rgba(245,239,227,0.18)", background: "#1a0f07", color: "#f5efe3", marginBottom: 12, boxSizing: "border-box" };
const button = { width: "100%", padding: "12px 14px", fontSize: 15, fontWeight: 600, borderRadius: 10, border: "none", background: "#b5651d", color: "#fffdf8", cursor: "pointer" };
const note = { fontSize: 12, color: "#b09070", marginTop: 16, lineHeight: 1.5 };
const signout = { position: "fixed", bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)", left: 12, zIndex: 9999, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontFamily: "'DM Sans', sans-serif", color: "#b09070", background: "rgba(26,15,7,0.5)", border: "1px solid rgba(245,239,227,0.14)", borderRadius: 999, padding: 0, cursor: "pointer", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", opacity: 0.7 };

export default function AuthGate() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // not configured → tell the developer clearly
  if (!isConfigured) {
    return (
      <div style={wrap}><div style={card}>
        <HapMark />
        <div style={title}>Not configured</div>
        <div style={sub}>Supabase keys are missing. Set <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> in your Vercel project settings, then redeploy.</div>
      </div></div>
    );
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  // once we have a user, install cloud storage BEFORE mounting the app
  useEffect(() => {
    if (session && session.user) {
      installSupabaseStorage(supabase, session.user.id);
      setStorageReady(true);
    } else {
      setStorageReady(false);
    }
  }, [session]);

  const sendLink = async () => {
    setError(""); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) setError(error.message); else setSent(true);
  };

  const signOut = async () => { await supabase.auth.signOut(); setSent(false); setEmail(""); };

  if (!ready) {
    return <div style={wrap}><div style={{ ...card, border: "none", background: "transparent" }}><HapMark /></div></div>;
  }

  if (session && storageReady) {
    return (<>
      <App />
      <button style={signout} onClick={signOut} title={"Sign out — " + session.user.email} aria-label="Sign out">⎋</button>
    </>);
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <HapMark />
        <div style={title}>BakeLab</div>
        <div style={sub}>House au Pain production studio.<br />Sign in to sync across your devices.</div>
        {sent ? (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Check your email</div>
            <div style={sub}>We sent a sign-in link to <b>{email}</b>. Open it on this device to continue.</div>
            <button style={{ ...button, background: "transparent", border: "1.5px solid rgba(245,239,227,0.2)", color: "#b09070" }} onClick={() => setSent(false)}>Use a different email</button>
          </div>
        ) : (
          <div>
            <input style={input} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && email.includes("@")) sendLink(); }} />
            <button style={button} disabled={busy || !email.includes("@")} onClick={sendLink}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
            {error && <div style={{ ...note, color: "#e09a8a" }}>{error}</div>}
            <div style={note}>No password — we email you a one-tap link each time you need to sign in on a new device.</div>
          </div>
        )}
      </div>
    </div>
  );
}

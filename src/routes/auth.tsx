import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — InfoMorph" },
      { name: "description", content: "Sign in to save InfoMorph projects, sources and generated content." },
      { property: "og:title", content: "Sign in — InfoMorph" },
      { property: "og:description", content: "Save your InfoMorph projects securely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
      else nav({ to: "/studio" });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/studio` } });
      if (error) setMsg(error.message);
      else if (!data.session) setMsg("Check your inbox to confirm your email, then sign in.");
      else nav({ to: "/studio" });
    }
    setBusy(false);
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/studio` });
    if (r.error) setMsg(r.error.message ?? "Google sign-in failed.");
    else if (!r.redirected) nav({ to: "/studio" });
  }

  return (
    <div style={{ minHeight: "100vh", padding: "0 18px" }}>
      <div className="studio-nav" style={{ background: "transparent" }}>
        <Link className="brand" to="/" style={{ paddingTop: 20 }}><span className="brandmark"><span></span></span>InfoMorph</Link>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <span className="step-label">{mode === "in" ? "WELCOME BACK" : "CREATE ACCOUNT"}</span>
        <h2>{mode === "in" ? "Sign in" : "Sign up"}</h2>
        <p style={{ fontSize: 13, color: "#777286", marginTop: 0 }}>Save projects, sources and verified outputs.</p>
        <input className="input-line" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input-line" type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {msg && <div className="source-feedback" role="status">{msg}</div>}
        <button className="generate" style={{ marginTop: 6 }} disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in ↗" : "Create account ↗"}</button>
        <button type="button" className="pill light" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} onClick={google}>Continue with Google</button>
        <p style={{ fontSize: 12, textAlign: "center", marginBottom: 0 }}>
          {mode === "in" ? "New here? " : "Have an account? "}
          <button type="button" className="small-btn" onClick={() => setMode(mode === "in" ? "up" : "in")}>{mode === "in" ? "Create an account" : "Sign in"}</button>
        </p>
        <p style={{ fontSize: 12, textAlign: "center" }}><Link to="/studio" style={{ color: "#5845d0", fontWeight: 800 }}>← Continue without signing in</Link></p>
      </form>
    </div>
  );
}

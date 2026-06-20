import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../providers/auth";
import { useToast } from "../providers/toast";
import { PasswordInput } from "../components/ui";
import { Icon } from "../components/Icon";

export function Login() {
  const { session, login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [email, setEmail] = useState("cfo@acme.test");
  const [password, setPassword] = useState("Treasury2026!");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (session) nav("/", { replace: true }); }, [session, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await login(email.trim(), password); nav("/", { replace: true }); }
    catch (err: any) { toast("error", "Sign-in failed", err.message || "Check your credentials."); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-brand">
        <div className="lb-top">
          <div className="sb-logo" style={{ width: 44, height: 44 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" width="26" height="26">
              <path d="M3 17l5-5 4 3 6-7" /><path d="M14 8h4v4" /><path d="M3 21h18" />
            </svg>
          </div>
          <div>
            <div className="lb-name">CryptoTrack Biz</div>
            <div className="lb-tag">Treasury Terminal</div>
          </div>
        </div>
        <h1>Crypto treasury, measured like a balance sheet.</h1>
        <p>Cost-basis valuation (FIFO / AVG / HIFO / LIFO), realized &amp; unrealized P/L, and live price alerts across every corporate portfolio — non-custodial and read-only.</p>
        <div className="lb-feats">
          {[["wallet", "Multi-portfolio NAV"], ["trendUp", "Realized & unrealized P/L"], ["bell", "Price & P/L alerts"], ["shield", "Audited, role-based access"]].map(([i, t]) => (
            <div key={t} className="lb-feat"><span className="lb-ico"><Icon name={i} size={16} /></span>{t}</div>
          ))}
        </div>
      </div>

      <div className="login-form">
        <form className="card card-pad" onSubmit={submit} style={{ width: "100%", maxWidth: 380 }}>
          <h2 style={{ fontFamily: "var(--font-display)", margin: "0 0 4px", fontSize: 22 }}>Sign in</h2>
          <p style={{ color: "var(--muted)", margin: "0 0 20px", fontSize: 13 }}>Access the treasury terminal.</p>
          <div className="field">
            <label>Work email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus required />
          </div>
          <div className="field">
            <label>Password</label>
            <PasswordInput value={password} onChange={setPassword} placeholder="••••••••" />
          </div>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={busy}>
            {busy ? "Signing in…" : "Sign in to terminal"}
          </button>
          <div className="login-demo">
            <span className="badge teal">Demo</span>
            <code>cfo@acme.test · Treasury2026!</code>
          </div>
        </form>
      </div>

      <style>{loginCss}</style>
    </div>
  );
}

const loginCss = `
.login-wrap { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; }
.login-brand { background: linear-gradient(150deg, var(--paper) 0%, var(--bg) 100%); border-right: 1px solid var(--line); padding: 56px 64px; display: flex; flex-direction: column; justify-content: center; gap: 28px; position: relative; overflow: hidden; }
.login-brand::after { content: ""; position: absolute; right: -120px; top: -120px; width: 360px; height: 360px; border-radius: 50%; background: radial-gradient(circle, var(--accent-soft), transparent 70%); }
.lb-top { display: flex; align-items: center; gap: 14px; }
.lb-name { font-family: var(--font-display); font-weight: 700; font-size: 18px; letter-spacing: -0.01em; }
.lb-tag { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--muted); }
.login-brand h1 { font-family: var(--font-display); font-size: clamp(28px, 3vw, 40px); line-height: 1.08; letter-spacing: -0.025em; margin: 0; max-width: 16ch; }
.login-brand p { color: var(--muted); font-size: 15px; line-height: 1.6; max-width: 46ch; margin: 0; }
.lb-feats { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 460px; }
.lb-feat { display: flex; align-items: center; gap: 10px; font-size: 13.5px; font-weight: 500; }
.lb-ico { width: 30px; height: 30px; border-radius: 8px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; }
.login-form { display: grid; place-items: center; padding: 40px; background: var(--bg); }
.login-demo { margin-top: 18px; padding-top: 16px; border-top: 1px dashed var(--line-strong); display: flex; align-items: center; gap: 10px; font-size: 12px; }
.login-demo code { font-family: var(--font-mono); color: var(--ink-2); }
@media (max-width: 900px) { .login-wrap { grid-template-columns: 1fr; } .login-brand { display: none; } }
`;

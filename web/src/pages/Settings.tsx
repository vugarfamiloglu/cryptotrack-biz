import { useEffect, useState } from "react";
import { useData } from "../hooks/useData";
import { useAuth } from "../providers/auth";
import { useToast } from "../providers/toast";
import { api, type SettingsResp } from "../api";
import { Spinner, EmptyState, Field, PasswordInput } from "../components/ui";
import { Icon } from "../components/Icon";

const METHODS = ["FIFO", "AVG", "HIFO", "LIFO"];
const CCYS = ["USD", "EUR", "GBP", "AZN", "TRY"];
const METHOD_HELP: Record<string, string> = {
  FIFO: "First-in, first-out — earliest lots sold first.",
  AVG: "Average cost — blended cost basis across all lots.",
  HIFO: "Highest-in, first-out — highest-cost lots sold first (minimizes gains).",
  LIFO: "Last-in, first-out — most recent lots sold first.",
};

export function Settings() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useData<SettingsResp>("/settings");
  const [org, setOrg] = useState({ name: "", baseCurrency: "USD", costBasisMethod: "FIFO" });
  const [slack, setSlack] = useState("");
  const [cg, setCg] = useState("");
  const [poll, setPoll] = useState(60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setOrg({ name: data.org.name, baseCurrency: data.org.base_currency, costBasisMethod: data.org.cost_basis_method });
      setPoll(data.pollSeconds);
    }
  }, [data]);

  if (!can("manager")) return <EmptyState icon="shield" title="Insufficient permissions" body="Only managers and owners can view organization settings." />;
  if (loading && !data) return <Spinner />;

  const save = async () => {
    setBusy(true);
    try {
      const settings: Record<string, string> = { poll_seconds: String(poll) };
      if (slack) settings.slack_webhook = slack;
      if (cg) settings.coingecko_api_key = cg;
      const r = await api.put<SettingsResp>("/settings", { org, settings });
      toast("success", "Settings saved", "Organization configuration updated.");
      setSlack(""); setCg(""); reload();
    } catch (e: any) { toast("error", "Save failed", e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Settings</h1><p>Organization defaults, valuation method, and provider credentials (encrypted at rest).</p></div>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h3>Organization</h3></div>
          <div className="card-pad">
            <Field label="Organization name"><input className="input" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} /></Field>
            <div className="form-grid">
              <Field label="Base currency"><select className="select" value={org.baseCurrency} onChange={(e) => setOrg({ ...org, baseCurrency: e.target.value })}>{CCYS.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Cost-basis method"><select className="select" value={org.costBasisMethod} onChange={(e) => setOrg({ ...org, costBasisMethod: e.target.value })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 0" }}><Icon name="info" size={13} /> {METHOD_HELP[org.costBasisMethod]}</p>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Pricing &amp; notifications</h3></div>
          <div className="card-pad">
            <Field label="Price provider"><input className="input" value={data?.priceProvider || "coingecko"} disabled /></Field>
            <Field label="Poll interval (seconds)" hint="How often live prices refresh (minimum 15s)."><input className="input mono" type="number" min={15} value={poll} onChange={(e) => setPoll(Number(e.target.value))} /></Field>
            <Field label="CoinGecko API key" hint={data?.hasSecret.coingecko_api_key ? "A key is stored (leave blank to keep)." : "Optional — raises rate limits."}>
              <PasswordInput value={cg} onChange={setCg} placeholder={data?.hasSecret.coingecko_api_key ? "••••••••  (stored)" : "cg-demo-…"} />
            </Field>
            <Field label="Slack webhook" hint={data?.slackOn ? "A webhook is stored (leave blank to keep)." : "Posts alert notifications to a channel."}>
              <PasswordInput value={slack} onChange={setSlack} placeholder={data?.slackOn ? "••••••••  (stored)" : "https://hooks.slack.com/…"} />
            </Field>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <span className={`badge ${data?.slackOn ? "pos" : "muted"}`}><span className="dot-s" /> Slack {data?.slackOn ? "configured" : "off"}</span>
              <span className={`badge ${data?.hasSecret.coingecko_api_key ? "pos" : "muted"}`}><span className="dot-s" /> API key {data?.hasSecret.coingecko_api_key ? "set" : "keyless"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "var(--s5)" }}>
        <div className="card-pad" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span className="asset-sym" style={{ width: 34, height: 34, background: "var(--accent-soft)", color: "var(--accent)" }}><Icon name="shield" size={17} /></span>
          <div>
            <b style={{ fontFamily: "var(--font-display)" }}>Non-custodial by design</b>
            <p style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0 0", maxWidth: "70ch" }}>
              CryptoTrack Biz never holds private keys, signs transactions, or moves funds. It reads public market prices and your own transaction records to compute valuation and P/L. Secrets are encrypted at rest with AES-256-GCM.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

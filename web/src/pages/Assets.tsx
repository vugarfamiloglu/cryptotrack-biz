import { useState } from "react";
import { useData } from "../hooks/useData";
import { useLive } from "../providers/live";
import { useAuth } from "../providers/auth";
import { useToast } from "../providers/toast";
import { api, type Asset } from "../api";
import { DataTable, type Column } from "../components/DataTable";
import { PL, Spinner, EmptyState, Modal, Field, AssetChip } from "../components/ui";
import { Icon } from "../components/Icon";
import { money } from "../format";

export function Assets() {
  const live = useLive();
  const { can } = useAuth();
  const toast = useToast();
  const { data: assets, loading, reload } = useData<Asset[]>("/assets", [live.asOf]);
  const [adding, setAdding] = useState(false);

  // merge live tick over fetched price
  const rows = (assets || []).map((a) => {
    const tick = live.prices[a.id];
    return { ...a, priceUsd: tick?.price ?? a.priceUsd, change24h: tick?.change24h ?? a.change24h };
  });

  const cols: Column<Asset>[] = [
    { key: "symbol", label: "Asset", width: 200, render: (a) => <AssetChip symbol={a.symbol} name={a.name} /> },
    { key: "id", label: "CoinGecko id", width: 150, render: (a) => <span className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>{a.id}</span> },
    { key: "priceUsd", label: "Price (USD)", num: true, width: 140, render: (a) => a.priceUsd ? money(a.priceUsd, "USD") : "—" },
    { key: "change24h", label: "24h", num: true, width: 110, render: (a) => a.change24h == null ? "—" : <PL value={a.change24h} asPct /> },
    { key: "isActive", label: "Status", width: 100, render: (a) => <span className={`badge ${a.isActive ? "teal" : "muted"}`}><span className="dot-s" />{a.isActive ? "tracked" : "off"}</span> },
  ];

  if (loading && !assets) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div><h1>Tracked Assets</h1><p>Priced live from CoinGecko. Last-good values are kept if the feed is briefly unavailable.</p></div>
        {can("manager") && <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" /> Add asset</button>}
      </div>
      <div className="card">
        <DataTable columns={cols} rows={rows} rowKey={(a) => a.id}
          empty={<EmptyState icon="coins" title="No assets" body="Add an asset by its CoinGecko id (e.g. bitcoin, ethereum)." />} />
      </div>
      {adding && <AddAsset onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </>
  );
}

function AddAsset({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ id: "", symbol: "", name: "", decimals: 8 });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.id || !f.symbol || !f.name) return toast("warn", "All fields required");
    setBusy(true);
    try { await api.post("/assets", f); toast("success", "Asset added", `${f.symbol} — will price on next poll`); onDone(); }
    catch (e: any) { toast("error", "Failed", e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add tracked asset" sub="Identify the coin by its CoinGecko id so prices resolve automatically." onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Adding…" : "Add asset"}</button></>}>
      <Field label="CoinGecko id" hint="Lowercase slug, e.g. bitcoin, ethereum, solana."><input className="input mono" value={f.id} autoFocus onChange={(e) => setF({ ...f, id: e.target.value })} placeholder="cardano" /></Field>
      <div className="form-grid">
        <Field label="Symbol"><input className="input" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} placeholder="ADA" /></Field>
        <Field label="Decimals"><input className="input mono" type="number" value={f.decimals} onChange={(e) => setF({ ...f, decimals: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Cardano" /></Field>
    </Modal>
  );
}

import { useData } from "../hooks/useData";
import { type AuditRow } from "../api";
import { DataTable, type Column } from "../components/DataTable";
import { Spinner, EmptyState } from "../components/ui";
import { dateTimeStr } from "../format";

export function Audit() {
  const { data, loading } = useData<AuditRow[]>("/audit");
  const cols: Column<AuditRow>[] = [
    { key: "at", label: "When", width: 150, render: (r) => dateTimeStr(r.at) },
    { key: "actor", label: "Actor", width: 160, render: (r) => <><b style={{ fontWeight: 600 }}>{r.actor}</b> <span className="badge muted" style={{ marginLeft: 6 }}>{r.role}</span></> },
    { key: "action", label: "Action", width: 150, render: (r) => <span className="mono badge teal">{r.action}</span> },
    { key: "entity", label: "Entity", width: 110 },
    { key: "detail", label: "Detail", width: 220, render: (r) => <span style={{ color: "var(--muted)" }}>{r.detail || "—"}</span> },
    { key: "ip", label: "IP", width: 120, render: (r) => <span className="mono" style={{ color: "var(--faint)", fontSize: 12 }}>{r.ip || "—"}</span> },
  ];
  if (loading && !data) return <Spinner />;
  return (
    <>
      <div className="page-head"><div><h1>Audit Log</h1><p>Every state change is recorded with actor, role, and source. Tamper-evident governance trail.</p></div></div>
      <div className="card">
        <DataTable columns={cols} rows={data || []} rowKey={(r) => r.id}
          empty={<EmptyState icon="shield" title="No audit entries" body="Actions you take will be recorded here." />} />
      </div>
    </>
  );
}

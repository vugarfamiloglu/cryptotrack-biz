import { useRef, useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  num?: boolean;
  width?: number;
  render?: (row: T) => ReactNode;
}
interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  empty?: ReactNode;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty }: Props<T>) {
  const [widths, setWidths] = useState<Record<string, number>>(
    () => Object.fromEntries(columns.map((c) => [c.key, c.width ?? 140])),
  );
  const drag = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const onDown = (e: React.PointerEvent, key: string) => {
    e.preventDefault(); e.stopPropagation();
    drag.current = { key, startX: e.clientX, startW: widths[key] ?? 140 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const w = Math.max(64, drag.current.startW + (e.clientX - drag.current.startX));
    setWidths((s) => ({ ...s, [drag.current!.key]: w }));
  };
  const onUp = () => { drag.current = null; };

  if (!rows.length && empty) return <>{empty}</>;

  return (
    <div className="tbl-wrap">
      <table className="tbl" style={{ tableLayout: "fixed", width: "100%" }}>
        <colgroup>{columns.map((c) => <col key={c.key} style={{ width: widths[c.key] }} />)}</colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.num ? "num" : ""}>
                {c.label}
                <span className="col-resize" onPointerDown={(e) => onDown(e, c.key)} onPointerMove={onMove} onPointerUp={onUp} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={onRowClick ? "clickable" : ""} onClick={() => onRowClick?.(r)}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? "num mono" : ""} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.render ? c.render(r) : String((r as any)[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

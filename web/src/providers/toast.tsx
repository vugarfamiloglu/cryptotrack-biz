import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { Icon } from "../components/Icon";

type Kind = "success" | "error" | "warn" | "info";
interface Toast { id: number; kind: Kind; title: string; msg?: string; }
const ToastCtx = createContext<{ toast: (kind: Kind, title: string, msg?: string) => void }>({ toast: () => {} });

let seq = 1;
const ICONS: Record<Kind, string> = { success: "check", error: "x", warn: "alert", info: "info" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((kind: Kind, title: string, msg?: string) => {
    const id = seq++;
    setItems((s) => [...s, { id, kind, title, msg }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 5200);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="toaster" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role="status" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}>
            <span className={`t-icon ${t.kind === "success" ? "pl-pos" : t.kind === "error" ? "pl-neg" : ""}`}><Icon name={ICONS[t.kind]} /></span>
            <div className="t-body"><b>{t.title}</b>{t.msg && <span>{t.msg}</span>}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx).toast;

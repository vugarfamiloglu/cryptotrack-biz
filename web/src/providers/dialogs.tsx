import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ConfirmOpts { title: string; body?: string; confirmLabel?: string; danger?: boolean; }
interface PromptOpts { title: string; body?: string; label?: string; placeholder?: string; initial?: string; multiline?: boolean; confirmLabel?: string; }

interface DialogState {
  kind: "confirm" | "prompt"; opts: ConfirmOpts & PromptOpts;
  resolve: (v: any) => void; value: string;
}
const Ctx = createContext<{
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  promptText: (o: PromptOpts) => Promise<string | null>;
}>({ confirm: async () => false, promptText: async () => null });

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);

  const confirm = useCallback((opts: ConfirmOpts) =>
    new Promise<boolean>((resolve) => setState({ kind: "confirm", opts, resolve, value: "" })), []);
  const promptText = useCallback((opts: PromptOpts) =>
    new Promise<string | null>((resolve) => setState({ kind: "prompt", opts, resolve, value: opts.initial ?? "" })), []);

  const close = (result: any) => { state?.resolve(result); setState(null); };

  return (
    <Ctx.Provider value={{ confirm, promptText }}>
      {children}
      {state && (
        <div className="modal-veil" onMouseDown={(e) => e.target === e.currentTarget && close(state.kind === "confirm" ? false : null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <h2>{state.opts.title}</h2>
              {state.opts.body && <p>{state.opts.body}</p>}
            </div>
            {state.kind === "prompt" && (
              <div className="modal-body">
                {state.opts.label && <label className="field" style={{ marginBottom: 0 }}><span style={{ fontSize: 12, fontWeight: 600 }}>{state.opts.label}</span></label>}
                {state.opts.multiline ? (
                  <textarea className="input mono" rows={6} placeholder={state.opts.placeholder} autoFocus
                    value={state.value} onChange={(e) => setState({ ...state, value: e.target.value })} />
                ) : (
                  <input className="input" placeholder={state.opts.placeholder} autoFocus value={state.value}
                    onChange={(e) => setState({ ...state, value: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && close(state.value)} />
                )}
              </div>
            )}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => close(state.kind === "confirm" ? false : null)}>Cancel</button>
              <button className={`btn ${state.opts.danger ? "btn-danger" : "btn-primary"}`}
                onClick={() => close(state.kind === "confirm" ? true : state.value)}>
                {state.opts.confirmLabel ?? (state.opts.danger ? "Delete" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
export const useDialogs = () => useContext(Ctx);

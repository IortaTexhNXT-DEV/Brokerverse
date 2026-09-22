import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../api';

/* ---------- Toasts ---------- */
interface Toast { id: number; text: string; kind: 'ok' | 'error' }
let toastSeq = 0;
const ToastCtx = createContext<{ push: (text: string, kind?: 'ok' | 'error') => void } | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++toastSeq;
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);
  const v = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={v}>
      {children}
      <div className="toasts" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  const v = useContext(ToastCtx);
  return v ?? { push: () => {} };
}

/** Runs an async action, surfacing errors as toasts. */
export function useAction() {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) push(okMsg);
      return r;
    } catch (e) {
      push(e instanceof ApiError ? e.message : (e as Error).message, 'error');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [push]);
  return { run, busy };
}

/** Simple data loader with reload. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((d) => { if (alive) { setData(d); setError(null); } }).catch((e) => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/* ---------- Layout bits ---------- */
export function PageHead({ code, title, sub, children }: { code?: string; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {code && <span className="module-code">{code}</span>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Kpi({ n, label, tone }: { n: ReactNode; label: string; tone?: 'green' | 'warn' | 'navy' }) {
  return <div className={`kpi ${tone ?? ''}`}><div className="n">{n}</div><div className="l">{label}</div></div>;
}

const TONES: Record<string, string> = {
  in_force: 'ok', paid: 'ok', approved: 'ok', settled: 'ok', reconciled: 'ok', clear: 'ok', resolved: 'ok', active: 'ok', open: 'navy', converted: 'ok',
  pending_approval: 'warn', pending: 'warn', partial: 'warn', review: 'warn', under_review: 'warn', disposition_required: 'warn', in_progress: 'warn', quoted: 'navy', registered: 'navy',
  rejected: 'bad', cancelled: 'bad', declined: 'bad', hit: 'bad', disabled: 'bad', fallout: 'bad', excluded: 'muted',
  closed: 'muted', expired: 'muted', renewed: 'muted', withdrawn: 'muted', dispositioned: 'muted', masterlist: 'ok', renewal: 'warn', high: 'bad', medium: 'warn', low: 'ok',
};
export function Pill({ value }: { value: string | null | undefined }) {
  const v = value ?? '';
  return <span className={`pill ${TONES[v] ?? ''}`}>{v.replace(/_/g, ' ')}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="lbl">{label}</span>{children}{hint && <span className="hint">{hint}</span>}</label>;
}

export function Alert({ kind = 'info', children }: { kind?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  return <div className={`alert ${kind}`}>{children}</div>;
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <aside className="drawer" role="dialog" aria-label={title}>
      <button className="btn sm ghost close" onClick={onClose} aria-label="Close">✕</button>
      <h2 style={{ fontSize: 18, marginBottom: 14 }}>{title}</h2>
      {children}
    </aside>
  );
}

export interface Column<T> { key: string; label: string; num?: boolean; render?: (row: T) => ReactNode; wrap?: boolean }
export function DataTable<T extends Record<string, any>>({ rows, cols, empty = 'Nothing to show yet.', onRow, rowKey = 'id' }: { rows: T[] | null | undefined; cols: Column<T>[]; empty?: string; onRow?: (row: T) => void; rowKey?: string }) {
  return (
    <div className="tablewrap">
      <table>
        <thead><tr>{cols.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {!rows || rows.length === 0 ? (
            <tr><td colSpan={cols.length}><div className="empty">{rows ? empty : 'Loading…'}</div></td></tr>
          ) : rows.map((r, i) => (
            <tr key={r[rowKey] ?? i} onClick={onRow ? () => onRow(r) : undefined} style={onRow ? { cursor: 'pointer' } : undefined}>
              {cols.map((c) => <td key={c.key} className={`${c.num ? 'num' : ''} ${c.wrap ? 'wrap' : ''}`}>{c.render ? c.render(r) : String(r[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return <div className="tabs">{tabs.map((t) => <button key={t.key} className={t.key === active ? 'active' : ''} onClick={() => onChange(t.key)}>{t.label}</button>)}</div>;
}

/** Client picker backed by search. */
export function ClientSelect({ value, onChange, clients, required = true }: { value: number | ''; onChange: (id: number | '') => void; clients: any[] | null; required?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')} required={required}>
      <option value="">Select client…</option>
      {(clients ?? []).map((c) => <option key={c.id} value={c.id} disabled={['hit', 'declined'].includes(c.screening_status)}>{c.client_no} · {c.name}{['hit', 'declined'].includes(c.screening_status) ? ' (blocked)' : ''}</option>)}
    </select>
  );
}

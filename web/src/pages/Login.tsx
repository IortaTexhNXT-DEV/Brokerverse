import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MODULES } from '@brokerverse/shared';
import { useAuth } from '../auth';
import { Alert, Field } from '../components/ui';

const PERSONAS = ['admin', 'nb.officer', 'uw.head', 'cashier', 'collections', 'accountant', 'fin.head', 'claims', 'renewals', 'ri.officer', 'eb.officer', 'compliance'];

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await login(username.trim(), password); nav('/'); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login">
      <section className="hero">
        <div>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 22 }}>BDO<span style={{ color: 'var(--gold)' }}>Insure</span><sup style={{ fontSize: 9 }}>®</sup> <span style={{ opacity: 0.7, fontWeight: 400, fontSize: 16 }}>· BrokerVerse</span></div>
          <h1 style={{ marginTop: 40 }}>We find ways, so you can <span>insure what matters.</span></h1>
          <p style={{ marginTop: 16 }}>The BDO Insure core broking platform: sixteen modules, twelve personas, maker-checker on every financial decision and a double-entry ledger underneath. Delivered by iorta TechNXT.</p>
          <div className="modules">{MODULES.map((m) => <span key={m.code}>{m.code} · {m.name}</span>)}</div>
        </div>
        <div style={{ fontSize: 12, color: '#9DB6E6' }}>© BDO Insurance &amp; Reinsurance Brokers, Inc. · Delivered by iorta TechNXT</div>
      </section>
      <section className="panel">
        <div className="box">
          <img src={`${import.meta.env.BASE_URL}bdo-insure.svg`} alt="BDO Insure" />
          <h2>Sign in</h2>
          <p className="sub">Use your persona credentials. Access is limited to the modules your role owns.</p>
          <form onSubmit={submit}>
            <Field label="Username"><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required /></Field>
            <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
            {error && <Alert kind="error">{error}</Alert>}
            <button className="btn primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <div className="delivered">Delivered by <img src={`${import.meta.env.BASE_URL}iorta-technxt-logo.png`} alt="iorta TechNXT" /></div>
          <div className="personas">
            Demo personas (password <span className="mono">Broker@123</span>, admin uses <span className="mono">Admin@123</span>):<br />
            {PERSONAS.map((p) => <button key={p} type="button" onClick={() => { setUsername(p); setPassword(p === 'admin' ? 'Admin@123' : 'Broker@123'); }}>{p}</button>)}
          </div>
        </div>
      </section>
    </div>
  );
}

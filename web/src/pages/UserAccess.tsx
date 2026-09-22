import { useState, type FormEvent } from 'react';
import { get, post, patch, fmtDateTime } from '../api';
import { useAuth } from '../auth';
import { DataTable, Field, PageHead, Pill, useAction, useLoad } from '../components/ui';

export function UserAccessPage() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const users = useLoad(() => get(`/api/users?q=${encodeURIComponent(q)}`), [q]);
  const roles = useLoad(() => get('/api/users/roles'), []);
  const { run, busy } = useAction();
  const [form, setForm] = useState({ username: '', password: '', fullName: '', email: '', roleCode: 'NB_OFFICER', department: '' });
  async function submit(e: FormEvent) { e.preventDefault(); if (await run(() => post('/api/users', form), 'User created (joiner)')) { setForm({ ...form, username: '', password: '', fullName: '', email: '' }); users.reload(); } }
  const upd = async (id: number, body: Record<string, unknown>, msg: string) => { if (await run(() => patch(`/api/users/${id}`, body), msg)) users.reload(); };
  return (
    <>
      <PageHead code="UAM" title="User Access Maintenance" sub="Joiner / mover / leaver lifecycle with one persona per user. Segregation of duties: you cannot change your own role or status." />
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <form className="card" onSubmit={submit}>
            <h2>Joiner</h2>
            <div className="form-grid">
              <Field label="Username"><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required minLength={3} /></Field>
              <Field label="Temporary password"><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} /></Field>
              <Field label="Full name"><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></Field>
              <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
              <Field label="Persona"><select value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>{(roles.data?.roles ?? []).map((r: any) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></Field>
              <Field label="Department"><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            </div>
            <div className="row end" style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} type="submit">Create user</button></div>
          </form>
          <div className="search"><input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <DataTable rows={users.data?.users} cols={[
            { key: 'username', label: 'Username', render: (r) => <span className="mono">{r.username}</span> }, { key: 'full_name', label: 'Name' }, { key: 'role_name', label: 'Persona' }, { key: 'department', label: 'Dept.' }, { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'last_login_at', label: 'Last login', render: (r) => fmtDateTime(r.last_login_at) },
            { key: 'act', label: '', render: (r) => r.id === user?.id ? <span className="small muted">you</span> : <span className="row">
              <select value={r.role_code} disabled={busy} onChange={(e) => upd(r.id, { roleCode: e.target.value }, 'Persona changed (mover)')} style={{ fontSize: 12 }}>{(roles.data?.roles ?? []).map((x: any) => <option key={x.code} value={x.code}>{x.name}</option>)}</select>
              <button className="btn sm" disabled={busy} onClick={() => upd(r.id, { status: r.status === 'active' ? 'disabled' : 'active' }, r.status === 'active' ? 'User disabled (leaver)' : 'User re-enabled')}>{r.status === 'active' ? 'Disable' : 'Enable'}</button>
              <button className="btn sm" disabled={busy} onClick={() => { const p = window.prompt('New password'); if (p) upd(r.id, { password: p }, 'Password reset'); }}>Reset</button>
            </span> },
          ]} />
        </div>
        <div className="card">
          <h2>Personas and entitlements</h2>
          <DataTable rows={roles.data?.roles} rowKey="code" cols={[{ key: 'name', label: 'Persona' }, { key: 'can_approve', label: 'Checker', render: (r) => (r.can_approve ? '✓' : '—') }, { key: 'modules', label: 'Modules', wrap: true, render: (r) => r.modules.map((m: string) => <span key={m} className="pill" style={{ marginRight: 4 }}>{m}</span>) }]} />
        </div>
      </div>
    </>
  );
}

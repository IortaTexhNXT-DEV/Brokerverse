import { useState } from 'react';
import { get, post, fmtDateTime } from '../api';
import { useAuth } from '../auth';
import { DataTable, PageHead, Pill, Tabs, useAction, useLoad } from '../components/ui';

export function ApprovalsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('pending');
  const { data, reload } = useLoad(() => get(`/api/approvals?status=${tab === 'all' ? '' : tab}`), [tab]);
  const { run, busy } = useAction();
  async function decide(id: number, decision: 'approved' | 'rejected') {
    const note = window.prompt(decision === 'approved' ? 'Approval note (optional)' : 'Rejection reason') ?? undefined;
    if (decision === 'rejected' && !note) return;
    if (await run(() => post(`/api/approvals/${id}/decide`, { decision, note }), `Request ${decision}`)) reload();
  }
  return (
    <>
      <PageHead code="CORE" title="Approvals queue" sub="Maker-checker for policy issuance, renewals, remittances and claim settlements. A maker can never check their own request." />
      <Tabs tabs={[{ key: 'pending', label: 'Pending' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }, { key: 'all', label: 'All' }]} active={tab} onChange={setTab} />
      <DataTable rows={data?.approvals} empty="Queue is clear." cols={[
        { key: 'id', label: '#' }, { key: 'request_type', label: 'Type', render: (r) => <Pill value={r.request_type} /> }, { key: 'summary', label: 'Request', wrap: true },
        { key: 'maker_name', label: 'Maker' }, { key: 'maker_note', label: 'Maker note', wrap: true }, { key: 'created_at', label: 'Raised', render: (r) => fmtDateTime(r.created_at) },
        { key: 'status', label: 'Status', render: (r) => <Pill value={r.status} /> }, { key: 'checker_name', label: 'Checker', render: (r) => r.checker_name ?? '—' },
        { key: 'act', label: '', render: (r) => r.status === 'pending' && user?.canApprove ? (
          r.maker_id === user.id ? <span className="small muted">your own request</span> : <span className="row"><button className="btn sm green" disabled={busy} onClick={() => decide(r.id, 'approved')}>Approve</button><button className="btn sm danger" disabled={busy} onClick={() => decide(r.id, 'rejected')}>Reject</button></span>
        ) : null },
      ]} />
    </>
  );
}

export function AuditPage() {
  const [q, setQ] = useState('');
  const { data } = useLoad(() => get(`/api/audit?q=${encodeURIComponent(q)}`), [q]);
  return (
    <>
      <PageHead code="CORE" title="Audit trail" sub="Every mutating action, per field, with the acting user and before/after state." />
      <div className="search" style={{ marginBottom: 12 }}><input placeholder="Filter by action or user…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <DataTable rows={data?.entries} cols={[
        { key: 'at', label: 'When', render: (r) => fmtDateTime(r.at) }, { key: 'username', label: 'User' }, { key: 'action', label: 'Action', render: (r) => <span className="mono">{r.action}</span> },
        { key: 'entity', label: 'Entity', render: (r) => `${r.entity} #${r.entity_id ?? ''}` }, { key: 'after', label: 'After', wrap: true, render: (r) => <span className="mono small">{r.after ? JSON.stringify(r.after).slice(0, 160) : '—'}</span> },
      ]} />
    </>
  );
}

export function OutboxPage() {
  const { data } = useLoad(() => get('/api/outbox'), []);
  return (
    <>
      <PageHead code="CORE" title="Email outbox" sub="E-policies, receipts, renewal notices, reminders and remittance schedules captured for validation (SMTP-ready)." />
      <DataTable rows={data?.emails} cols={[{ key: 'created_at', label: 'When', render: (r) => fmtDateTime(r.created_at) }, { key: 'template', label: 'Template', render: (r) => <Pill value={r.template} /> }, { key: 'to_addr', label: 'To' }, { key: 'subject', label: 'Subject', wrap: true }]} />
    </>
  );
}

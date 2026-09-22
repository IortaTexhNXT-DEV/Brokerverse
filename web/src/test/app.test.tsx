import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth';
import { ToastProvider } from '../components/ui';
import { AppRoutes } from '../App';
import { Shell } from '../components/Shell';
import type { UserView } from '@brokerverse/shared';

const cashier: UserView = { id: 4, username: 'cashier', fullName: 'Liza Bautista', email: 'c@x', roleCode: 'CASHIER', department: 'Operations', status: 'active', modules: ['OPS', 'CLXN', 'RPT'], canApprove: false };

function mockFetch(routes: Record<string, unknown>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input).split('?')[0];
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    const body = key ? routes[key] : { error: `no mock for ${url}` };
    return new Response(JSON.stringify(body), { status: key ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => { localStorage.clear(); });

describe('Shell navigation', () => {
  it('only shows modules the persona is entitled to', () => {
    render(<MemoryRouter><AuthProvider initialUser={cashier}><Shell /></AuthProvider></MemoryRouter>);
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Collections')).toBeInTheDocument();
    expect(screen.queryByText('User Access Maintenance')).not.toBeInTheDocument();
    expect(screen.queryByText('Accounting & Disbursement')).not.toBeInTheDocument();
    expect(screen.getByAltText('iorta TechNXT')).toBeInTheDocument();
    expect(screen.getByText('Liza Bautista')).toBeInTheDocument();
  });
});

describe('Routing', () => {
  it('redirects anonymous users to login', () => {
    render(<MemoryRouter initialEntries={['/claims']}><AuthProvider><ToastProvider><AppRoutes /></ToastProvider></AuthProvider></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
  it('refuses hand-typed URLs outside the persona entitlement', () => {
    mockFetch({});
    render(<MemoryRouter initialEntries={['/user-access']}><AuthProvider initialUser={cashier}><ToastProvider><AppRoutes /></ToastProvider></AuthProvider></MemoryRouter>);
    expect(screen.getByText('Not entitled')).toBeInTheDocument();
  });
  it('renders the collections register with ageing from the API', async () => {
    mockFetch({ '/api/collections/outstanding': { invoices: [{ id: 1, invoice_no: 'INV-2026-00001', policy_no: 'POL-2026-00001', client_name: 'Acme', client_id: 1, due_date: '2026-09-01', balance: 1234.5, bucket: '0-30', status: 'open' }], buckets: { current: 0, '0-30': 1234.5 }, total: 1234.5 } });
    render(<MemoryRouter initialEntries={['/collections']}><AuthProvider initialUser={cashier}><ToastProvider><AppRoutes /></ToastProvider></AuthProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('INV-2026-00001')).toBeInTheDocument());
    expect(screen.getAllByText('₱1,234.50').length).toBeGreaterThan(0);
    expect(screen.getByText('0-30')).toBeInTheDocument();
  });
});

describe('Login', () => {
  it('submits credentials and lands on the dashboard', async () => {
    const fetchMock = mockFetch({ '/api/auth/login': { token: 't', user: cashier }, '/api/reports/dashboard': { kpis: { policies_in_force: 3, premium_ytd: 100, commission_ytd: 10, outstanding_premium: 0, open_claims: 0, pending_approvals: 0, renewals_due: 0, screening_hits: 0 }, byProduct: [], byMonth: [], claimsByStatus: [] } });
    render(<MemoryRouter initialEntries={['/login']}><AuthProvider><ToastProvider><AppRoutes /></ToastProvider></AuthProvider></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('Username'), 'cashier');
    await userEvent.type(screen.getByLabelText('Password'), 'Broker@123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByText(/Good day, Liza/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/login'), expect.objectContaining({ method: 'POST' }));
    expect(localStorage.getItem('bv.token')).toBe('t');
  });
});

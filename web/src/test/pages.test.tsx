import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth';
import { ToastProvider } from '../components/ui';
import { AppRoutes } from '../App';
import { fixtureFor } from './fixtures';
import type { UserView } from '@brokerverse/shared';

const ALL = ['NB', 'OPS', 'CLXN', 'ADA', 'CLM', 'RN', 'RI', 'EB', 'CSF', 'SS', 'PM', 'SP', 'UAM', 'DM', 'RPT', 'CORE'];
const admin: UserView = { id: 1, username: 'admin', fullName: 'System Administrator', email: 'a@x', roleCode: 'ADMIN', department: 'IT', status: 'active', modules: ALL, canApprove: true };

let calls: { url: string; method: string; body?: any }[] = [];
beforeEach(() => {
  calls = [];
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(fixtureFor(url, init?.method ?? 'GET')), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  vi.spyOn(window, 'prompt').mockImplementation(() => '42');
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
});

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider initialUser={admin}><ToastProvider><AppRoutes /></ToastProvider></AuthProvider></MemoryRouter>);
const clickTab = async (name: string) => userEvent.click(screen.getByRole('button', { name }));
const posted = (suffix: string) => calls.find((c) => c.method === 'POST' && c.url.endsWith(suffix));

describe('every module page renders its register from the API', () => {
  const pages: [string, RegExp][] = [
    ['/', /Good day/], ['/new-business', /New Business/], ['/operations', /Operations/], ['/collections', /Collections/], ['/accounting', /Accounting & Disbursement/],
    ['/claims', /Claims/], ['/renewals', /Renewal/], ['/reinsurance', /Reinsurance/], ['/employee-benefits', /Employee Benefits/], ['/servicing', /Customer Servicing/],
    ['/screening', /Sanction Screening/], ['/products', /Product Maintenance/], ['/submitted-policies', /Submitted Policies/], ['/user-access', /User Access/],
    ['/data-migration', /Data Migration/], ['/reports', /Reports & Analytics/], ['/approvals', /Approvals queue/], ['/audit', /Audit trail/], ['/outbox', /Email outbox/],
  ];
  for (const [path, heading] of pages) {
    it(`renders ${path}`, async () => {
      renderAt(path);
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
      await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    });
  }
});

describe('New Business page drives the proposal → placement → booking lifecycle', () => {
  it('shows quotation actions per status and the placement board', async () => {
    renderAt('/new-business');
    await waitFor(() => expect(screen.getByText('QT-1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Send proposal' }));
    await waitFor(() => expect(posted('/quotations/1/send-proposal')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Client accepted' }));
    await waitFor(() => expect(posted('/quotations/2/decision')?.body).toEqual({ decision: 'accepted' }));
    await userEvent.click(screen.getByRole('button', { name: 'Request placement' }));
    await waitFor(() => expect(posted('/quotations/3/request-placement')).toBeTruthy());
    await clickTab('Placement');
    await waitFor(() => expect(screen.getByText('Missing OR/CR')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Placed \/ e-policy received/ }));
    await waitFor(() => expect(posted('/policies/2/placement-response')?.body.outcome).toBe('placed'));
    await userEvent.click(screen.getByRole('button', { name: 'Re-submit placement' }));
    await waitFor(() => expect(posted('/policies/3/resubmit-placement')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Book & invoice' }));
    await waitFor(() => expect(posted('/policies/4/book')).toBeTruthy());
  });
  it('rates a quotation live and submits it; policy drawer shows lifecycle data', async () => {
    renderAt('/new-business');
    await waitFor(() => expect(screen.getByText('QT-1')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Client'), '1');
    await userEvent.selectOptions(screen.getByLabelText('Product'), '1');
    await userEvent.selectOptions(screen.getByLabelText('Insurer'), '1');
    await userEvent.type(screen.getByLabelText('Sum insured (₱)'), '1000000');
    await waitFor(() => expect(screen.getByTestId('rating')).toHaveTextContent('Total ₱15,656.25'));
    await userEvent.click(screen.getByRole('button', { name: 'Create quotation' }));
    await waitFor(() => expect(posted('/api/new-business/quotations')?.body.sumInsured).toBe(1000000));
    await clickTab('Policies');
    await waitFor(() => expect(screen.getByText('POL-2026-00001')).toBeInTheDocument());
    await userEvent.click(screen.getByText('POL-2026-00001'));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('INV-2026-00001'));
    expect(screen.getByRole('dialog')).toHaveTextContent('END-1');
    await userEvent.click(screen.getByRole('button', { name: /e-Policy fallout/ }));
    await waitFor(() => expect(posted('/policies/1/epolicy-exception')).toBeTruthy());
  });
});

describe('Operations page: cashiering, PDC, unapplied, direct payments, endorsements, reconciliation', () => {
  it('records a payment and handles held / unapplied payments', async () => {
    renderAt('/operations');
    await waitFor(() => expect(screen.getByText('INV-2026-00001')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
    await userEvent.selectOptions(screen.getByLabelText('Channel'), 'otc_cheque');
    await userEvent.type(screen.getByLabelText('Cheque no.'), '000111');
    await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(posted('/api/operations/payments')?.body.channel).toBe('otc_cheque'));
    await clickTab('Payments / PDC / UPP');
    await waitFor(() => expect(screen.getByText('PAY-1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Matured' }));
    await waitFor(() => expect(posted('/payments/1/mature')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Bounced' }));
    await waitFor(() => expect(posted('/payments/1/bounce')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Apply to invoice' }));
    await waitFor(() => expect(posted('/payments/2/apply')?.body).toEqual({ invoiceId: 42 }));
  });
  it('direct payments, endorsements and production reconciliation', async () => {
    renderAt('/operations');
    await clickTab('Direct payments');
    await waitFor(() => expect(screen.getByText('DP-1')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText(/Policy no. paid directly/), 'POL-1');
    await userEvent.click(screen.getByRole('button', { name: 'Identify direct payment' }));
    await waitFor(() => expect(posted('/api/operations/direct-payments')?.body).toEqual({ policyNo: 'POL-1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Insurer approved' }));
    await waitFor(() => expect(posted('/direct-payments/1/transition')?.body.to).toBe('approved'));
    await clickTab('Adjustments');
    await userEvent.type(screen.getByLabelText('Policy no.'), 'POL-1');
    await userEvent.type(screen.getByLabelText('Description'), 'Add accessories cover');
    await userEvent.click(screen.getByRole('button', { name: 'Submit for posting' }));
    await waitFor(() => expect(posted('/api/operations/endorsements')?.body.type).toBe('adjustment'));
    await clickTab('Production recon');
    await waitFor(() => expect(screen.getByText('PRC-1')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Insurer'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Match & classify' }));
    await waitFor(() => expect(posted('/api/operations/production-recons')?.body.rows.length).toBe(2));
    await userEvent.click(await screen.findByRole('button', { name: 'Disposition' }, { timeout: 4000 }));
    await waitFor(() => expect(posted('/rows/1/disposition')).toBeTruthy());
  });
});

describe('Collections page: diary, CTE, SOA', () => {
  it('logs an effort, requests CTE and opens the statement', async () => {
    renderAt('/collections');
    await waitFor(() => expect(screen.getByText('INV-2026-00001')).toBeInTheDocument());
    expect(screen.getByText('newly booked')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log effort' }));
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'committed');
    await userEvent.click(screen.getAllByRole('button', { name: 'Log effort' })[0]);
    await waitFor(() => expect(posted('/api/collections/efforts')?.body.category).toBe('committed'));
    await userEvent.click(screen.getByRole('button', { name: 'CTE' }));
    await waitFor(() => expect(posted('/api/collections/cte')?.body.requestedDays).toBe(42));
    await userEvent.click(screen.getByRole('button', { name: 'Remind' }));
    await waitFor(() => expect(posted('/reminders/1')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Diary' }));
    await waitFor(() => expect(screen.getByText(/Diary · INV/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'SOA' }));
    await waitFor(() => expect(screen.getByText(/Statement of account/)).toBeInTheDocument());
  });
});

describe('Accounting page: disbursement chain, remittances, refunds, journals, periods, SOA recon', () => {
  it('reviews and pays disbursements, extracts and submits remittances', async () => {
    renderAt('/accounting');
    await waitFor(() => expect(screen.getByText('PV-1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Review OK' }));
    await waitFor(() => expect(posted('/disbursements/1/review')?.body.ok).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(posted('/disbursements/2/pay')?.body.reference).toBe('42'));
    await userEvent.type(screen.getByLabelText('Payee'), 'Supplies Inc');
    await userEvent.type(screen.getByLabelText('Amount (₱)'), '1200');
    await userEvent.click(screen.getByRole('button', { name: 'Request' }));
    await waitFor(() => expect(posted('/api/disbursements')?.body.payeeName).toBe('Supplies Inc'));
    await clickTab('Remittances');
    await waitFor(() => expect(screen.getByText('RS-1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Extract schedule' }));
    await waitFor(() => expect(posted('/api/accounting/remittances')?.body.policyIds).toEqual([1]));
    await userEvent.click(screen.getByRole('button', { name: 'Submit to disbursement' }));
    await waitFor(() => expect(posted('/remittances/1/submit')).toBeTruthy());
    await clickTab('Refund requests');
    await waitFor(() => expect(screen.getByText('RRF-1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'TL review OK' }));
    await waitFor(() => expect(posted('/refunds/1/review')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'UH approve' }));
    await waitFor(() => expect(posted('/refunds/2/approve')).toBeTruthy());
  });
  it('drafts a balanced journal, closes periods and years, reconciles SOA', async () => {
    renderAt('/accounting');
    await clickTab('Journals');
    await waitFor(() => expect(screen.getByText('JV-1')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('Description'), 'Opening');
    const selects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(selects[selects.length - 2], '1000');
    await userEvent.selectOptions(selects[selects.length - 1], '3000');
    const debits = screen.getAllByRole('spinbutton');
    fireEvent.change(debits[0], { target: { value: '100' } });
    fireEvent.change(debits[3], { target: { value: '100' } });
    await userEvent.click(screen.getByRole('button', { name: 'Submit for posting' }));
    await waitFor(() => expect(posted('/api/accounting/journals')?.body.lines).toHaveLength(2));
    await clickTab('Trial balance');
    await waitFor(() => expect(screen.getByText(/balanced/)).toBeInTheDocument());
    await clickTab('Periods & year-end');
    await waitFor(() => expect(screen.getByText('2026-09')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    await waitFor(() => expect(posted('/periods/2026-09/close')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(posted('/periods/2026-08/reopen')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Close fiscal year' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && /fiscal-years\/\d+\/close/.test(c.url))).toBe(true));
    await userEvent.type(screen.getByPlaceholderText('Code'), '5300');
    await userEvent.type(screen.getByPlaceholderText('Name'), 'Rent');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(posted('/api/accounting/accounts')?.body.code).toBe('5300'));
    await clickTab('ACSL / SOA recon');
    await waitFor(() => expect(screen.getByText('SOA-1')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Insurer'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Reconcile' }));
    await waitFor(() => expect(posted('/api/accounting/soa-recons')?.body.lines).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: 'Manual SL adjustment' }));
    await waitFor(() => expect(screen.getByText(/Adjustment entries/)).toBeInTheDocument());
  });
});

describe('Claims, Servicing, Renewals, Reinsurance, Submitted, EB, Products, Screening, UAM, Data migration', () => {
  it('claims register, document toggle and offer actions', async () => {
    renderAt('/claims');
    await waitFor(() => expect(screen.getByText('CLM-2026-00001')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('Policy number'), 'POL-2026-00001');
    await userEvent.type(screen.getByLabelText('Estimated amount (₱)'), '50000');
    await userEvent.type(screen.getByLabelText('Description'), 'Collision on EDSA');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(posted('/api/claims')?.body.estimatedAmount).toBe(50000));
    await userEvent.click(screen.getByText('CLM-2026-00001'));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Claim form'));
    await userEvent.click(screen.getByRole('button', { name: 'Insured accepts' }));
    await waitFor(() => expect(posted('/claims/1/transition')?.body.event).toBe('offer_accepted'));
  });
  it('servicing logs a case, returns it, searches the facility and updates contact', async () => {
    renderAt('/servicing');
    await waitFor(() => expect(screen.getByText('SR-1')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/Client/), '1');
    await userEvent.type(screen.getByLabelText(/Positive identification/), 'acme@example.com');
    await userEvent.type(screen.getByLabelText('Description'), 'Need my statement');
    await userEvent.click(screen.getByRole('button', { name: 'Log case' }));
    await waitFor(() => expect(posted('/api/servicing/requests')?.body.clientId).toBe(1));
    await userEvent.click(screen.getByRole('button', { name: 'Return to CCC' }));
    await waitFor(() => expect(posted('/requests/1/status')?.body.status).toBe('returned'));
    await clickTab('Servicing facility');
    await userEvent.type(screen.getByPlaceholderText(/Invoice no., policy no./), 'INV');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update contact' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Update contact' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url.endsWith('/servicing/clients/1/contact'))).toBe(true));
  });
  it('renewals pipeline actions', async () => {
    renderAt('/renewals');
    await waitFor(() => expect(screen.getByText('POL-1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Final RA (−45d)' }));
    await waitFor(() => expect(posted('/renewals/1/notice')?.body.noticeType).toBe('final'));
    await userEvent.click(screen.getByRole('button', { name: 'Renew → placement' }));
    await waitFor(() => expect(posted('/renewals/1/renew')?.body.sumInsured).toBe(42));
    await userEvent.click(screen.getByRole('button', { name: 'For renewal' }));
    await waitFor(() => expect(posted('/renewals/2/disposition')?.body.disposition).toBe('for_renewal'));
  });
  it('reinsurance placements and treaties', async () => {
    renderAt('/reinsurance');
    await waitFor(() => expect(screen.getByText('FAC-1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(posted('/placements/1/transition')?.body.to).toBe('acknowledged'));
    await userEvent.click(screen.getByRole('button', { name: 'Revise slip' }));
    await waitFor(() => expect(screen.getByText(/Facultative slip/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Close & debit note' }));
    await waitFor(() => expect(posted('/placements/2/transition')?.body.to).toBe('placed'));
    await clickTab('Treaties & cessions');
    await waitFor(() => expect(screen.getAllByText('QS-FIRE').length).toBeGreaterThan(0));
    await userEvent.type(screen.getByLabelText('Policy number'), 'POL-1');
    await userEvent.selectOptions(screen.getByLabelText('Treaty'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Cede' }));
    await waitFor(() => expect(posted('/api/reinsurance/cessions')?.body.treatyId).toBe(1));
  });
  it('submitted policies review and expiring list', async () => {
    renderAt('/submitted-policies');
    await waitFor(() => expect(screen.getByText('SPB-1')).toBeInTheDocument());
    await userEvent.click(screen.getByText('SPB-1'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Findings → IAAF' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Findings → IAAF' }));
    await waitFor(() => expect(posted('/rows/1/review')?.body.outcome).toBe('findings'));
    await clickTab('Expiring (150 days)');
    await waitFor(() => expect(screen.getByText('EXT-1')).toBeInTheDocument());
  });
  it('employee benefits scheme detail: documents, remarketing, award', async () => {
    renderAt('/employee-benefits');
    await waitFor(() => expect(screen.getByText('EB-1')).toBeInTheDocument());
    await userEvent.click(screen.getByText('EB-1'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'TOR prepared' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'TOR prepared' }));
    await waitFor(() => expect(posted('/schemes/1/documents')?.body.torPrepared).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Award' }));
    await waitFor(() => expect(posted('/schemes/1/award')?.body.proposalId).toBe(1));
    await userEvent.click(screen.getByRole('button', { name: 'Record proposal' }));
    await waitFor(() => expect(posted('/schemes/1/proposals/2')?.body.premiumPerLife).toBe(42));
    await userEvent.click(screen.getByRole('button', { name: 'Upload census' }));
    await waitFor(() => expect(posted('/schemes/1/members')?.body.members).toHaveLength(2));
  });
  it('products: change request, TSU transitions and insurer panel', async () => {
    renderAt('/products');
    await waitFor(() => expect(screen.getAllByText('MTR-CMP').length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: 'Change request' }));
    await waitFor(() => expect(posted('/products/1/change-request')?.body.summary).toBe('42'));
    await clickTab('TSU requests');
    await waitFor(() => expect(screen.getByText('TSU-1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Comparative table ready' }));
    await waitFor(() => expect(posted('/tsu/1/transition')?.body.to).toBe('comparative_ready'));
    await userEvent.click(screen.getByText('TSU-1'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record response' })).toBeInTheDocument());
    await clickTab('Insurers');
    await waitFor(() => expect(screen.getByText('Malayan Insurance')).toBeInTheDocument());
  });
  it('screening creates and screens a client and shows the screening file', async () => {
    renderAt('/screening');
    await waitFor(() => expect(screen.getAllByText('CLT-2026-00001').length).toBeGreaterThan(0));
    await userEvent.type(screen.getByLabelText('Name'), 'New Client Co');
    await userEvent.click(screen.getByRole('button', { name: 'Create & screen' }));
    await waitFor(() => expect(posted('/api/clients')?.body.name).toBe('New Client Co'));
    await userEvent.click(await screen.findByRole('button', { name: 'Re-screen' }, { timeout: 4000 }));
    await waitFor(() => expect(posted('/clients/1/rescreen')).toBeTruthy());
  });
  it('user access and data migration actions', async () => {
    renderAt('/user-access');
    await waitFor(() => expect(screen.getByText('cashier')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url.endsWith('/users/2'))).toBe(true));
    renderAt('/data-migration');
    await waitFor(() => expect(screen.getByText('MIG-1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Load & reconcile' }));
    await waitFor(() => expect(posted('/batches/1/load')?.body.loadedCount).toBe(42));
    await userEvent.click(screen.getByRole('button', { name: 'Disposition' }));
    await waitFor(() => expect(posted('/batches/1/disposition')).toBeTruthy());
  });
  it('approvals decide and reports export', async () => {
    renderAt('/approvals');
    await waitFor(() => expect(screen.getByText('Book POL-2026-00001')).toBeInTheDocument());
    expect(screen.getByText('your own request')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(posted('/approvals/1/decide')?.body.decision).toBe('approved'));
    renderAt('/reports');
    await waitFor(() => expect(screen.getAllByText('POL-2026-00001').length).toBeGreaterThan(0));
  });
});

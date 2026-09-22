import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider } from './components/ui';
import { Shell } from './components/Shell';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { NewBusinessPage, PolicyDetailPage } from './pages/NewBusiness';
import { ApprovalsPage, AuditPage, OutboxPage } from './pages/Approvals';
import { OperationsPage } from './pages/Operations';
import { CollectionsPage } from './pages/Collections';
import { AccountingPage } from './pages/Accounting';
import { ClaimsPage, ClaimDetailPage } from './pages/Claims';
import { RenewalsPage } from './pages/Renewals';
import { ReinsurancePage } from './pages/Reinsurance';
import { EmployeeBenefitsPage } from './pages/EmployeeBenefits';
import { ServicingPage } from './pages/Servicing';
import { ScreeningPage } from './pages/Screening';
import { ProductsPage } from './pages/Products';
import { SubmittedPoliciesPage } from './pages/SubmittedPolicies';
import { UserAccessPage } from './pages/UserAccess';
import { DataMigrationPage } from './pages/DataMigration';
import { ReportsPage } from './pages/Reports';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="empty">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return <>{children}</>;
}

/** Module guard: hand-typed URLs to modules outside the persona are refused. */
function Entitled({ modules, children }: { modules: string[]; children: ReactNode }) {
  const { has } = useAuth();
  if (!has(...modules)) return <div className="card"><h2>Not entitled</h2><p className="muted">Your persona does not own this module. Ask User Access Maintenance if you need it.</p></div>;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="new-business" element={<Entitled modules={['NB', 'RN']}><NewBusinessPage /></Entitled>}>
          <Route path="policies/:id" element={<PolicyDetailPage />} />
        </Route>
        <Route path="operations" element={<Entitled modules={['OPS', 'CLXN']}><OperationsPage /></Entitled>} />
        <Route path="collections" element={<Entitled modules={['CLXN', 'OPS']}><CollectionsPage /></Entitled>} />
        <Route path="accounting" element={<Entitled modules={['ADA']}><AccountingPage /></Entitled>} />
        <Route path="claims" element={<Entitled modules={['CLM', 'CSF']}><ClaimsPage /></Entitled>}>
          <Route path=":id" element={<ClaimDetailPage />} />
        </Route>
        <Route path="renewals" element={<Entitled modules={['RN']}><RenewalsPage /></Entitled>} />
        <Route path="reinsurance" element={<Entitled modules={['RI']}><ReinsurancePage /></Entitled>} />
        <Route path="employee-benefits" element={<Entitled modules={['EB']}><EmployeeBenefitsPage /></Entitled>} />
        <Route path="servicing" element={<Entitled modules={['CSF', 'CLM', 'CLXN']}><ServicingPage /></Entitled>} />
        <Route path="screening" element={<Entitled modules={['SS', 'NB', 'EB', 'CSF']}><ScreeningPage /></Entitled>} />
        <Route path="products" element={<Entitled modules={['PM', 'NB']}><ProductsPage /></Entitled>} />
        <Route path="submitted-policies" element={<Entitled modules={['SP']}><SubmittedPoliciesPage /></Entitled>} />
        <Route path="user-access" element={<Entitled modules={['UAM']}><UserAccessPage /></Entitled>} />
        <Route path="data-migration" element={<Entitled modules={['DM']}><DataMigrationPage /></Entitled>} />
        <Route path="reports" element={<Entitled modules={['RPT']}><ReportsPage /></Entitled>} />
        <Route path="approvals" element={<Entitled modules={['CORE']}><ApprovalsPage /></Entitled>} />
        <Route path="audit" element={<Entitled modules={['CORE', 'UAM']}><AuditPage /></Entitled>} />
        <Route path="outbox" element={<Entitled modules={['CORE', 'CSF', 'RN', 'NB', 'ADA']}><OutboxPage /></Entitled>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

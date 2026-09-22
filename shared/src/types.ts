export interface UserView { id: number; username: string; fullName: string; email: string; roleCode: string; department: string; status: 'active' | 'disabled'; modules: string[]; canApprove: boolean }
export interface ApiError { error: string; details?: unknown }
export const POLICY_STATUSES = ['pending_approval', 'in_force', 'cancelled', 'expired', 'renewed', 'rejected'] as const;
export const CLAIM_STATUSES = ['registered', 'under_review', 'approved', 'settled', 'declined', 'closed'] as const;
export const SERVICE_UNITS: Record<string, string> = { claims: 'CLM', billing: 'OPS', policy: 'NB', renewal: 'RN', complaint: 'CSF', document: 'CSF' };

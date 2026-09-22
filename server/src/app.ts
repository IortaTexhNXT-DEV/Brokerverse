import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { HttpError } from './lib/errors.js';
import { requireAuth } from './lib/auth.js';
import { loginRateLimiter } from './lib/rateLimit.js';
import { requestLog } from './lib/requestLog.js';
import { pool } from './db.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { clientsRouter } from './routes/clients.js';
import { productsRouter, insurersRouter, tsuRouter } from './routes/products.js';
import { newBusinessRouter } from './routes/newBusiness.js';
import { approvalsRouter, auditRouter, outboxRouter } from './routes/approvals.js';
import { operationsRouter } from './routes/operations.js';
import { collectionsRouter } from './routes/collections.js';
import { accountingRouter } from './routes/accounting.js';
import { disbursementsRouter } from './routes/disbursements.js';
import { refundsRouter } from './routes/refunds.js';
import { claimsRouter } from './routes/claims.js';
import { renewalsRouter } from './routes/renewals.js';
import { reinsuranceRouter } from './routes/reinsurance.js';
import { ebRouter } from './routes/employeeBenefits.js';
import { servicingRouter } from './routes/servicing.js';
import { submittedRouter } from './routes/submittedPolicies.js';
import { migrationRouter } from './routes/dataMigration.js';
import { reportsRouter } from './routes/reports.js';

/** Module routers mounted under /api; every one is behind JWT auth and persona entitlement. */
const MODULE_ROUTES: [string, express.Router][] = [
  ['/users', usersRouter], ['/clients', clientsRouter], ['/products', productsRouter], ['/insurers', insurersRouter], ['/tsu', tsuRouter],
  ['/new-business', newBusinessRouter], ['/approvals', approvalsRouter], ['/audit', auditRouter], ['/outbox', outboxRouter],
  ['/operations', operationsRouter], ['/collections', collectionsRouter], ['/accounting', accountingRouter], ['/disbursements', disbursementsRouter], ['/refunds', refundsRouter],
  ['/claims', claimsRouter], ['/renewals', renewalsRouter], ['/reinsurance', reinsuranceRouter], ['/employee-benefits', ebRouter], ['/servicing', servicingRouter],
  ['/submitted-policies', submittedRouter], ['/data-migration', migrationRouter], ['/reports', reportsRouter],
];

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '5mb' }));
  if (!config.isTest) app.use(requestLog(config.isProd));

  // Liveness: process is up. Readiness: database reachable and migrations applied.
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'brokerverse-server', version: process.env.npm_package_version ?? '1.0.0', time: new Date().toISOString() }));
  app.get('/api/ready', async (_req, res) => {
    try {
      const r = await pool.query('SELECT COUNT(*)::int AS n FROM schema_migrations');
      res.json({ ok: true, database: 'up', migrations: r.rows[0].n });
    } catch (e) {
      res.status(503).json({ ok: false, database: 'down', error: (e as Error).message });
    }
  });
  app.use('/api/auth/login', loginRateLimiter(config.loginRateLimit, config.loginRateWindowMs));
  app.use('/api/auth', authRouter);

  const api = express.Router();
  api.use(requireAuth);
  for (const [path, router] of MODULE_ROUTES) api.use(path, router);
  app.use('/api', api);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  };
  app.use(onError);
  return app;
}

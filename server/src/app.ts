import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { HttpError } from './lib/errors.js';
import { requireAuth } from './lib/auth.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { clientsRouter } from './routes/clients.js';
import { productsRouter, insurersRouter } from './routes/products.js';
import { newBusinessRouter } from './routes/newBusiness.js';
import { approvalsRouter, auditRouter, outboxRouter } from './routes/approvals.js';
import { operationsRouter, collectionsRouter } from './routes/operations.js';
import { accountingRouter } from './routes/accounting.js';
import { claimsRouter } from './routes/claims.js';
import { renewalsRouter } from './routes/renewals.js';
import { reinsuranceRouter } from './routes/reinsurance.js';
import { ebRouter } from './routes/employeeBenefits.js';
import { servicingRouter } from './routes/servicing.js';
import { submittedRouter } from './routes/submittedPolicies.js';
import { migrationRouter } from './routes/dataMigration.js';
import { reportsRouter } from './routes/reports.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'brokerverse-server', time: new Date().toISOString() }));
  app.use('/api/auth', authRouter);

  const api = express.Router();
  api.use(requireAuth);
  api.use('/users', usersRouter);
  api.use('/clients', clientsRouter);
  api.use('/products', productsRouter);
  api.use('/insurers', insurersRouter);
  api.use('/new-business', newBusinessRouter);
  api.use('/approvals', approvalsRouter);
  api.use('/audit', auditRouter);
  api.use('/outbox', outboxRouter);
  api.use('/operations', operationsRouter);
  api.use('/collections', collectionsRouter);
  api.use('/accounting', accountingRouter);
  api.use('/claims', claimsRouter);
  api.use('/renewals', renewalsRouter);
  api.use('/reinsurance', reinsuranceRouter);
  api.use('/employee-benefits', ebRouter);
  api.use('/servicing', servicingRouter);
  api.use('/submitted-policies', submittedRouter);
  api.use('/data-migration', migrationRouter);
  api.use('/reports', reportsRouter);
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

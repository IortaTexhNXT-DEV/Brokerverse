import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { requireModule } from '../lib/auth.js';
import { conflict, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';
import { rate } from '@brokerverse/shared';

export const productsRouter = Router();
productsRouter.use(requireModule('PM', 'NB', 'RN', 'RPT'));

productsRouter.get('/', wrap(async (_req, res) => { res.json({ products: await query('SELECT * FROM products ORDER BY code') }); }));

const productSchema = z.object({
  code: z.string().min(2).max(12).regex(/^[A-Z0-9_-]+$/), name: z.string().min(2), line: z.enum(['motor', 'property', 'fire', 'marine', 'casualty', 'accident', 'life', 'eb']),
  baseRate: z.number().positive().max(1), minPremium: z.number().min(0).default(0), commissionRate: z.number().min(0).max(0.5),
  vatRate: z.number().min(0).max(1).default(0.12), dstRate: z.number().min(0).max(1).default(0.125), lgtRate: z.number().min(0).max(1).default(0.0075), fstRate: z.number().min(0).max(1).default(0),
  maxSumInsured: z.number().positive().optional(), surveyRequiredAbove: z.number().positive().optional(),
});

productsRouter.post('/', requireModule('PM'), wrap(async (req, res) => {
  const b = parse(productSchema, req.body);
  if (await one('SELECT 1 FROM products WHERE code=$1', [b.code])) throw conflict('Product code already exists');
  const row = await tx(async (c) => {
    const r = await one<{ id: number }>(
      `INSERT INTO products(code, name, line, base_rate, min_premium, commission_rate, vat_rate, dst_rate, lgt_rate, fst_rate, max_sum_insured, survey_required_above)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [b.code, b.name, b.line, b.baseRate, b.minPremium, b.commissionRate, b.vatRate, b.dstRate, b.lgtRate, b.fstRate, b.maxSumInsured ?? null, b.surveyRequiredAbove ?? null], c);
    await audit(c, req.user, 'product.create', 'product', r!.id, null, b);
    return r!;
  });
  res.status(201).json({ id: row.id });
}));

productsRouter.patch('/:id', requireModule('PM'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(productSchema.partial().omit({ code: true }).extend({ status: z.enum(['active', 'retired']).optional() }), req.body);
  const before = await one<any>('SELECT * FROM products WHERE id=$1', [id]);
  if (!before) throw notFound('Product not found');
  await tx(async (c) => {
    await query(`UPDATE products SET name=COALESCE($2,name), line=COALESCE($3,line), base_rate=COALESCE($4,base_rate), min_premium=COALESCE($5,min_premium),
      commission_rate=COALESCE($6,commission_rate), vat_rate=COALESCE($7,vat_rate), dst_rate=COALESCE($8,dst_rate), lgt_rate=COALESCE($9,lgt_rate), fst_rate=COALESCE($10,fst_rate),
      max_sum_insured=COALESCE($11,max_sum_insured), survey_required_above=COALESCE($12,survey_required_above), status=COALESCE($13,status), updated_at=now() WHERE id=$1`,
      [id, b.name ?? null, b.line ?? null, b.baseRate ?? null, b.minPremium ?? null, b.commissionRate ?? null, b.vatRate ?? null, b.dstRate ?? null, b.lgtRate ?? null, b.fstRate ?? null, b.maxSumInsured ?? null, b.surveyRequiredAbove ?? null, b.status ?? null], c);
    await audit(c, req.user, 'product.update', 'product', id, before, b);
  });
  res.json({ ok: true });
}));

/** Rating calculator (what-if) used by the quotation screen. */
productsRouter.post('/:id/rate', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { sumInsured } = parse(z.object({ sumInsured: z.number().positive() }), req.body);
  const p = await one<any>('SELECT * FROM products WHERE id=$1', [id]);
  if (!p) throw notFound('Product not found');
  if (p.max_sum_insured && sumInsured > p.max_sum_insured) throw conflict(`Sum insured exceeds product acceptance limit of ${p.max_sum_insured}`);
  const r = rate({ sumInsured, baseRate: p.base_rate, minPremium: p.min_premium, commissionRate: p.commission_rate, vatRate: p.vat_rate, dstRate: p.dst_rate, lgtRate: p.lgt_rate, fstRate: p.fst_rate });
  res.json({ ...r, surveyRequired: !!(p.survey_required_above && sumInsured > p.survey_required_above) });
}));

export const insurersRouter = Router();
insurersRouter.use(requireModule('PM', 'NB', 'RI', 'ADA', 'SP', 'EB', 'RN'));
insurersRouter.get('/', wrap(async (_req, res) => { res.json({ insurers: await query('SELECT * FROM insurers ORDER BY code') }); }));
insurersRouter.post('/', requireModule('PM'), wrap(async (req, res) => {
  const b = parse(z.object({ code: z.string().min(2).max(10), name: z.string().min(2), securityRating: z.string().default('A') }), req.body);
  if (await one('SELECT 1 FROM insurers WHERE code=$1', [b.code])) throw conflict('Insurer code already exists');
  const r = await one<{ id: number }>('INSERT INTO insurers(code, name, security_rating) VALUES ($1,$2,$3) RETURNING id', [b.code, b.name, b.securityRating]);
  res.status(201).json({ id: r!.id });
}));

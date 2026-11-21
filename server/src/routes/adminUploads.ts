import { Router, type Request } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { badRequest, h, isoDate, notFound, parse, toDbDate } from '../http.js';
import { uploadLimiter } from '../middleware.js';
import { audit } from '../services/audit.js';
import { asRules, getLottery } from '../services/data.js';
import { evaluatePendingForLottery } from '../services/evaluation.js';
import { classify, mappingSchema, parseRows, readTable, suggestMapping, templateHeaders, type ClassifiedRow, type DateFormat } from '../services/importer.js';
import { chunk } from '../utils.js';

export const adminUploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: (_req, file, cb) => (/\.(csv|xlsx)$/i.test(file.originalname) ? cb(null, true) : cb(badRequest('Only .csv and .xlsx files are accepted.'))),
});

const formSchema = z.object({
  lotteryId: z.string().uuid(),
  mapping: z.string().optional(),
  dateFormat: z.enum(['iso', 'dmy', 'mdy']).default('iso'),
  duplicatePolicy: z.enum(['skip', 'update', 'reject']).default('skip'),
  publish: z.enum(['true', 'false']).default('true'),
});

async function prepare(req: Request) {
  if (!req.file) throw badRequest('Attach a CSV or XLSX file.');
  const form = parse(formSchema, req.body);
  const lottery = await getLottery(form.lotteryId);
  const rules = asRules(lottery.rulesJson);
  const table = await readTable(req.file.buffer, req.file.originalname.slice(0, 255), config.MAX_IMPORT_ROWS);
  return { form, lottery, rules, table, fileName: req.file.originalname.slice(0, 255) };
}

async function classifyFor(p: Awaited<ReturnType<typeof prepare>>): Promise<{ rows: ClassifiedRow[]; mapping: z.infer<typeof mappingSchema> }> {
  let raw: unknown;
  try {
    raw = JSON.parse(p.form.mapping ?? 'null');
  } catch {
    throw badRequest('Column mapping is not valid JSON.');
  }
  const mapping = parse(mappingSchema, raw ?? suggestMapping(p.table.headers, p.rules));
  const parsed = parseRows(p.table, mapping, p.rules, p.form.dateFormat as DateFormat);
  if (p.form.publish === 'true') {
    const limit = Date.now() + 86400000;
    for (const r of parsed) if (r.date && !r.errors.length && new Date(r.date + 'T00:00:00Z').getTime() > limit) r.errors.push('Future date cannot be published.');
  }
  const existing = await prisma.lotteryDraw.findMany({ where: { lotteryId: p.lottery.id }, select: { id: true, drawDate: true, drawReference: true } });
  const rows = classify(parsed, existing.map((e) => ({ id: e.id, date: isoDate(e.drawDate), ref: e.drawReference })));
  return { rows, mapping };
}

const summarise = (rows: ClassifiedRow[]) => ({
  total: rows.length,
  valid: rows.filter((r) => r.status === 'valid').length,
  duplicates: rows.filter((r) => r.status === 'duplicate').length,
  invalid: rows.filter((r) => r.status === 'invalid').length,
});

// ---- templates ----
adminUploadsRouter.get('/template', h(async (req, res) => {
  const q = parse(z.object({ lotteryId: z.string().uuid(), format: z.enum(['csv', 'xlsx']).default('csv') }), req.query);
  const lottery = await getLottery(q.lotteryId);
  const rules = asRules(lottery.rulesJson);
  const headers = templateHeaders(rules);
  const example = (i: number) => {
    const main = Array.from({ length: rules.mainCount }, (_, k) => rules.minNumber + ((k + i) % (rules.maxNumber - rules.minNumber + 1)));
    const pad = (n: number) => String(n).padStart(rules.padDigits || 0, '0');
    const bonus = rules.bonus ? Array.from({ length: rules.bonus.count }, (_, k) => (rules.bonus!.separatePool ? rules.bonus!.minNumber : rules.minNumber) + k + (rules.bonus!.separatePool ? 0 : rules.mainCount)) : [];
    return [`2000-01-0${i + 1}`, `EXAMPLE-${i + 1}`, ...main.map(pad), ...bonus.map(pad), 'EXAMPLE ROW - delete before uploading'];
  };
  const name = `${lottery.lotteryName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-import-template`;
  if (q.format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Results');
    ws.addRow(headers).font = { bold: true };
    ws.addRow(example(0));
    ws.addRow(example(1));
    ws.columns.forEach((c) => (c.width = 16));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send('﻿' + Papa.unparse({ fields: headers, data: [example(0), example(1)] }, { newline: '\r\n' }) + '\r\n');
}));

// ---- step 1: read headers, suggest mapping ----
adminUploadsRouter.post('/inspect', uploadLimiter, upload.single('file'), h(async (req, res) => {
  const p = await prepare(req);
  res.json({ fileName: p.fileName, totalRows: p.table.rows.length, headers: p.table.headers, sampleRows: p.table.rows.slice(0, 8), suggestedMapping: suggestMapping(p.table.headers, p.rules), expectedColumns: templateHeaders(p.rules) });
}));

// ---- step 2: validate everything, return preview ----
adminUploadsRouter.post('/preview', uploadLimiter, upload.single('file'), h(async (req, res) => {
  const p = await prepare(req);
  const { rows, mapping } = await classifyFor(p);
  res.json({ mapping, summary: summarise(rows), truncated: rows.length > 500, rows: rows.slice(0, 500) });
}));

// ---- step 3: import ----
adminUploadsRouter.post('/commit', uploadLimiter, upload.single('file'), h(async (req, res) => {
  const p = await prepare(req);
  const { rows } = await classifyFor(p);
  const policy = p.form.duplicatePolicy;
  const status = p.form.publish === 'true' ? 'PUBLISHED' : 'PENDING';
  const sum = summarise(rows);
  const errorReport: { line: number; date: string | null; reference: string | null; numbers: string; outcome: string; reason: string }[] = [];
  const report = (r: ClassifiedRow, outcome: string) => errorReport.push({ line: r.line, date: r.date, reference: r.ref, numbers: [...r.main, ...(r.bonus.length ? ['+', ...r.bonus] : [])].join(' '), outcome, reason: r.errors.join(' ') });

  let created = 0, updated = 0, skipped = 0;
  let uploadStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'REJECTED' = 'COMPLETED';

  rows.filter((r) => r.status === 'invalid').forEach((r) => report(r, 'failed'));

  if (policy === 'reject' && sum.duplicates > 0) {
    rows.filter((r) => r.status === 'duplicate').forEach((r) => report(r, 'rejected'));
    uploadStatus = 'REJECTED';
  } else {
    const fresh = rows.filter((r) => r.status === 'valid');
    const dupes = rows.filter((r) => r.status === 'duplicate');
    const toUpdate = policy === 'update' ? dupes.filter((r) => r.duplicateOf === 'database' && r.existingId) : [];
    dupes.filter((r) => !toUpdate.includes(r)).forEach((r) => { skipped++; report(r, 'skipped'); });

    await prisma.$transaction(
      async (tx) => {
        for (const part of chunk(fresh, 1000)) {
          const r = await tx.lotteryDraw.createMany({
            data: part.map((x) => ({ lotteryId: p.lottery.id, drawDate: toDbDate(x.date!), drawReference: x.ref, mainNumbers: x.main, bonusNumbers: x.bonus, remarks: x.remarks, status, createdById: req.user!.id })),
          });
          created += r.count;
        }
        for (const x of toUpdate) {
          await tx.lotteryDraw.update({ where: { id: x.existingId! }, data: { drawDate: toDbDate(x.date!), drawReference: x.ref, mainNumbers: x.main, bonusNumbers: x.bonus, remarks: x.remarks, status, isSample: false } });
          updated++;
        }
      },
      { timeout: 120000, maxWait: 10000 },
    );
    if (created + updated === 0 && sum.invalid > 0) uploadStatus = 'FAILED';
    else if (sum.invalid > 0) uploadStatus = 'PARTIAL';
  }

  const record = await prisma.bulkUpload.create({
    data: {
      lotteryId: p.lottery.id,
      fileName: p.fileName,
      totalRecords: sum.total,
      successfulRecords: created + updated,
      failedRecords: sum.invalid,
      uploadStatus,
      uploadedById: req.user!.id,
      summary: { created, updated, skipped, duplicatePolicy: policy, published: status === 'PUBLISHED', duplicatesFound: sum.duplicates } as Prisma.InputJsonValue,
      errorReport: errorReport.slice(0, 5000) as Prisma.InputJsonValue,
    },
  });
  await audit(req, 'IMPORT', 'BulkUpload', record.id, null, { lottery: p.lottery.lotteryName, fileName: p.fileName, created, updated, skipped, failed: sum.invalid, status: uploadStatus });
  const evaluated = created + updated > 0 && status === 'PUBLISHED' ? await evaluatePendingForLottery(p.lottery.id) : 0;
  res.status(201).json({ uploadId: record.id, status: uploadStatus, total: sum.total, created, updated, skipped, failed: sum.invalid, rejectedDuplicates: uploadStatus === 'REJECTED' ? sum.duplicates : 0, evaluatedPredictions: evaluated, errors: errorReport.slice(0, 200) });
}));

// ---- history & error report ----
adminUploadsRouter.get('/history', h(async (req, res) => {
  const q = parse(z.object({ lotteryId: z.string().uuid().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }), req.query);
  const where: Prisma.BulkUploadWhereInput = q.lotteryId ? { lotteryId: q.lotteryId } : {};
  const [total, rows] = await Promise.all([
    prisma.bulkUpload.count({ where }),
    prisma.bulkUpload.findMany({ where, orderBy: { uploadedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { lottery: { select: { lotteryName: true, country: { select: { countryName: true } } } }, uploadedBy: { select: { name: true } } } }),
  ]);
  res.json({ total, page: q.page, pageSize: q.pageSize, items: rows.map((u) => ({ id: u.id, fileName: u.fileName, lottery: u.lottery.lotteryName, country: u.lottery.country.countryName, totalRecords: u.totalRecords, successfulRecords: u.successfulRecords, failedRecords: u.failedRecords, status: u.uploadStatus, summary: u.summary, uploadedBy: u.uploadedBy?.name ?? null, uploadedAt: u.uploadedAt, hasErrors: Array.isArray(u.errorReport) && u.errorReport.length > 0 })) });
}));

adminUploadsRouter.get('/:id/errors.csv', h(async (req, res) => {
  const u = await prisma.bulkUpload.findUnique({ where: { id: parse(z.string().uuid(), req.params.id) } });
  if (!u) throw notFound('Upload');
  const rows = (u.errorReport as { line: number; date: string | null; reference: string | null; numbers: string; outcome: string; reason: string }[] | null) ?? [];
  const safe = (v: string | null) => (v && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v ?? '');
  const csv = '﻿' + Papa.unparse({ fields: ['line', 'draw_date', 'draw_id', 'numbers', 'outcome', 'reason'], data: rows.map((r) => [r.line, r.date ?? '', safe(r.reference), r.numbers, r.outcome, safe(r.reason)]) }, { newline: '\r\n' }) + '\r\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="import-errors-${u.id.slice(0, 8)}.csv"`);
  res.send(csv);
}));

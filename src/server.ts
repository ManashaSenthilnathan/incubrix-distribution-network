import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { parseCatalogueCsv, validateCatalogueRows, type CatalogueRow } from './catalogue.js';
import { ConnectorError, connectorKeys, invokeConnector, manifests, signWebhook } from './connectors.js';
import { checkFrequencyCap, recordSuccessfulPost, validateRendition } from './rules.js';
import type { Destination, Job, Rendition } from './types.js';

const app = express();
app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { (req as any).rawBody = buf.toString('utf8'); } }));
const jobs = new Map<string, Job>();
const idempotency = new Map<string, { bodyHash: string; jobId: string }>();
const publishIdempotency = new Map<string, Record<string, unknown>>();
const destinationIdempotency = new Map<string, { bodyHash: string; response: Destination }>();
const destinations = new Map<string, Destination>();
const postDestinations = new Map<string, Destination>();
const certifications = new Map<string, Record<string, unknown>>();
const catalogueRows: CatalogueRow[] = [];
const mockPartnerPosts = new Map<string, { live_url: string; status: string; body: unknown }>();

function log(level: string, message: string, req?: Request, extra: Record<string, unknown> = {}) {
  process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), level, message, job_id: extra.job_id ?? null, correlation_id: req?.header('X-Correlation-Id') ?? null, ...extra }) + '\n');
}
function error(res: Response, status: number, code: string, message: string, retryable = false, details?: unknown) {
  return res.status(status).json({ error: { code, message, retryable, ...(details === undefined ? {} : { details }) } });
}
function safeHash(value: unknown): string { return JSON.stringify(value) ?? 'undefined'; }
function getDestination(raw: any): Destination {
  const d: Destination = {
    id: String(raw?.id ?? ''), name: String(raw?.name ?? raw?.id ?? ''), platform_key: String(raw?.platform_key ?? ''),
    base_url: raw?.base_url, title_max_chars: raw?.title_max_chars, body_max_chars: raw?.body_max_chars,
    links_allowed: raw?.links_allowed, frequency_cap: raw?.frequency_cap, self_promo_allowed: raw?.self_promo_allowed,
    disclosure_required: raw?.disclosure_required, automation_allowed: raw?.automation_allowed
  };
  if (!d.id || !connectorKeys.includes(d.platform_key as any)) throw new ConnectorError('INVALID_REQUEST', 'destination.id and supported destination.platform_key are required');
  destinations.set(d.id, d); return d;
}

// Local signed-webhook partner sandbox. It is test-only and never publishes to a public platform.
app.post('/mock-partner', (req, res) => {
  const secret = process.env.MOCK_PARTNER_SECRET ?? process.env.WEBHOOK_SECRET ?? '';
  const supplied = String(req.header('X-IncuBrix-Signature') ?? '').replace(/^sha256=/, '');
  const raw = String((req as any).rawBody ?? '');
  const expected = secret ? signWebhook(raw, secret) : '';
  const valid = Boolean(secret && supplied && supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)));
  if (!valid) return error(res, 401, 'CONNECTION_AUTH_EXPIRED', 'Invalid webhook signature');
  const key = String(req.header('Idempotency-Key') ?? (req.body as any)?.idempotency_key ?? '');
  if (!key) return error(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  const prior = mockPartnerPosts.get(key);
  if (prior) return res.json({ platform_post_id: key, live_url: prior.live_url, status: prior.status, idempotent_replay: true });
  const post = { live_url: `${req.protocol}://${req.get('host')}/mock-partner/${encodeURIComponent(key)}`, status: 'published', body: req.body };
  mockPartnerPosts.set(key, post);
  return res.status(201).json({ platform_post_id: key, live_url: post.live_url, status: post.status });
});
app.get('/mock-partner/:post_id', (req, res) => {
  const post = mockPartnerPosts.get(req.params.post_id);
  if (!post) return error(res, 404, 'NOT_FOUND', 'Mock partner post not found');
  return res.json({ platform_post_id: req.params.post_id, live_url: post.live_url, status: post.status, simulated: true });
});
app.delete('/mock-partner/:post_id', (req, res) => {
  const post = mockPartnerPosts.get(req.params.post_id);
  if (!post) return error(res, 404, 'NOT_FOUND', 'Mock partner post not found');
  post.status = 'deleted';
  return res.json({ platform_post_id: req.params.post_id, deleted: true, status: 'deleted', simulated: true });
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', (_req, res) => res.json({ status: 'ready', simulation_mode: process.env.SIMULATION_MODE !== 'false' }));
app.get('/api/v1/connectors', (_req, res) => res.json({ connectors: connectorKeys.map(key => manifests[key]) }));
app.get('/api/v1/jobs/:job_id', (req, res) => {
  const job = jobs.get(req.params.job_id);
  if (!job) return error(res, 404, 'NOT_FOUND', 'Job not found');
  return res.json(job);
});
app.get('/api/v1/destinations', (_req, res) => res.json({ destinations: [...destinations.values()] }));
app.get('/api/v1/catalogue', (_req, res) => res.json({ count: catalogueRows.length, destinations: catalogueRows }));
app.post('/api/v1/catalogue/import', (req, res) => {
  const key = req.header('Idempotency-Key');
  if (!key) return error(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  const bodyHash = safeHash(req.body); const cacheKey = `catalogue:${key}`; const prior = idempotency.get(cacheKey);
  if (prior) {
    if (prior.bodyHash !== bodyHash) return error(res, 409, 'IDEMPOTENCY_KEY_CONFLICT', 'This key was already used with a different request');
    const job = jobs.get(prior.jobId); return res.status(202).json({ job_id: prior.jobId, status: job?.status ?? 'queued', idempotent_replay: true });
  }
  let rows: CatalogueRow[];
  try { rows = Array.isArray(req.body?.rows) ? req.body.rows : typeof req.body?.csv === 'string' ? parseCatalogueCsv(req.body.csv) : []; }
  catch (e) { return error(res, 400, 'INVALID_REQUEST', 'Could not parse catalogue input', false, String(e)); }
  if (!rows.length) return error(res, 400, 'INVALID_REQUEST', 'Provide a non-empty rows array or csv string');
  const jobId = randomUUID(); const now = new Date().toISOString();
  jobs.set(jobId, { job_id: jobId, status: 'queued', progress: 0, created_at: now, updated_at: now }); idempotency.set(cacheKey, { bodyHash, jobId });
  res.status(202).json({ job_id: jobId, status: 'queued' });
  setImmediate(() => {
    const update = (patch: Partial<Job>) => jobs.set(jobId, { ...jobs.get(jobId)!, ...patch, updated_at: new Date().toISOString() });
    update({ status: 'running', progress: 30 });
    const report = validateCatalogueRows(rows, catalogueRows);
    catalogueRows.push(...report.accepted);
    const result = { imported: report.accepted.length, duplicates: report.duplicates.length, errors: report.errors.length, rows: report.accepted, duplicate_report: report.duplicates, error_report: report.errors, reachability: 'not_checked', note: 'Reachability and audience-size enrichment are not implemented; all imported rows remain uncertified until the certification workflow succeeds.' };
    update({ status: 'succeeded', progress: 100, result });
    log('info', 'catalogue_import_completed', req, { job_id: jobId, imported: result.imported, duplicates: result.duplicates, errors: result.errors });
  });
});
app.get('/api/v1/certifications', (_req, res) => res.json({ certifications: [...certifications.values()] }));
app.get('/api/v1/certifications/:certification_id', (req, res) => {
  const record = certifications.get(req.params.certification_id);
  if (!record) return error(res, 404, 'NOT_FOUND', 'Certification record not found');
  return res.json(record);
});
app.post('/api/v1/certifications', (req, res) => {
  const key = req.header('Idempotency-Key');
  if (!key) return error(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  const bodyHash = safeHash(req.body);
  const prior = idempotency.get(`cert:${key}`);
  if (prior) {
    if (prior.bodyHash !== bodyHash) return error(res, 409, 'IDEMPOTENCY_KEY_CONFLICT', 'This key was already used with a different request');
    const job = jobs.get(prior.jobId);
    return res.status(202).json({ job_id: prior.jobId, status: job?.status ?? 'queued', idempotent_replay: true });
  }
  let destination: Destination;
  try { destination = getDestination(req.body?.destination); }
  catch (e) { return error(res, 400, (e as any).code ?? 'INVALID_REQUEST', (e as Error).message); }
  // Certification must never create a post on an unapproved real destination.
  if (process.env.SIMULATION_MODE === 'false' && req.body?.approved_test_instance !== true) {
    return error(res, 403, 'TEST_DESTINATION_REQUIRED', 'Certification requires simulation mode or explicit approval of an owned test instance');
  }
  const rendition = (req.body?.rendition ?? { title: 'IncuBrix connector certification test', body: 'Temporary test content. Please delete immediately after verification.', aiGenerated: false }) as Rendition;
  const violations = validateRendition(rendition, destination);
  if (violations.length) return error(res, 422, violations[0].code, 'Certification rendition violates destination rules', false, violations);
  const jobId = randomUUID(); const now = new Date().toISOString();
  jobs.set(jobId, { job_id: jobId, status: 'queued', progress: 0, created_at: now, updated_at: now });
  idempotency.set(`cert:${key}`, { bodyHash, jobId });
  res.status(202).json({ job_id: jobId, status: 'queued' });
  setImmediate(async () => {
    const update = (patch: Partial<Job>) => jobs.set(jobId, { ...jobs.get(jobId)!, ...patch, updated_at: new Date().toISOString() });
    const evidenceId = randomUUID(); const started = Date.now();
    const evidence: Record<string, unknown> = { certification_id: evidenceId, destination_id: destination.id, connector_key: destination.platform_key, mode: process.env.SIMULATION_MODE === 'false' ? 'approved_test_instance' : 'simulation', started_at: now, steps: [], status: 'running' };
    certifications.set(evidenceId, evidence); update({ status: 'running', progress: 10 });
    try {
      const connection = { simulation: process.env.SIMULATION_MODE !== 'false', ...(req.body?.connection ?? {}) };
      const steps: Record<string, unknown>[] = [];
      let result: Record<string, unknown>;
      if (destination.platform_key === 'assisted') {
        const pack = await invokeConnector('assisted', 'build_assist_pack', { rendition, destination });
        steps.push({ step: 'build_assist_pack', result: pack, at: new Date().toISOString() });
        result = { certification_id: evidenceId, destination_id: destination.id, connector_key: destination.platform_key, status: 'assisted_pack_created_manual_review_required', duration_ms: Date.now() - started, steps, warnings: ['Assisted destinations require a human to review the checklist, post manually, and record the real URL. This is not a platform certification.'], manifest: { provider: 'assisted', version: '1.0.0', simulation_mode: true, cost_estimate_usd: 0, rights: { test_content_only: true }, warnings: ['No external platform was contacted.'] } };
      } else {
        const published = await invokeConnector(destination.platform_key, 'publish', { rendition, destination, connection, idempotency_key: `cert:${key}` });
        const postId = String(published.platform_post_id ?? '');
        steps.push({ step: 'publish', result: published, at: new Date().toISOString() }); update({ progress: 45 });
        const status = await invokeConnector(destination.platform_key, 'get_status', { platform_post_id: postId, destination, connection });
        steps.push({ step: 'get_status', result: status, at: new Date().toISOString() }); update({ progress: 70 });
        const deleted = await invokeConnector(destination.platform_key, 'delete', { platform_post_id: postId, destination, connection });
        steps.push({ step: 'delete', result: deleted, at: new Date().toISOString() });
        const finalStatus = await invokeConnector(destination.platform_key, 'get_status', { platform_post_id: postId, destination, connection });
        steps.push({ step: 'confirm_deleted', result: finalStatus, at: new Date().toISOString() });
        const simulated = Boolean((published as any).simulated);
        result = { certification_id: evidenceId, destination_id: destination.id, connector_key: destination.platform_key, status: simulated ? 'simulated_lifecycle_passed_not_platform_certified' : 'lifecycle_passed', live_url: published.live_url, duration_ms: Date.now() - started, steps, warnings: simulated ? ['Simulation lifecycle only; not evidence of a real platform destination certification.'] : [], manifest: { provider: destination.platform_key, version: '1.0.0', simulation_mode: simulated, cost_estimate_usd: 0, rights: { test_content_only: true }, warnings: simulated ? ['No external platform was contacted.'] : [] } };
      }
      certifications.set(evidenceId, { ...result, started_at: now, completed_at: new Date().toISOString() });
      update({ status: 'succeeded', progress: 100, result });
      log('info', 'certification_completed', req, {
  job_id: jobId,
  certification_id: evidenceId,
  destination_id: destination.id,
  simulated: true });
    } catch (e) {
      const ex = e as any; const failed = { ...evidence, status: 'failed', completed_at: new Date().toISOString(), error: { code: ex.code ?? 'INTERNAL_ERROR', message: ex.message ?? 'Certification failed' } };
      certifications.set(evidenceId, failed); update({ status: 'failed', progress: 100, error: failed.error as any });
      log('error', 'certification_failed', req, { job_id: jobId, certification_id: evidenceId, error_code: ex.code ?? 'INTERNAL_ERROR' });
    }
  });
});
app.post('/api/v1/destinations', (req, res) => {
  const key = req.header('Idempotency-Key');
  if (!key) return error(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  const bodyHash = safeHash(req.body); const prior = destinationIdempotency.get(key);
  if (prior) {
    if (prior.bodyHash !== bodyHash) return error(res, 409, 'IDEMPOTENCY_KEY_CONFLICT', 'This key was already used with a different request');
    return res.status(200).json({ ...prior.response, idempotent_replay: true });
  }
  try { const d = getDestination(req.body); destinationIdempotency.set(key, { bodyHash, response: d }); return res.status(201).json(d); }
  catch (e) { return error(res, 400, (e as any).code ?? 'INVALID_REQUEST', (e as Error).message); }
});

app.post('/api/v1/publish', (req, res) => {
  const key = req.header('Idempotency-Key');
  if (!key) return error(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  const bodyHash = safeHash(req.body);
  const existing = idempotency.get(key);
  if (existing) {
    if (existing.bodyHash !== bodyHash) return error(res, 409, 'IDEMPOTENCY_KEY_CONFLICT', 'This key was already used with a different request');
    const existingJob = jobs.get(existing.jobId);
    return res.status(202).json({ job_id: existing.jobId, status: existingJob?.status ?? 'queued', idempotent_replay: true });
  }
  let destination: Destination;
  try { destination = getDestination(req.body?.destination); }
  catch (e) { return error(res, 400, (e as any).code ?? 'INVALID_REQUEST', (e as Error).message); }
  const rendition = req.body?.rendition as Rendition;
  const violations = validateRendition(rendition, destination);
  if (violations.length) return error(res, 422, violations[0].code, 'Publishing rules blocked this content', false, violations);
  const cap = checkFrequencyCap(destination);
  if (cap.length) return error(res, 429, cap[0].code, cap[0].message, true, cap);
  const jobId = randomUUID(); const now = new Date().toISOString();
  const job: Job = { job_id: jobId, status: 'queued', progress: 0, created_at: now, updated_at: now };
  jobs.set(jobId, job); idempotency.set(key, { bodyHash, jobId });
  log('info', 'publish_job_queued', req, { job_id: jobId, destination_id: destination.id, connector: destination.platform_key });
  res.status(202).json({ job_id: jobId, status: 'queued' });
  setImmediate(async () => {
    const update = (patch: Partial<Job>) => jobs.set(jobId, { ...jobs.get(jobId)!, ...patch, updated_at: new Date().toISOString() });
    const startedAt = Date.now();
    update({ status: 'running', progress: 20 });
    try {
      const connectorResult = await invokeConnector(destination.platform_key, 'publish', { rendition, destination, connection: { simulation: process.env.SIMULATION_MODE !== 'false' }, idempotency_key: key });
      update({ progress: 90 });
      const postId = String(connectorResult.platform_post_id ?? '');
      if (postId) postDestinations.set(postId, destination);
      recordSuccessfulPost(destination.id);
      const simulated = Boolean((connectorResult as any).simulated);
      const manifest = { provider: destination.platform_key, connector_version: '1.0.0', simulation_mode: simulated, settings: { destination_id: destination.id }, seed: null, timings_ms: { total: Date.now() - startedAt }, cost_estimate_usd: 0, warnings: simulated ? ['Simulation result; not a real external publication.'] : [], rights: { content_owner_attestation_required: true, ai_generated: Boolean(rendition?.aiGenerated), media_rights_attestation_required: true } };
      update({ status: 'succeeded', progress: 100, result: { ...connectorResult, manifest } });
      log('info', 'publish_job_succeeded', req, { job_id: jobId, destination_id: destination.id });
    } catch (e) {
      const ex = e as any; update({ status: 'failed', progress: 100, error: { code: ex.code ?? 'INTERNAL_ERROR', message: ex.message ?? 'Unexpected error', retryable: Boolean(ex.retryable), details: ex.details } });
      log('error', 'publish_job_failed', req, { job_id: jobId, error_code: ex.code ?? 'INTERNAL_ERROR' });
    }
  });
});

app.post('/connector/v1/:connector_key/:method', async (req, res) => {
  try {
    const key = req.params.connector_key; const method = req.params.method;
    const args = req.body ?? {};
    if (method === 'publish') {
      const idem = String(args.idempotency_key ?? req.header('Idempotency-Key') ?? '');
      if (!idem) return error(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'idempotency_key is required');
      const cacheKey = `${key}:${idem}`; const old = publishIdempotency.get(cacheKey);
      if (old) return res.json(old);
      const out = await invokeConnector(key, method, { ...args, idempotency_key: idem });
      publishIdempotency.set(cacheKey, out); return res.json(out);
    }
    return res.json(await invokeConnector(key, method, args));
  } catch (e) {
    const ex = e as any;
    return error(res, ex.code === 'INVALID_REQUEST' ? 400 : ex.code === 'NOT_FOUND' ? 404 : ex.code === 'CONNECTION_AUTH_EXPIRED' ? 401 : ex.code === 'PLATFORM_RATE_LIMIT' ? 429 : 422, ex.code ?? 'INTERNAL_ERROR', ex.message ?? 'Unexpected error', Boolean(ex.retryable), ex.details);
  }
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  log('error', 'unhandled_request_error', req, { error: String(err) });
  return error(res, 500, 'INTERNAL_ERROR', 'Unexpected server error');
});

const port = Number(process.env.PORT ?? 8080);
if (process.env.NODE_ENV !== 'test') app.listen(port, '0.0.0.0', () => log('info', `service_listening_on_${port}`));
export { app, catalogueRows, certifications, destinationIdempotency, destinations, idempotency, jobs, mockPartnerPosts };


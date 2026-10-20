import { createHmac, randomUUID } from 'node:crypto';
import type { Connection, Destination, Rendition } from './types.js';
import { validateRendition } from './rules.js';

export const connectorKeys = ['discourse', 'lemmy', 'devto', 'ghost', 'signed_webhook', 'assisted'] as const;
export type ConnectorKey = typeof connectorKeys[number];

export const manifests: Record<ConnectorKey, Record<string, unknown>> = {
  discourse: { key: 'discourse', version: '1.0.0', tier: 'native', auth: 'api_key', surfaces: [{ key: 'topic', content_types: ['text', 'image', 'video_link'], spec: { title_max_chars: 255, body_max_chars: 32000, links_allowed: true } }], rate_limits: { per_connection: { requests: 60, per_seconds: 60 } }, capabilities: ['validate','publish','get_status','delete','fetch_metrics','refresh_auth'], error_map: { '429':'PLATFORM_RATE_LIMIT','401':'CONNECTION_AUTH_EXPIRED' }, instance_param: 'base_url' },
  lemmy: { key: 'lemmy', version: '1.0.0', tier: 'native', auth: 'api_key', surfaces: [{ key: 'post', content_types: ['text','image','video_link'], spec: { title_max_chars: 200, body_max_chars: 10000, links_allowed: true } }], rate_limits: { per_connection: { requests: 30, per_seconds: 60 } }, capabilities: ['validate','publish','get_status','delete','fetch_metrics','refresh_auth'], error_map: { '429':'PLATFORM_RATE_LIMIT','401':'CONNECTION_AUTH_EXPIRED' }, instance_param: 'base_url' },
  devto: { key: 'devto', version: '1.0.0', tier: 'native', auth: 'api_key', surfaces: [{ key: 'article', content_types: ['text','image'], spec: { title_max_chars: 128, body_max_chars: 100000, links_allowed: true } }], rate_limits: { per_connection: { requests: 10, per_seconds: 60 } }, capabilities: ['validate','publish','get_status','delete','fetch_metrics','refresh_auth'], error_map: { '429':'PLATFORM_RATE_LIMIT','401':'CONNECTION_AUTH_EXPIRED' }, instance_param: 'base_url' },
  ghost: { key: 'ghost', version: '1.0.0', tier: 'native', auth: 'api_key', surfaces: [{ key: 'post', content_types: ['text','image'], spec: { title_max_chars: 300, body_max_chars: 100000, links_allowed: true } }], rate_limits: { per_connection: { requests: 60, per_seconds: 60 } }, capabilities: ['validate','publish','get_status','delete','fetch_metrics','refresh_auth'], error_map: { '429':'PLATFORM_RATE_LIMIT','401':'CONNECTION_AUTH_EXPIRED' }, instance_param: 'base_url' },
  signed_webhook: { key: 'signed_webhook', version: '1.0.0', tier: 'protocol', auth: 'api_key', surfaces: [{ key: 'payload', content_types: ['text','image','video_link'], spec: { title_max_chars: 500, body_max_chars: 100000, links_allowed: true } }], rate_limits: { per_connection: { requests: 60, per_seconds: 60 } }, capabilities: ['validate','publish','get_status','delete','fetch_metrics','refresh_auth'], error_map: { '429':'PLATFORM_RATE_LIMIT','401':'CONNECTION_AUTH_EXPIRED' }, instance_param: 'base_url' },
  assisted: { key: 'assisted', version: '1.0.0', tier: 'assisted', auth: 'none', surfaces: [{ key: 'ready_to_post_pack', content_types: ['text','image','video_link'], spec: { title_max_chars: 1000, body_max_chars: 100000, links_allowed: true } }], rate_limits: { per_connection: { requests: 999, per_seconds: 60 } }, capabilities: ['validate','build_assist_pack'], error_map: {}, instance_param: 'base_url' }
};

const simulatedPosts = new Map<string, { connector: string; live_url: string; status: string; deleted: boolean }>();

export class ConnectorError extends Error {
  constructor(public code: string, message: string, public retryable = false, public details?: unknown) { super(message); }
}

export async function invokeConnector(key: string, method: string, args: any): Promise<Record<string, unknown>> {
  if (!connectorKeys.includes(key as ConnectorKey)) throw new ConnectorError('CONNECTOR_DISABLED', `Unknown connector: ${key}`);
  const k = key as ConnectorKey;
  const { rendition, destination, connection = {}, platform_post_id, idempotency_key } = args ?? {};
  if (method === 'validate') {
    if (!rendition || !destination) throw new ConnectorError('INVALID_REQUEST', 'rendition and destination are required');
    const violations = validateRendition(rendition as Rendition, destination as Destination);
    return { ok: violations.length === 0, violations };
  }
  if (method === 'build_assist_pack' && k === 'assisted') {
    if (!destination || !rendition) throw new ConnectorError('INVALID_REQUEST', 'rendition and destination are required');
    const d = destination as Destination; const r = rendition as Rendition;
    const violations = validateRendition(r, { ...d, automation_allowed: true });
    return { files: r.media ?? [], caption: `${r.title}\n\n${r.body}`, deep_link: d.base_url ?? '', checklist: ['Confirm community rules', 'Add required AI disclosure', 'Review title and links', 'Post manually', 'Record live URL'], violations };
  }
  if (method === 'publish') {
    if (k === 'assisted') throw new ConnectorError('INVALID_REQUEST', 'Use build_assist_pack for the assisted connector');
    if (!idempotency_key || typeof idempotency_key !== 'string') throw new ConnectorError('IDEMPOTENCY_KEY_REQUIRED', 'idempotency_key is required');
    if (process.env.SIMULATION_MODE !== 'false' || connection.simulation === true) {
      const id = `sim_${createHmac('sha256', 'local-simulation').update(`${k}:${idempotency_key}`).digest('hex').slice(0, 16)}`;
      const prior = simulatedPosts.get(id);
      if (prior) return { platform_post_id: id, live_url: prior.live_url, status: prior.deleted ? 'deleted' : prior.status, simulated: true, idempotent_replay: true };
      const base = (destination as Destination)?.base_url ?? `https://${k}.example.test`;
      const live_url = `${base.replace(/\/$/, '')}/posts/${id}`;
      simulatedPosts.set(id, { connector: k, live_url, status: 'published', deleted: false });
      return { platform_post_id: id, live_url, status: 'published', simulated: true };
    }
    if (k === 'signed_webhook') {
      const d = destination as Destination;
      const endpoint = d?.base_url;
      const secret = String(connection.secret ?? process.env.WEBHOOK_SECRET ?? '');
      if (!endpoint || !secret) throw new ConnectorError('INVALID_REQUEST', 'signed_webhook requires destination.base_url and connection.secret or WEBHOOK_SECRET');
      const payload = JSON.stringify({ event: 'publish', destination: d, rendition, idempotency_key });
      const signature = signWebhook(payload, secret);
      let response: Response | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': String(idempotency_key), 'X-IncuBrix-Signature': `sha256=${signature}` }, body: payload, signal: AbortSignal.timeout(10_000) }); }
        catch (e) { throw new ConnectorError('PLATFORM_UNAVAILABLE', 'Signed webhook endpoint could not be reached', true, { cause: (e as Error).name }); }
        if (response.status !== 429 || attempt === 2) break;
        const reset = response.headers.get('x-ratelimit-reset'); const retryAfter = response.headers.get('retry-after');
        let delayMs = 1000;
        const rawReset = Number(reset);
        if (reset && Number.isFinite(rawReset)) delayMs = rawReset > Date.now() / 1000 ? (rawReset * 1000 - Date.now()) : rawReset * 1000;
        else if (retryAfter && Number.isFinite(Number(retryAfter))) delayMs = Number(retryAfter) * 1000;
        else if (retryAfter) { const date = Date.parse(retryAfter); if (Number.isFinite(date)) delayMs = date - Date.now(); }
        await new Promise(resolve => setTimeout(resolve, Math.max(100, Math.min(delayMs, 30_000))));
      }
      if (!response) throw new ConnectorError('PLATFORM_UNAVAILABLE', 'Partner webhook did not return a response', true);
      if (response.status === 429) throw new ConnectorError('PLATFORM_RATE_LIMIT', 'Partner webhook rate limited the request after bounded retries', true, { reset: response.headers.get('x-ratelimit-reset') ?? response.headers.get('retry-after') });
      if (response.status === 401) throw new ConnectorError('CONNECTION_AUTH_EXPIRED', 'Partner webhook rejected authentication');
      if (response.status === 422) throw new ConnectorError('PLATFORM_CONTENT_REJECTED', 'Partner webhook rejected the content', false, await response.text().catch(() => ''));
      if (!response.ok) throw new ConnectorError('PLATFORM_UNAVAILABLE', `Partner webhook returned HTTP ${response.status}`, response.status >= 500);
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      const postId = String(data.platform_post_id ?? data.id ?? idempotency_key);
      return { platform_post_id: postId, live_url: String(data.live_url ?? endpoint), status: String(data.status ?? 'published') };
    }
    throw new ConnectorError('PLATFORM_UNAVAILABLE', `Live adapter for ${k} is not configured`, true);
  }
  if (method === 'get_status' && k === 'signed_webhook' && process.env.SIMULATION_MODE === 'false') {
    const base = String((destination as Destination)?.base_url ?? connection.base_url ?? '');
    if (!base || !platform_post_id) throw new ConnectorError('INVALID_REQUEST', 'destination.base_url and platform_post_id are required');
    let response: Response;
    try { response = await fetch(`${base.replace(/\/$/, '')}/${encodeURIComponent(String(platform_post_id))}`, { headers: { ...(connection.secret || process.env.WEBHOOK_SECRET ? { 'X-IncuBrix-Secret': String(connection.secret ?? process.env.WEBHOOK_SECRET) } : {}) }, signal: AbortSignal.timeout(10_000) }); }
    catch { throw new ConnectorError('PLATFORM_UNAVAILABLE', 'Signed webhook status endpoint could not be reached', true); }
    if (response.status === 404) throw new ConnectorError('NOT_FOUND', 'Partner post not found');
    if (!response.ok) throw new ConnectorError(response.status === 429 ? 'PLATFORM_RATE_LIMIT' : 'PLATFORM_UNAVAILABLE', `Partner status endpoint returned HTTP ${response.status}`, response.status === 429 || response.status >= 500);
    return await response.json() as Record<string, unknown>;
  }
  if (method === 'get_status') {
    const post = simulatedPosts.get(String(platform_post_id ?? ''));
    if (!post || post.connector !== k) throw new ConnectorError('NOT_FOUND', 'Simulated post not found');
    return { status: post.deleted ? 'deleted' : post.status, live_url: post.live_url, platform_post_id, simulated: true };
  }
  if (method === 'delete' && k === 'signed_webhook' && process.env.SIMULATION_MODE === 'false') {
    const base = String((destination as Destination)?.base_url ?? connection.base_url ?? '');
    if (!base || !platform_post_id) throw new ConnectorError('INVALID_REQUEST', 'destination.base_url and platform_post_id are required');
    let response: Response;
    try { response = await fetch(`${base.replace(/\/$/, '')}/${encodeURIComponent(String(platform_post_id))}`, { method: 'DELETE', headers: { ...(connection.secret || process.env.WEBHOOK_SECRET ? { 'X-IncuBrix-Secret': String(connection.secret ?? process.env.WEBHOOK_SECRET) } : {}) }, signal: AbortSignal.timeout(10_000) }); }
    catch { throw new ConnectorError('PLATFORM_UNAVAILABLE', 'Signed webhook delete endpoint could not be reached', true); }
    if (response.status === 404) throw new ConnectorError('NOT_FOUND', 'Partner post not found');
    if (!response.ok) throw new ConnectorError(response.status === 429 ? 'PLATFORM_RATE_LIMIT' : 'PLATFORM_UNAVAILABLE', `Partner delete endpoint returned HTTP ${response.status}`, response.status === 429 || response.status >= 500);
    return await response.json() as Record<string, unknown>;
  }
  if (method === 'delete') {
    const post = simulatedPosts.get(String(platform_post_id ?? ''));
    if (!post || post.connector !== k) throw new ConnectorError('NOT_FOUND', 'Simulated post not found');
    post.deleted = true; post.status = 'deleted';
    return { deleted: true, platform_post_id, simulated: true };
  }
  if (method === 'fetch_metrics') return { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, watch_time_s: 0, clicks: 0, simulated: true };
  if (method === 'refresh_auth') return { expires_at: new Date(Date.now() + 3600_000).toISOString(), simulated: true };
  throw new ConnectorError('INVALID_REQUEST', `Unsupported method '${method}' for connector '${key}'`);
}

export function signWebhook(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
export function newPostId(): string { return randomUUID(); }

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invokeConnector, connectorKeys, manifests, ConnectorError, signWebhook } from '../src/connectors.js';
import type { Destination, Rendition } from '../src/types.js';

const destination: Destination = { id: 'test-destination', name: 'Test destination', platform_key: 'devto', base_url: 'https://example.test', automation_allowed: true };
const rendition: Rendition = { title: 'A test post', body: 'Simulation only.' };

test('six required connector keys have manifests', () => {
  assert.deepEqual([...connectorKeys], ['discourse', 'lemmy', 'devto', 'ghost', 'signed_webhook', 'assisted']);
  for (const key of connectorKeys) assert.equal(manifests[key].key, key);
});

test('simulated publish is idempotent for the same connector and key', async () => {
  const args = { rendition, destination, connection: { simulation: true }, idempotency_key: 'test-idem-1' };
  const a = await invokeConnector('devto', 'publish', args);
  const b = await invokeConnector('devto', 'publish', args);
  assert.equal(a.platform_post_id, b.platform_post_id);
  assert.equal(a.simulated, true);
});

test('simulated post can be checked and deleted', async () => {
  const out = await invokeConnector('lemmy', 'publish', { rendition, destination: { ...destination, platform_key: 'lemmy' }, connection: { simulation: true }, idempotency_key: 'test-status-1' });
  const id = String(out.platform_post_id);
  assert.equal((await invokeConnector('lemmy', 'get_status', { platform_post_id: id })).status, 'published');
  assert.equal((await invokeConnector('lemmy', 'delete', { platform_post_id: id })).deleted, true);
  assert.equal((await invokeConnector('lemmy', 'get_status', { platform_post_id: id })).status, 'deleted');
});

test('status lookup rejects unknown simulated post IDs', async () => {
  await assert.rejects(() => invokeConnector('ghost', 'get_status', { platform_post_id: 'does-not-exist' }), (e: unknown) => e instanceof ConnectorError && e.code === 'NOT_FOUND');
});

test('HMAC helper creates a SHA-256 signature', () => {
  assert.equal(signWebhook('{"ok":true}', 'test-secret').length, 64);
});

test('retrying a previously deleted simulated post does not resurrect it', async () => {
  const args = { rendition, destination, connection: { simulation: true }, idempotency_key: 'test-deleted-retry' };
  const first = await invokeConnector('devto', 'publish', args);
  await invokeConnector('devto', 'delete', { platform_post_id: first.platform_post_id });
  const retry = await invokeConnector('devto', 'publish', args);
  assert.equal(retry.platform_post_id, first.platform_post_id);
  assert.equal(retry.status, 'deleted');
});

test('assisted connector creates a manual posting pack instead of publishing', async () => {
  const out = await invokeConnector('assisted', 'build_assist_pack', {
    destination: { ...destination, platform_key: 'assisted', base_url: 'https://community.example.test' },
    rendition
  });
  assert.equal(out.deep_link, 'https://community.example.test');
  assert.ok(Array.isArray(out.checklist));
  assert.equal(out.caption, `${rendition.title}\n\n${rendition.body}`);
});

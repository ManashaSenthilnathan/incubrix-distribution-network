import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogueCsv, normalizeDestinationUrl, validateCatalogueRows } from '../src/catalogue.js';

test('CSV parser handles quoted commas and headers', () => {
  const rows = parseCatalogueCsv('name,url,platform_key,category\n"AI, Video Forum",https://example.com/,discourse,AI');
  assert.equal(rows[0]?.name, 'AI, Video Forum');
});

test('URL normalization removes query, fragment, case and trailing slash', () => {
  assert.equal(normalizeDestinationUrl('HTTPS://Example.COM/community/?x=1#rules'), 'https://example.com/community');
});

test('catalogue validates rows and detects normalized duplicates', () => {
  const result = validateCatalogueRows([
    { name: 'AI Forum', url: 'https://example.com/', platform_key: 'discourse', category: 'AI' },
    { name: 'Duplicate', url: 'https://EXAMPLE.com', platform_key: 'discourse' },
    { name: 'Bad URL', url: 'javascript:alert(1)', platform_key: 'discourse' },
    { name: 'Unknown', url: 'https://unknown.example', platform_key: 'other' }
  ]);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.errors.length, 2);
  assert.ok(Number(result.accepted[0]?.relevance_score) >= 1);
});

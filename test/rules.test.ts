import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRendition, checkFrequencyCap, recordSuccessfulPost, resetRuleStateForTests } from '../src/rules.js';
import type { Destination, Rendition } from '../src/types.js';
const destination: Destination = { id: 'dev-community', name: 'Dev community', platform_key: 'devto', title_max_chars: 10, body_max_chars: 50, links_allowed: false, frequency_cap: 1, self_promo_allowed: false, disclosure_required: true, automation_allowed: true };
const rendition: Rendition = { title: 'A Java post', body: 'Read my blog', url: 'https://example.com', isPromotional: true, aiGenerated: true };
test('validateRendition blocks title overflow, links, promotion and missing AI disclosure', () => {
  const v = validateRendition(rendition, destination);
  assert.ok(v.some(x => x.field === 'title'));
  assert.ok(v.some(x => x.field === 'url'));
  assert.ok(v.some(x => x.field === 'isPromotional'));
  assert.ok(v.some(x => x.code === 'DEST_SPEC_VIOLATION' && x.message.includes('AI disclosure')));
});
test('weekly frequency cap blocks a second publication', () => {
  resetRuleStateForTests();
  assert.equal(checkFrequencyCap(destination).length, 0);
  recordSuccessfulPost(destination.id);
  assert.equal(checkFrequencyCap(destination).length, 1);
  resetRuleStateForTests();
});

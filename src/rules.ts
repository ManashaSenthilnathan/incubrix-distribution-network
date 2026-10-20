import type { Destination, Rendition } from './types.js';

export interface RuleViolation { code: string; field: string; message: string; retryable: boolean }
const recentPosts = new Map<string, number[]>();

export function validateRendition(r: Rendition, d: Destination): RuleViolation[] {
  const violations: RuleViolation[] = [];
  if (!r || typeof r.title !== 'string' || typeof r.body !== 'string' || !r.title.trim() || !r.body.trim()) {
    return [{ code: 'INVALID_REQUEST', field: 'rendition', message: 'title and body are required', retryable: false }];
  }
  if (r.title.length > (d.title_max_chars ?? 255)) violations.push({ code: 'DEST_SPEC_VIOLATION', field: 'title', message: `Title exceeds ${d.title_max_chars ?? 255} characters`, retryable: false });
  if (r.body.length > (d.body_max_chars ?? 32000)) violations.push({ code: 'DEST_SPEC_VIOLATION', field: 'body', message: `Body exceeds ${d.body_max_chars ?? 32000} characters`, retryable: false });
  if (r.url && d.links_allowed === false) violations.push({ code: 'DEST_SPEC_VIOLATION', field: 'url', message: 'Links are not allowed for this destination', retryable: false });
  if (r.isPromotional && d.self_promo_allowed === false) violations.push({ code: 'DEST_SPEC_VIOLATION', field: 'isPromotional', message: 'Destination does not allow self-promotion', retryable: false });
  if (r.aiGenerated && d.disclosure_required && !/\b(ai-generated|made with ai|created with ai)\b/i.test(`${r.title} ${r.body}`)) {
    violations.push({ code: 'DEST_SPEC_VIOLATION', field: 'body', message: 'Destination requires AI disclosure', retryable: false });
  }
  if (d.automation_allowed === false) violations.push({ code: 'DEST_SPEC_VIOLATION', field: 'automation_allowed', message: 'Automated publishing is not allowed; use the assisted connector', retryable: false });
  return violations;
}

export function checkFrequencyCap(destination: Destination, now = Date.now()): RuleViolation[] {
  const cap = destination.frequency_cap;
  if (!cap || cap < 1) return [];
  const times = (recentPosts.get(destination.id) ?? []).filter(t => now - t < 7 * 24 * 60 * 60 * 1000);
  recentPosts.set(destination.id, times);
  if (times.length >= cap) return [{ code: 'DEST_RULE_FREQUENCY_CAP', field: 'frequency_cap', message: `Weekly frequency cap (${cap}) reached`, retryable: true }];
  return [];
}
export function recordSuccessfulPost(destinationId: string, now = Date.now()): void {
  recentPosts.set(destinationId, [...(recentPosts.get(destinationId) ?? []), now]);
}
export function resetRuleStateForTests(): void { recentPosts.clear(); }

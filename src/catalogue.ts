import { connectorKeys } from './connectors.js';

export type CatalogueRow = Record<string, unknown>;
export interface CatalogueIssue { row: number; code: string; message: string }

function parseCsvLine(line: string): string[] {
  const out: string[] = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { out.push(value.trim()); value = ''; }
    else value += c;
  }
  out.push(value.trim()); return out;
}

export function parseCatalogueCsv(csv: string): CatalogueRow[] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]!).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => Object.fromEntries(parseCsvLine(line).map((v, i) => [headers[i] ?? `column_${i + 1}`, v])));
}

export function normalizeDestinationUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return null;
    url.hash = ''; url.search = ''; url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}

export function relevance(name: string, category: string, tags: string[]): { score: number; reason: string } {
  const audience = ['ai', 'video', 'marketing', 'saas', 'creator', 'founder'];
  const text = `${name} ${category} ${tags.join(' ')}`.toLowerCase();
  const hits = audience.filter(word => text.includes(word));
  const score = Math.min(5, 1 + hits.length);
  return { score, reason: hits.length ? `Audience overlap: ${hits.join(', ')}` : 'No direct audience keyword found; low-confidence fit pending human review.' };
}

export function validateCatalogueRows(rows: CatalogueRow[], existing: CatalogueRow[] = []): { accepted: CatalogueRow[]; errors: CatalogueIssue[]; duplicates: CatalogueIssue[] } {
  const accepted: CatalogueRow[] = []; const errors: CatalogueIssue[] = []; const duplicates: CatalogueIssue[] = [];
  const seen = new Set(existing.map(r => `${String(r.platform_key ?? r.connector_key ?? '').toLowerCase()}|${normalizeDestinationUrl(r.url ?? r.base_url) ?? String(r.url ?? r.base_url ?? '').toLowerCase()}`));
  rows.forEach((raw, index) => {
    const rowNumber = index + 2; const platform = String(raw.platform_key ?? raw.connector_key ?? '').toLowerCase().trim();
    const url = normalizeDestinationUrl(raw.url ?? raw.base_url);
    if (!String(raw.name ?? '').trim()) { errors.push({ row: rowNumber, code: 'NAME_REQUIRED', message: 'name is required' }); return; }
    if (!url) { errors.push({ row: rowNumber, code: 'INVALID_URL', message: 'url must be an absolute http(s) URL' }); return; }
    if (!connectorKeys.includes(platform as any)) { errors.push({ row: rowNumber, code: 'UNSUPPORTED_PLATFORM', message: `unsupported platform_key: ${platform}` }); return; }
    const dedupeKey = `${platform}|${url}`;
    if (seen.has(dedupeKey)) { duplicates.push({ row: rowNumber, code: 'DUPLICATE', message: `duplicate platform and URL: ${dedupeKey}` }); return; }
    seen.add(dedupeKey);
    const name = String(raw.name).trim(); const category = String(raw.category ?? '');
    const tags = String(raw.audience_tags ?? '').split(/[;|]/).map(t => t.trim()).filter(Boolean);
    const fit = relevance(name, category, tags);
    accepted.push({ ...raw, name, url, platform_key: platform, connector_key: platform, audience_tags: tags, relevance_score: fit.score, relevance_reason: fit.reason, level: 'uncertified', last_certified_at: null });
  });
  return { accepted, errors, duplicates };
}

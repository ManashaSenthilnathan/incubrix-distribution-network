/** Minimal batch runner: reads a JSON array of API requests and writes responses to an output folder. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const [inputArg, outputArg = './batch-results'] = process.argv.slice(2);
if (!inputArg) {
  process.stderr.write('Usage: npm run batch -- <requests.json> [output-directory]\n');
  process.exit(2);
}
const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:8080';
const requests = JSON.parse(await readFile(inputPath, 'utf8')) as Array<{ path: string; method?: string; body?: unknown; idempotencyKey?: string }>;
if (!Array.isArray(requests)) throw new Error('Input must be a JSON array');
await mkdir(outputPath, { recursive: true });
const summary: Array<Record<string, unknown>> = [];
for (let i = 0; i < requests.length; i++) {
  const item = requests[i]!;
  const response = await fetch(new URL(item.path, baseUrl), {
    method: item.method ?? 'GET',
    headers: { ...(item.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(item.idempotencyKey ? { 'Idempotency-Key': item.idempotencyKey } : {}) },
    ...(item.body === undefined ? {} : { body: JSON.stringify(item.body) })
  });
  const raw = await response.text();
  let parsed: unknown = raw;
  try { parsed = JSON.parse(raw); } catch { /* preserve non-JSON response */ }
  const file = `${String(i + 1).padStart(3, '0')}-${basename(item.path.replaceAll('/', '_') || 'root')}.json`;
  await writeFile(join(outputPath, file), JSON.stringify({ request: item, status: response.status, response: parsed }, null, 2));
  summary.push({ index: i + 1, path: item.path, status: response.status, output: file });
}
await writeFile(join(outputPath, 'manifest.json'), JSON.stringify({ generated_at: new Date().toISOString(), base_url: baseUrl, count: summary.length, results: summary }, null, 2));
process.stdout.write(`Completed ${summary.length} requests. Results: ${outputPath}\n`);

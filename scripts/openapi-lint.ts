import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apiTypesPath = resolve(process.cwd(), 'shared/api_types.ts');
const apiTypes = readFileSync(apiTypesPath, 'utf8');

const requiredRouteFragments = [
  'ApiRouteMap',
  'GET /health',
  'POST /api/v1/scripts/generate/quick',
  'GET /api/v1/templates',
  'POST /api/v1/viral-video-analyses',
  'GET /api/v1/analytics/retention-curve',
];

const missingFragments = requiredRouteFragments.filter((fragment) => !apiTypes.includes(fragment));

if (missingFragments.length > 0) {
  throw new Error(`OpenAPI contract lint failed, missing fragments: ${missingFragments.join(', ')}`);
}

console.log('OpenAPI contract lint passed.');

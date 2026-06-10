import { readFileSync, writeFileSync } from 'fs';

const file = '/workspace/workers/remotion-render-worker/dist/index.js';
let content = readFileSync(file, 'utf8');

const oldCode = "headers: { 'Content-Type': 'application/json' }";
const newCode = `headers: Object.assign({ 'Content-Type': 'application/json' }, process.env.INTERNAL_API_TOKEN ? { 'x-internal-token': process.env.INTERNAL_API_TOKEN } : {})`;

if (content.includes(newCode)) {
  console.log('Already patched');
  process.exit(0);
}

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  writeFileSync(file, content, 'utf8');
  console.log('Patched successfully:', content.includes('x-internal-token'));
} else {
  console.log('Old code not found, checking around line 262...');
  // Print surrounding lines
  const lines = content.split('\n');
  for (let i = 258; i < 266; i++) {
    console.log(`L${i + 1}: ${lines[i]}`);
  }
}

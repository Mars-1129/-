import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function findWorkspaceRoot(): string {
  if (process.env.WORKSPACE_ROOT && existsSync(process.env.WORKSPACE_ROOT)) {
    return process.env.WORKSPACE_ROOT;
  }

  const candidates = [
    process.cwd(),
    resolve(process.cwd(), '../..'),
    resolve(__dirname, '../../..'),
    resolve(__dirname, '../../../..'),
  ];

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'pnpm-workspace.yaml'))) {
      return candidate;
    }
  }

  return process.cwd();
}

export function loadWorkspaceEnv(): string {
  const root = findWorkspaceRoot();
  config({ path: resolve(root, '.env') });
  return root;
}

export function resolveWorkspacePath(...segments: string[]): string {
  return resolve(findWorkspaceRoot(), ...segments);
}

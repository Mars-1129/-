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
    resolve(__dirname, '../../../..'),
    resolve(__dirname, '../../../../../..'),
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
  // 先加载本地 .env（优先级更高），再加载 workspace root .env
  const localEnvPath = resolve(process.cwd(), '.env');
  if (existsSync(localEnvPath)) {
    config({ path: localEnvPath, override: true });
    console.log(`[env] loaded local .env from ${localEnvPath}`);
  }
  const rootEnvPath = resolve(root, '.env');
  if (existsSync(rootEnvPath)) {
    config({ path: rootEnvPath, override: false });
    console.log(`[env] loaded workspace .env from ${rootEnvPath}`);
  }
  return root;
}

export function resolveWorkspacePath(...segments: string[]): string {
  return resolve(findWorkspaceRoot(), ...segments);
}

export function resolveFirstExistingPath(candidates: string[]): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? findWorkspaceRoot();
}

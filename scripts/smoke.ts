type SmokeTarget = {
  name: string;
  url: string;
};

const targets: SmokeTarget[] = [
  { name: 'server-gateway', url: process.env.SMOKE_SERVER_URL || 'http://localhost:3000/health' },
  { name: 'web-client', url: process.env.SMOKE_WEB_URL || 'http://localhost:5173' },
  { name: 'gpu-slicing-worker', url: process.env.SMOKE_GPU_WORKER_URL || 'http://localhost:3101/health' },
  { name: 'remotion-render-worker', url: process.env.SMOKE_REMOTION_WORKER_URL || 'http://localhost:3102/health' },
];

async function checkTarget(target: SmokeTarget): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(target.url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${target.name} returned HTTP ${response.status}`);
    }
    console.log(`${target.name} smoke check passed: ${target.url}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const failures: string[] = [];

  for (const target of targets) {
    try {
      await checkTarget(target);
    } catch (error) {
      failures.push(`${target.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Smoke checks failed:\n${failures.join('\n')}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

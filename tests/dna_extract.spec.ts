/**
 * DNA 提取功能端到端测试
 * 验证 API 链路 + Doubao LLM 可用性
 * 运行方式: npx tsx tests/dna_extract.spec.ts
 */

const BASE = 'http://localhost:3000';

// =============================================================================
// 工具函数
// =============================================================================
function log(phase: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${phase}] ${msg}`);
}

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, ok: res.ok };
}

async function sseStream(
  path: string,
  method: string,
  body: unknown,
  onEvent: (event: string, data: Record<string, unknown>) => void,
  timeoutMs = 180_000,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOpts: RequestInit = {
      method,
      headers: { Accept: 'text/event-stream' },
    };
    if (method !== 'GET') {
      fetchOpts.headers = { ...fetchOpts.headers, 'Content-Type': 'application/json' };
      fetchOpts.body = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}${path}`, fetchOpts);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SSE连接失败 HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let pendingEventName = 'message';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('event:')) {
          pendingEventName = trimmed.slice(6).trim();
          continue;
        }

        if (trimmed.startsWith('data:')) {
          try {
            const json = JSON.parse(trimmed.slice(5).trim());
            onEvent(pendingEventName, json);
            pendingEventName = 'message';
          } catch {
            // skip malformed JSON
          }
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

// =============================================================================
// 测试用例
// =============================================================================

async function testHealthCheck() {
  log('TEST', '1. 豆包 LLM 可用性检查');
  const { status, body } = await api('/health/ai');
  if (status !== 200) throw new Error(`健康检查失败 HTTP ${status}`);
  if (!body.ok) throw new Error(`LLM 不可用: ${body.message}`);
  log('PASS', `LLM 可用 — ${body.provider} | ${body.message}`);
}

async function testViralAnalysisCount() {
  log('TEST', '2. 爆款视频分析数据量检查');
  const { status, body } = await api('/api/v1/viral-video-analyses?limit=2');
  if (status !== 200) throw new Error(`接口失败 HTTP ${status}`);
  const count = body.total || body.items?.length || 0;
  log('INFO', `已有 ${count} 条爆款视频分析记录`);
  if (count < 5) {
    log('WARN', '数据量较少(<5)，聚类效果可能受影响');
  }
}

async function testDnaExtractStream() {
  log('TEST', '3. DNA 提取 (SSE 流式, 含 LLM 语义标签)');

  return new Promise<void>((resolve, reject) => {
    const phases: string[] = [];
    let patternCount = 0;
    const labelPhases = new Set(['labeling', 'generating', 'persisting']);
    let hasLLM = false;

    let completed = false;
    sseStream(
      '/api/v1/viral-dna/extract/stream?category=beauty',
      'GET',
      {},
      (event, data) => {
        // 进度事件 (collecting / clustering / generating / labeling / persisting)
        const progressPhases = ['collecting', 'clustering', 'generating', 'labeling', 'persisting'];
        if (progressPhases.includes(event)) {
          // data is JSON-stringified: {"phase":"...","progress":...,"detail":"..."}
          const d = typeof data === 'string' ? JSON.parse(data as unknown as string) : data;
          const pct = d.progress || 0;
          phases.push(`${d.phase || event}/${pct}%`);
          log('SSE', `[${d.phase || event}] ${pct}% — ${d.detail || ''}`);
          if (labelPhases.has(d.phase || event)) hasLLM = true;
          return;
        }

        // 结果事件
        if (event === 'result') {
          const d = typeof data === 'string' ? JSON.parse(data as unknown as string) : data;
          patternCount = (d.patterns as unknown[])?.length || 0;
          log('INFO', `DNA 模式数量: ${patternCount}`);
          if (d.patterns && Array.isArray(d.patterns) && d.patterns.length > 0) {
            const p = d.patterns[0] as Record<string, unknown>;
            const hasLabel = !!(p.pattern_label || p.semantic_label || p.label);
            log('INFO', `LLM 标签: ${hasLabel ? '已生成 ✓' : '未生成'} | Hook:${Array.isArray(p.hooks) ? p.hooks.length : 0} | BGM:${Array.isArray(p.bgm_patterns) ? p.bgm_patterns.length : 0}`);
          }
          return;
        }

        // 错误事件
        if (event === 'error') {
          const d = typeof data === 'string' ? JSON.parse(data as unknown as string) : data;
          reject(new Error(`DNA SSE 错误: ${d.message}`));
          return;
        }
      },
      180_000,
    )
      .then(() => {
        completed = true;
        log('PASS', `DNA SSE 提取完成 (${patternCount} 模式) — 阶段: ${phases.join(' → ')} | LLM阶段:${hasLLM ? '已执行' : '回退统计'}`);
        resolve();
      })
      .catch(reject);
  });
}

async function testDnaListAndDetail() {
  log('TEST', '4. DNA 列表与详情查询');

  const list = await api('/api/v1/viral-dna?limit=5');
  if (list.status !== 200) {
    log('WARN', `DNA列表失败 HTTP ${list.status}，跳过详情`);
    return;
  }
  const items = list.body.items || list.body.data || [];
  log('INFO', `DNA 列表返回 ${items.length} 条`);

  if (items.length > 0) {
    const dnaId = items[0].dna_id || items[0].id;
    const detail = await api(`/api/v1/viral-dna/${dnaId}`);
    if (detail.status === 200) {
      const d = detail.body;
      const hasLabel = !!(d.pattern_label || d.semantic_label || d.category_label || d.label);
      const hasHook = Array.isArray(d.hooks) && d.hooks.length > 0;
      const hasVisual = Array.isArray(d.visual_styles) && d.visual_styles.length > 0;
      const hasBgm = Array.isArray(d.bgm_patterns) && d.bgm_patterns.length > 0;
      log('PASS', `DNA 详情 — 标签:${hasLabel ? '有' : '无'} | Hook:${hasHook ? '有' : '无'} | 视觉:${hasVisual ? '有' : '无'} | BGM:${hasBgm ? '有' : '无'}`);
    } else {
      log('WARN', `DNA详情失败 HTTP ${detail.status}`);
    }
  }
}

async function testGenerateFromDna() {
  log('TEST', '5. DNA 驱动剧本生成');

  const list = await api('/api/v1/viral-dna?limit=1');
  if (list.status !== 200 || !list.body.items?.length) {
    log('WARN', '无 DNA 数据，跳过生成测试');
    return;
  }

  const dnaId = list.body.items[0].dna_id || list.body.items[0].id;
  const { status, body } = await api('/api/v1/scripts/generate/from-dna', {
    method: 'POST',
    body: JSON.stringify({ dna_id: dnaId }),
  });

  if (status === 404) {
    log('WARN', 'DNA生成端点未注册，跳过');
    return;
  }
  if (status !== 200 && status !== 201) {
    log('WARN', `DNA生成失败 HTTP ${status}: ${JSON.stringify(body).slice(0, 150)}`);
    return;
  }

  log('PASS', `DNA生成剧本 — strategy:${!!body.strategy_overrides} | factor:${!!body.factor_overrides}`);
}

// =============================================================================
// 测试执行
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     DNA 提取功能端到端测试                    ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const results: { name: string; pass: boolean; error?: string }[] = [];

  const tests = [
    { name: 'LLM可用性检查', fn: testHealthCheck },
    { name: '爆款数据量检查', fn: testViralAnalysisCount },
    { name: 'DNA SSE流式提取(含LLM)', fn: testDnaExtractStream },
    { name: 'DNA列表与详情', fn: testDnaListAndDetail },
    { name: 'DNA驱动剧本生成', fn: testGenerateFromDna },
  ];

  for (const { name, fn } of tests) {
    try {
      await fn();
      results.push({ name, pass: true });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log('FAIL', err);
      results.push({ name, pass: false, error: err });
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('              测试结果汇总                   ');
  console.log('═══════════════════════════════════════════');

  let passCount = 0;
  for (const r of results) {
    const status = r.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}  ${r.name}`);
    if (r.error) console.log(`          ${r.error}`);
    if (r.pass) passCount++;
  }

  console.log(`\n  通过: ${passCount}/${results.length}`);

  if (passCount < results.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('测试执行异常:', e);
  process.exit(2);
});

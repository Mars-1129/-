const BASE = 'http://localhost:3000';

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  const t = await res.text();
  try { return { ok: res.ok, status: res.status, body: t ? JSON.parse(t) : null }; }
  catch { return { ok: res.ok, status: res.status, body: t }; }
}

async function main() {
  // Get the task ID from logs and find its creation
  const taskRes = await fetchJson(`${BASE}/api/v1/tasks/tsk_20260609_ccb3920a03`);
  console.log('Task tsk_20260609_ccb3920a03:', JSON.stringify(taskRes.body, null, 2).slice(0, 500));

  // Try finding by task_id
  const list = await fetchJson(`${BASE}/api/v1/creations?page=1&page_size=20&task_id=tsk_20260609_ccb3920a03`);
  console.log('\nCreations by task_id:', JSON.stringify(list.body, null, 2).slice(0, 500));
}

main().catch(e => console.error(e));

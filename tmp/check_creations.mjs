const BASE = 'http://localhost:3000';

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  const t = await res.text();
  try { return { ok: res.ok, status: res.status, body: t ? JSON.parse(t) : null }; }
  catch { return { ok: res.ok, status: res.status, body: t }; }
}

async function main() {
  // Check recent creations
  const list = await fetchJson(`${BASE}/api/v1/creations?page=1&page_size=10`);
  const items = list.body?.data?.items || [];
  console.log('Recent creations:');
  for (const c of items) {
    console.log(`  ${c.id || c.creation_id} | status=${c.status} | stage=${c.current_stage} | error=${c.error_message || '(none)'}`);
  }

  // Check the two specific creation IDs from logs
  const ids = ['bf3b103d-cfb6-4776-b9c0-3697fa3d721a'];
  
  // Try to find the other one
  const otherId = items.find(i => (i.id || i.creation_id) !== 'bf3b103d-cfb6-4776-b9c0-3697fa3d721a');
  if (otherId) ids.push(otherId.id || otherId.creation_id);

  for (const id of ids) {
    console.log(`\n=== Creation: ${id} ===`);
    const detail = await fetchJson(`${BASE}/api/v1/creations/${id}`);
    const d = detail.body?.data || detail.body;
    console.log(`  status=${d.status}, stage=${d.current_stage}, error=${d.error_message || '(none)'}`);
    const shots = d.shot_renders || [];
    shots.forEach((s, i) => {
      const src = s.render_path ? 'RENDERED' : 'PENDING';
      console.log(`  shot[${i}]: status=${s.status}, source=${src}, error=${s.render_error || s.error || '(none)'}`);
    });
  }
}

main().catch(e => console.error(e));

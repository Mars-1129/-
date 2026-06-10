const API_KEY = 'sk-pencaimaptytbfxwgxhsysgrurvofgreblvgbcaxqtyfwxki';

async function test(label, body) {
  console.log(`\n=== Test: ${label} ===`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errData = await response.text();
      console.log('HTTP ERROR:', response.status, errData.substring(0, 500));
      return;
    }
    
    const data = await response.json();

    if (data.choices?.[0]?.message?.content) {
      const content = data.choices[0].message.content;
      console.log('Content length:', content.length);
      console.log('Content:', content.substring(0, 800));
      console.log('Finish:', data.choices[0].finish_reason);
      console.log('Usage:', JSON.stringify(data.usage));

      let parsed = false;
      const trimmed = content.trim();
      
      // Direct parse
      try {
        const p = JSON.parse(trimmed);
        console.log('DIRECT PARSE OK');
        console.log('  Keys:', Object.keys(p));
        console.log('  dense_caption:', typeof p.dense_caption === 'string' ? p.dense_caption.substring(0, 80) + '...' : 'MISSING');
        console.log('  caption:', typeof p.caption === 'string' ? p.caption.substring(0, 80) + '...' : 'MISSING');
        console.log('  tags:', Array.isArray(p.tags) ? `[${p.tags.length} items]` : 'MISSING');
        parsed = true;
      } catch(e) {
        // try code block
        const m = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (m) {
          try { 
            const p = JSON.parse(m[1].trim());
            console.log('CODE-BLOCK PARSE OK. Keys:', Object.keys(p));
            parsed = true;
          } catch {}
        }
        // try extract JSON
        if (!parsed) {
          const jm = content.match(/\{[\s\S]*\}/);
          if (jm) {
            try { 
              const p = JSON.parse(jm[0]);
              console.log('JSON-EXTRACT PARSE OK. Keys:', Object.keys(p));
              parsed = true;
            } catch(e2) { console.log('JSON extract failed:', e2.message.substring(0, 100)); }
          }
        }
      }
      if (!parsed) console.log('ALL PARSE FAILED');
    } else {
      console.log('No content:', JSON.stringify(data).substring(0, 500));
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.log('ERROR:', error.message);
  }
}

async function main() {
  // Revised prompt - put field names at the very end (recency bias)
  const system1 = `You are a professional video captioning AI for e-commerce product videos. Describe video segments in dense English detail with relevant tags.

Product Context:
- Product: Smartphone X Pro (Electronics)
- Selling Points: High quality, durable, affordable
- Time Window: 0.0s to 3.0s (duration: 3.0s)

CAPTION REQUIREMENTS:
1. 80-200 words of dense visual description
2. Describe subject, action, product details, lighting, composition, mood
3. Include spatial relationships and camera perspective
4. Note any on-screen text, UI elements, or product labeling visible
5. Describe colors, textures, and materials in detail

TAG REQUIREMENTS:
1. 5-15 tags in snake_case
2. Include: camera_angle, lighting_condition, setting, product_feature, action_type, mood

Output EXACTLY this JSON structure with these field names:
{"dense_caption": "your caption here", "tags": ["tag1", "tag2", "tag3"]}`;

  const user1 = `Analyze the video segment from 0.0s to 3.0s (duration 3.0s) of the product "Smartphone X Pro" and produce the dense visual caption with tags.`;

  await test('14B_refined_prompt', {
    model: 'Qwen/Qwen2.5-14B-Instruct',
    messages: [{ role: 'system', content: system1 }, { role: 'user', content: user1 }],
    max_tokens: 2048,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });
}

main();

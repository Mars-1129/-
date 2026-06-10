const API_KEY = 'sk-pencaimaptytbfxwgxhsysgrurvofgreblvgbcaxqtyfwxki';

async function test(label, body) {
  console.log(`\n=== Test: ${label} ===`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

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
      console.log('Content:', content.substring(0, 600));
      console.log('Finish:', data.choices[0].finish_reason);
      console.log('Usage:', JSON.stringify(data.usage));

      let parsed = false;
      // Direct
      try {
        const p = JSON.parse(content.trim());
        console.log('DIRECT PARSE OK');
        parsed = true;
      } catch {
        // Markdown
        const m = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (m) {
          try { JSON.parse(m[1].trim()); console.log('CODE-BLOCK PARSE OK'); parsed = true; } catch {}
        }
        // JSON extract
        if (!parsed) {
          const jm = content.match(/\{[\s\S]*\}/);
          if (jm) {
            try { JSON.parse(jm[0]); console.log('JSON-EXTRACT PARSE OK'); parsed = true; } catch(e) { console.log('JSON extract failed:', e.message.substring(0,100)); }
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
  const messages = [
    {
      role: 'system',
      content: 'You are a video captioning AI. Output ONLY a valid JSON object with fields "dense_caption" (English string, 50-100 words) and "tags" (array of 5-10 snake_case strings). No markdown, no explanation.'
    },
    {
      role: 'user',
      content: 'Generate dense caption and tags for a 3-second product video segment of a smartphone being demonstrated on a table.'
    }
  ];

  // Test 1: Qwen 7B with json_object response_format
  await test('Qwen7B+json_object', {
    model: 'Qwen/Qwen2.5-7B-Instruct',
    messages,
    max_tokens: 1024,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  // Test 2: DeepSeek-V2.5 (larger, better at JSON)
  await test('DeepSeek-V2.5', {
    model: 'deepseek-ai/DeepSeek-V2.5',
    messages,
    max_tokens: 1024,
    temperature: 0.7,
  });

  // Test 3: Qwen 32B (larger)
  await test('Qwen2.5-32B', {
    model: 'Qwen/Qwen2.5-32B',
    messages,
    max_tokens: 1024,
    temperature: 0.7,
  });
}

main();

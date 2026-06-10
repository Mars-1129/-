const API_KEY = 'sk-pencaimaptytbfxwgxhsysgrurvofgreblvgbcaxqtyfwxki';

async function test(label, bodyExtra) {
  console.log(`\n=== Test: ${label} ===`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const baseBody = {
      model: 'Qwen/Qwen2.5-7B-Instruct',
      messages: [
        {
          role: 'system',
          content: 'You are a video captioning AI. You must output ONLY a single valid JSON object. Do NOT include markdown fences, code blocks, or any explanatory text. Output exactly one JSON object with "dense_caption" (string) and "tags" (array of strings) fields.'
        },
        {
          role: 'user',
          content: 'Generate dense caption and tags for a 3-second product video segment of a smartphone showing its screen. Requirements: caption 50-100 words in English, 5-10 tags in snake_case.'
        }
      ],
      max_tokens: 1024,
      temperature: 0.3,
      ...bodyExtra,
    };

    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
      body: JSON.stringify(baseBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    if (!response.ok) {
      console.log('HTTP ERROR:', response.status, JSON.stringify(data).substring(0, 300));
      return;
    }

    if (data.choices?.[0]?.message?.content) {
      const content = data.choices[0].message.content;
      console.log('Content length:', content.length);
      console.log('Content:', content.substring(0, 500));
      console.log('Finish reason:', data.choices[0].finish_reason);
      console.log('Usage:', JSON.stringify(data.usage));

      // Try parsing
      let parsed = false;
      try {
        const p = JSON.parse(content.trim());
        console.log('Direct parse OK:', 'dense_caption:', typeof p.dense_caption === 'string', 'tags:', Array.isArray(p.tags));
        parsed = true;
      } catch (e1) {
        const m = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (m) {
          try {
            const p = JSON.parse(m[1].trim());
            console.log('Code-block parse OK:', 'dense_caption:', typeof p.dense_caption === 'string', 'tags:', Array.isArray(p.tags));
            parsed = true;
          } catch {}
        }
        if (!parsed) {
          const jm = content.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
          if (jm) {
            try {
              const p = JSON.parse(jm[0]);
              console.log('JSON-extract parse OK:', 'dense_caption:', typeof p.dense_caption === 'string', 'tags:', Array.isArray(p.tags));
              parsed = true;
            } catch {}
          }
        }
      }
      if (!parsed) console.log('ALL PARSE ATTEMPTS FAILED');
    } else {
      console.log('No content. Response:', JSON.stringify(data).substring(0, 500));
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.log('ERROR:', error.message);
  }
}

async function main() {
  // Test 1: Low temp, stop tokens
  await test('low_temp+stop', {
    temperature: 0.1,
    max_tokens: 1024,
    stop: ['\n\n', '}\n'],
  });

  // Test 2: Even lower temp  
  await test('very_low_temp', {
    temperature: 0.05,
    max_tokens: 1024,
  });

  // Test 3: Try with top_p
  await test('top_p_0.5', {
    temperature: 0.2,
    top_p: 0.5,
    max_tokens: 1024,
  });
}

main();

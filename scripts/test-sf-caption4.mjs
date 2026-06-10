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
      try {
        const p = JSON.parse(content.trim());
        console.log('DIRECT PARSE OK');
        console.log('  dense_caption length:', p.dense_caption?.length);
        console.log('  tags count:', p.tags?.length);
        parsed = true;
      } catch(e) {
        // Markdown
        const m = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (m) {
          try { const p = JSON.parse(m[1].trim()); console.log('CODE-BLOCK PARSE OK'); parsed = true; } catch {}
        }
        if (!parsed) {
          const jm = content.match(/\{[\s\S]*\}/);
          if (jm) {
            try { JSON.parse(jm[0]); console.log('JSON-EXTRACT PARSE OK'); parsed = true; } catch(e2) { console.log('JSON extract failed:', e2.message.substring(0,100)); }
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
  // Full prompt used in production
  const fullSystemPrompt = `You are a professional video captioning AI specialized in e-commerce product videos for TikTok Shop. Your task is to provide a DENSE, highly detailed caption and relevant tags for the given video segment. The caption must be in English and describe the visual scene in rich detail.

Product Context:
- Product: Smartphone X Pro (Electronics)
- Selling Points: High quality, durable, affordable
- Time Window: 0.0s to 3.0s (duration: 3.0s)

CAPTION REQUIREMENTS:
1. MUST be 80-200 words of dense visual description
2. Describe subject, action, product details, lighting, composition, mood
3. Include spatial relationships and camera perspective
4. Note any on-screen text, UI elements, or product labeling visible
5. Describe colors, textures, and materials in detail

TAG REQUIREMENTS:
1. 5-15 tags in snake_case (lowercase, underscores)
2. Include: camera angle, lighting condition, setting, product_feature, action_type, mood
3. Prioritize descriptive tags over generic ones

IMPORTANT: Output ONLY a valid JSON object. No markdown, no explanation, no code fences.`;

  const userPrompt = `Analyze the video segment from 0.0s to 3.0s (duration 3.0s) of the product "Smartphone X Pro" and produce a dense visual caption with tags in valid JSON format.`;

  const messages = [
    { role: 'system', content: fullSystemPrompt },
    { role: 'user', content: userPrompt }
  ];

  // Test various models with json_object
  const models = [
    'Qwen/Qwen2.5-7B-Instruct',
    'Qwen/Qwen2.5-14B-Instruct',
    'Qwen/Qwen2.5-32B-Instruct',
    'Qwen/Qwen2.5-72B-Instruct',
    'Pro/Qwen/Qwen2.5-7B-Instruct',
    'Pro/Qwen/Qwen2-7B-Instruct',
    'deepseek-ai/DeepSeek-V2.5-1210',
    'meta-llama/Llama-3.3-70B-Instruct',
  ];

  for (const model of models) {
    await test(model, {
      model,
      messages,
      max_tokens: 2048,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });
  }
}

main();

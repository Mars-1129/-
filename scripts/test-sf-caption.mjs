const API_KEY = 'sk-pencaimaptytbfxwgxhsysgrurvofgreblvgbcaxqtyfwxki';

async function test(model, maxTokens, temperature, timeoutSec) {
  console.log(`\n=== Testing ${model} max_tokens=${maxTokens} temp=${temperature} timeout=${timeoutSec}s ===`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a video captioning AI. Output ONLY raw JSON, no markdown fences, no explanation text.\nThe JSON format is: {"dense_caption":"detailed english visual description 50-100 words","tags":["tag1","tag2","tag3"]}\nGenerate 5-10 tags in snake_case.'
          },
          {
            role: 'user',
            content: 'Generate dense caption and tags for a 3-second product video segment of a smartphone showing its screen.'
          }
        ],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.json();
    
    if (data.choices?.[0]?.message?.content) {
      const content = data.choices[0].message.content;
      console.log('SUCCESS. Content:');
      console.log(content);
      console.log('Usage:', JSON.stringify(data.usage));
      
      // Try parsing
      try {
        const parsed = JSON.parse(content.trim());
        console.log('Direct parse: OK -', JSON.stringify(parsed));
      } catch {
        const m = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (m) {
          try {
            const p = JSON.parse(m[1].trim());
            console.log('Code-block parse: OK -', JSON.stringify(p));
          } catch { console.log('All parse attempts FAILED'); }
        } else {
          const jm = content.match(/\{[\s\S]*\}/);
          if (jm) {
            try {
              const p = JSON.parse(jm[0]);
              console.log('JSON-extract parse: OK -', JSON.stringify(p));
            } catch { console.log('All parse attempts FAILED'); }
          } else {
            console.log('No JSON found in response');
          }
        }
      }
    } else {
      console.log('FAILED. Response:', JSON.stringify(data).substring(0, 500));
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.log('ERROR:', error.message);
  }
}

async function main() {
  // Test 1: Qwen 7B with low max_tokens
  await test('Qwen/Qwen2.5-7B-Instruct', 512, 0.5, 60);
  
  // Test 2: If first times out, try even smaller  
  // await test('Qwen/Qwen2.5-7B-Instruct', 256, 0.3, 30);
  
  // Test 3: Try another fast model on SiliconFlow
  // await test('deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', 512, 0.5, 60);
}

main();

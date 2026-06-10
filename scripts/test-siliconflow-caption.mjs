// Test SiliconFlow API with the actual caption prompt
const API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const API_KEY = 'sk-pencaimaptytbfxwgxhsysgrurvofgreblvgbcaxqtyfwxki';
const MODEL = 'Qwen/Qwen2.5-7B-Instruct';

const systemPrompt = `You are a professional video captioning AI specialized in e-commerce product videos for TikTok Shop. Your task is to provide a DENSE, highly detailed caption and relevant tags for the given video segment. The caption must be in English and describe the visual scene in rich detail.

Product Context:
- Product: Test Product (Electronics)
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

STRICT OUTPUT FORMAT (JSON only, no markdown fences, no explanatory text):
{"dense_caption":"string","tags":["string","string",...]}`;

const userPrompt = `Analyze the video segment from 0.0s to 3.0s (duration 3.0s) of the product "Test Product" and produce a dense visual caption with tags in the specified JSON format.`;

async function main() {
  console.log('=== Testing SiliconFlow API with Caption Prompt ===\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 0.9,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log(`Status: ${response.status}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);

    const data = await response.json();
    console.log('\n=== Raw API Response ===');
    console.log(JSON.stringify(data, null, 2));

    if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
      const content = data.choices[0].message.content;
      console.log('\n=== Message Content (raw) ===');
      console.log(content);
      console.log('\n=== Content Length ===');
      console.log(content.length);

      // Try parsing as JSON directly
      console.log('\n=== Parse Attempt 1: Direct JSON.parse ===');
      try {
        const parsed = JSON.parse(content.trim());
        console.log('SUCCESS:', JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log('FAILED:', e.message);
      }

      // Try extracting from markdown code block
      console.log('\n=== Parse Attempt 2: Markdown code block ===');
      const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        console.log('Found code block:', codeBlockMatch[1].trim());
        try {
          const parsed = JSON.parse(codeBlockMatch[1].trim());
          console.log('SUCCESS:', JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log('FAILED:', e.message);
        }
      } else {
        console.log('No code block found');
      }

      // Try finding any JSON object in the text
      console.log('\n=== Parse Attempt 3: Find JSON object ===');
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log('Found JSON candidate:', jsonMatch[0].substring(0, 200) + '...');
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          console.log('SUCCESS:', JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log('FAILED:', e.message);
        }
      } else {
        console.log('No JSON object found');
      }
    } else {
      console.log('\nERROR: No choices/content in response');
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.log('TIMEOUT: Request took more than 60s');
    } else {
      console.log('ERROR:', error.message);
    }
  }
}

main();

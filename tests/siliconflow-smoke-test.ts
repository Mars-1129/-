/**
 * SiliconFlow API 真实调用冒烟测试
 *
 * 测试硅基流动平台两个核心接口：
 * 1. TTS (CosyVoice2): 文本转语音
 * 2. Vision (Qwen2.5-VL): 多模态视觉理解
 *
 * 运行方式：
 *   cd apps/server-gateway && npx ts-node --compiler-options '{"module":"CommonJS"}' ../../tests/siliconflow-smoke-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// 直接读取 .env 文件，避免 dotenv 依赖问题
const envPath = path.resolve(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envMap: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  envMap[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
}

const API_KEY = envMap.SILICONFLOW_API_KEY || '';
const BASE_URL = 'https://api.siliconflow.cn/v1';

async function testTts() {
  console.log('\n========== 测试 1: TTS (CosyVoice2-0.5B) ==========');
  
  if (!API_KEY) {
    console.log('❌ SILICONFLOW_API_KEY 未设置，跳过 TTS 测试');
    return false;
  }

  try {
    const response = await fetch(`${BASE_URL}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'FunAudioLLM/CosyVoice2-0.5B',
        input: '欢迎使用 TikStream AI 视频创作平台！这是一段硅基流动语音合成测试。',
        voice: 'FunAudioLLM/CosyVoice2-0.5B:bella',
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`❌ TTS API 返回 HTTP ${response.status}: ${errText.substring(0, 200)}`);
      return false;
    }

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();
    
    if (contentType.includes('audio/') || arrayBuffer.byteLength > 100) {
      console.log(`✅ TTS 成功! 音频大小: ${(arrayBuffer.byteLength / 1024).toFixed(1)} KB, Content-Type: ${contentType}`);
      return true;
    }
    
    console.log(`⚠️ TTS 响应异常: byteLength=${arrayBuffer.byteLength}, contentType=${contentType}`);
    return false;
  } catch (error) {
    console.log(`❌ TTS 调用失败: ${(error as Error).message}`);
    return false;
  }
}

async function testVision() {
  console.log('\n========== 测试 2: Vision (Qwen2.5-VL-72B-Instruct) ==========');
  
  if (!API_KEY) {
    console.log('❌ SILICONFLOW_API_KEY 未设置，跳过 Vision 测试');
    return false;
  }

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen3-VL-32B-Instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'https://qianwen-res.oss-cn-beijing.aliyuncs.com/Qwen-VL/assets/demo.jpeg',
                },
              },
              {
                type: 'text',
                text: '请用 JSON 格式描述这张图片中的主要物体和场景。仅返回 JSON，不要额外文字。\n格式: {"objects": ["物体1", ...], "scene": "场景描述"}',
              },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`❌ Vision API 返回 HTTP ${response.status}: ${errText.substring(0, 200)}`);
      return false;
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      console.log(`✅ Vision 成功! 模型输出:\n${content.substring(0, 300)}`);
      // 尝试解析 JSON
      try {
        const json = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || content);
        console.log('✅ JSON 解析成功:', JSON.stringify(json, null, 2));
      } catch {
        console.log('⚠️ 无法解析为 JSON (可能是纯文本响应)');
      }
      return true;
    }
    
    console.log(`⚠️ Vision 响应无内容: ${JSON.stringify(data).substring(0, 200)}`);
    return false;
  } catch (error) {
    console.log(`❌ Vision 调用失败: ${(error as Error).message}`);
    return false;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  SiliconFlow API 冒烟测试                 ║');
  console.log('╚══════════════════════════════════════════╝');
  
  if (!API_KEY) {
    console.log('\n❌ 未找到 SILICONFLOW_API_KEY 环境变量');
    console.log('请确保 .env 文件中已设置 SILICONFLOW_API_KEY');
    process.exit(1);
  }

  console.log(`\nAPI Key: ${API_KEY.substring(0, 8)}...`);
  
  const ttsOk = await testTts();
  const visionOk = await testVision();
  
  console.log('\n========== 测试结果汇总 ==========');
  console.log(`  TTS (CosyVoice2):     ${ttsOk ? '✅ 通过' : '❌ 失败'}`);
  console.log(`  Vision (Qwen2.5-VL):  ${visionOk ? '✅ 通过' : '❌ 失败'}`);
  
  if (!ttsOk || !visionOk) {
    process.exit(1);
  }
}

main().catch(console.error);

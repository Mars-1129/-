import http from 'http';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CREATIONS = [
  { id: '5cf93fd7-43c7-4401-a3a9-792a8a8649c6', label: 'SCRIPT_DRIVEN' },
  { id: 'd40c8b40-0bdd-4805-a99b-1bb659d4c0ad', label: 'IMAGE_DRIVEN' },
  { id: '5dc10ad0-48d4-4a26-8740-85c4055277b5', label: 'PROMPT_DRIVEN' },
];

const OUTPUT_DIR = 'd:/字节/e2e_test_output';
const DEADLINE = Date.now() + 30 * 60 * 1000; // 30 minutes

function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 3000, path }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    }).on('error', e => reject(e));
  });
}

function downloadAndVerify(url, label, cid) {
  return new Promise(async (resolve) => {
    try {
      const fullUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`;
      console.log(`    [${label}] 下载视频: ${fullUrl}`);
      
      const res = await new Promise((resolve, reject) => {
        http.get(fullUrl, (response) => {
          // follow redirects
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            downloadAndVerify(response.headers.location, label, cid).then(resolve);
            return;
          }
          const chunks = [];
          response.on('data', c => chunks.push(c));
          response.on('end', () => resolve({ status: response.statusCode, data: Buffer.concat(chunks) }));
        }).on('error', reject);
      });
      
      if (res.status !== 200) {
        console.log(`    [${label}] 下载失败 HTTP ${res.status}`);
        resolve(false);
        return;
      }
      
      const buf = res.data;
      const sizeMB = (buf.length / 1024 / 1024).toFixed(2);
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      const outPath = path.join(OUTPUT_DIR, `${label}-${cid}.mp4`);
      fs.writeFileSync(outPath, buf);
      console.log(`    [${label}] 保存: ${outPath} (${sizeMB} MB)`);
      
      if (buf.length < 10 * 1024) {
        console.log(`    [${label}] ⚠️ 视频文件过小: ${buf.length} bytes`);
        resolve(false);
        return;
      }
      
      // ffprobe verify
      try {
        const probeOutput = execSync(
          `ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,width,height -of default=noprint_wrappers=1 "${outPath}"`,
          { encoding: 'utf8', timeout: 30000 }
        );
        const audioMatch = probeOutput.match(/codec_type=audio/);
        const hasAudio = !!audioMatch;
        const durMatch = probeOutput.match(/duration=([\d.]+)/);
        const duration = durMatch ? parseFloat(durMatch[1]).toFixed(1) + 's' : '?';
        const wMatch = probeOutput.match(/width=(\d+)/);
        const hMatch = probeOutput.match(/height=(\d+)/);
        const resolution = (wMatch && hMatch) ? `${wMatch[1]}x${hMatch[1]}` : '?';
        console.log(`    [${label}] ✅ ffprobe: duration=${duration}, audio=${hasAudio}, resolution=${resolution}`);
      } catch (e) {
        console.log(`    [${label}] ⚠️ ffprobe 不可用: ${e.message}`);
      }
      resolve(true);
    } catch (e) {
      console.log(`    [${label}] 下载异常: ${e.message}`);
      resolve(false);
    }
  });
}

async function main() {
  console.log('=== 并行监控三种模式创作任务 ===\n');
  console.log(`最多等待: 30分钟\n`);
  
  const finished = new Set();
  
  while (Date.now() < DEADLINE && finished.size < CREATIONS.length) {
    for (const c of CREATIONS) {
      if (finished.has(c.id)) continue;
      
      try {
        const { body } = await apiGet(`/api/v1/creations/${c.id}`);
        const d = body?.data || body;
        const elapsed = Math.round((Date.now() - (DEADLINE - 30*60*1000)) / 1000);
        
        if (d.status === 'FAILED') {
          console.log(`[${c.label}] ❌ 失败 (${elapsed}s): ${d.error_message || JSON.stringify(body).substring(0,200)}`);
          finished.add(c.id);
        } else if (d.status === 'FINISHED') {
          console.log(`\n[${c.label}] ✅ 视频生成完成! (${elapsed}s)`);
          console.log(`    video_url: ${d.video_url}`);
          console.log(`    file_size: ${((d.file_size_bytes || 0) / 1024 / 1024).toFixed(2)} MB`);
          
          if (d.video_url) {
            const ok = await downloadAndVerify(d.video_url, c.label, c.id);
            if (ok) console.log(`[${c.label}] 🎬 视频验证通过\n`);
            else console.log(`[${c.label}] ⚠️ 视频验证有问题\n`);
          }
          finished.add(c.id);
        } else if (d.status !== lastStatusMap.get(c.id)) {
          lastStatusMap.set(c.id, d.status);
          console.log(`[${c.label}] status=${d.status}, stage=${d.current_stage}, progress=${d.progress}% (${elapsed}s)`);
        }
      } catch (e) {
        // silently retry
      }
    }
    await new Promise(r => setTimeout(r, 8000));
  }
  
  if (finished.size < CREATIONS.length) {
    console.log(`\n超时: ${finished.size}/${CREATIONS.length} 完成`);
    for (const c of CREATIONS) {
      if (!finished.has(c.id)) console.log(`  ⏳ ${c.label}: ${c.id} 仍在处理中`);
    }
  }
  
  console.log('\n=== 监控结束 ===');
}

const lastStatusMap = new Map();
main().catch(e => console.error('Error:', e));

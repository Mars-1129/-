const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, 'apps', 'web-client', 'src', 'i18n', 'locales');
const BASELINE = 'zh-CN';
const OTHER_LOCALES = ['en-US', 'id-ID', 'th-TH', 'vi-VN', 'ja-JP', 'ko-KR'];
const OUTPUT_FILE = path.join(__dirname, 'analysis_output.txt');

// Collect all output lines, then write to file in one shot to avoid encoding issues
const outputLines = [];
function log(...args) {
  outputLines.push(args.join(' '));
}

// Read and parse all files
const files = {};
for (const locale of [BASELINE, ...OTHER_LOCALES]) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  files[locale] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Helper: recursively collect all key paths from a nested object
function collectKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...collectKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Helper: get value at a key path
function getValue(obj, keyPath) {
  const parts = keyPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

// Helper: find duplicate keys (section level only, not full path)
function findDuplicateKeys(obj) {
  const seen = {};
  const duplicates = [];
  for (const sectionKey of Object.keys(obj)) {
    if (seen[sectionKey]) {
      duplicates.push(sectionKey);
    } else {
      seen[sectionKey] = true;
    }
  }
  // Also check for duplicate full paths within each section
  for (const sectionKey of Object.keys(obj)) {
    const section = obj[sectionKey];
    if (typeof section === 'object' && section !== null) {
      const leafKeys = {};
      for (const [k, v] of Object.entries(section)) {
        if (typeof v === 'string' || typeof v === 'number' || v === null || Array.isArray(v)) {
          const fullPath = `${sectionKey}.${k}`;
          if (leafKeys[fullPath]) {
            duplicates.push(fullPath + ' (DUPLICATE in section)');
          } else {
            leafKeys[fullPath] = true;
          }
        }
      }
    }
  }
  return duplicates;
}

// Collect baseline keys
const baselineKeys = collectKeys(files[BASELINE]);
const baselineKeySet = new Set(baselineKeys);

// Results structure
const results = {};

for (const locale of OTHER_LOCALES) {
  log(`\n========================================`);
  log(`=== 分析语种: ${locale} ===`);
  log(`========================================\n`);

  const localeKeys = collectKeys(files[locale]);
  const localeKeySet = new Set(localeKeys);

  // (a) Missing keys
  const missingKeys = [];
  for (const key of baselineKeys) {
    if (!localeKeySet.has(key)) {
      missingKeys.push(key);
    }
  }

  // Group missing keys by section
  const missingBySection = {};
  for (const key of missingKeys) {
    const section = key.split('.')[0];
    if (!missingBySection[section]) missingBySection[section] = [];
    missingBySection[section].push(key);
  }

  // (b) Extra keys (in locale but not in baseline)
  const extraKeys = [];
  for (const key of localeKeys) {
    if (!baselineKeySet.has(key)) {
      extraKeys.push(key);
    }
  }

  const extraBySection = {};
  for (const key of extraKeys) {
    const section = key.split('.')[0];
    if (!extraBySection[section]) extraBySection[section] = [];
    extraBySection[section].push(key);
  }

  // (c) Duplicate keys
  const duplicates = findDuplicateKeys(files[locale]);

  // (d) Interpolation variable mismatches
  const interpolationRe = /\{\{(\w+)\}\}/g;
  const interpolationIssues = [];

  for (const key of baselineKeys) {
    const localeVal = getValue(files[locale], key);
    if (localeVal === undefined) continue; // already counted as missing

    const baselineVal = getValue(files[BASELINE], key);
    if (typeof baselineVal !== 'string' || typeof localeVal !== 'string') continue;

    const baselineMatch = baselineVal.match(/\{\{(\w+)\}\}/g);
    const localeMatch = localeVal.match(/\{\{(\w+)\}\}/g);

    if (baselineMatch === null && localeMatch === null) continue;
    if (baselineMatch === null && localeMatch !== null) {
      interpolationIssues.push(`${key}: zh-CN has no vars, but ${locale} has: ${localeMatch.join(', ')}`);
      continue;
    }
    if (localeMatch === null && baselineMatch !== null) {
      interpolationIssues.push(`${key}: zh-CN has ${baselineMatch.join(', ')}, but ${locale} has none`);
      continue;
    }

    // Compare vars
    const baselineVars = baselineMatch.map(m => m.replace(/[{}]/g, ''));
    const localeVars = localeMatch.map(m => m.replace(/[{}]/g, ''));
    const baselineVarsSorted = [...baselineVars].sort().join(',');
    const localeVarsSorted = [...localeVars].sort().join(',');

    if (baselineVarsSorted !== localeVarsSorted) {
      interpolationIssues.push(`${key}: zh-CN vars [${baselineVars.join(', ')}] !== ${locale} vars [${localeVars.join(', ')}]`);
    }
  }

  // (e) Empty values
  const emptyValues = [];
  for (const key of localeKeys) {
    const val = getValue(files[locale], key);
    if (val === '' || val === null) {
      emptyValues.push(key);
    }
  }

  // Output results
  log(`--- 基本统计 ---`);
  log(`zh-CN 总 key 数: ${baselineKeys.length}`);
  log(`${locale} 总 key 数: ${localeKeys.length}`);
  log(`缺失 key 数: ${missingKeys.length}`);
  log(`多余 key 数: ${extraKeys.length}`);
  log(`重复 key 数: ${duplicates.length}`);
  log(`插值变量不一致: ${interpolationIssues.length}`);
  log(`空值 key 数: ${emptyValues.length}`);

  if (missingKeys.length > 0) {
    log(`\n--- (a) 缺失的 Key (按模块分组) ---`);
    for (const [section, keys] of Object.entries(missingBySection)) {
      log(`\n  [${section}] (${keys.length} 个):`);
      for (const key of keys) {
        log(`    - ${key}`);
      }
    }
  } else {
    log(`\n--- (a) 缺失的 Key --- 无`);
  }

  if (extraKeys.length > 0) {
    log(`\n--- (b) 多余的 Key (zh-CN 中不存在) ---`);
    for (const [section, keys] of Object.entries(extraBySection)) {
      log(`\n  [${section}] (${keys.length} 个):`);
      for (const key of keys) {
        log(`    + ${key}`);
      }
    }
  } else {
    log(`\n--- (b) 多余的 Key --- 无`);
  }

  if (duplicates.length > 0) {
    log(`\n--- (c) 重复 Key ---`);
    for (const d of duplicates) {
      log(`  !! ${d}`);
    }
  } else {
    log(`\n--- (c) 重复 Key --- 无`);
  }

  if (interpolationIssues.length > 0) {
    log(`\n--- (d) 插值变量不一致 ---`);
    for (const issue of interpolationIssues) {
      log(`  ~ ${issue}`);
    }
  } else {
    log(`\n--- (d) 插值变量不一致 --- 无`);
  }

  if (emptyValues.length > 0) {
    log(`\n--- (e) 翻译值为空 ---`);
    for (const key of emptyValues) {
      log(`  > ${key}: 值为空`);
    }
  } else {
    log(`\n--- (e) 翻译值为空 --- 无`);
  }

  results[locale] = { missingKeys, extraKeys, duplicates, interpolationIssues, emptyValues };
}

// Final summary
log(`\n\n`);
log(`============================================`);
log(`============= 汇总统计 =====================`);
log(`============================================`);
log(`\n基准文件: zh-CN.json (${baselineKeys.length} 个 key)\n`);

log(`语种       | 总Key数 | 缺失 | 多余 | 重复 | 插值不一致 | 空值`);
log(`-----------|---------|------|------|------|----------|------`);
log(`zh-CN      | ${baselineKeys.length.toString().padStart(7)} | ${'—'.padStart(4)} | ${'—'.padStart(4)} | ${'—'.padStart(4)} | ${'—'.padStart(8)} | ${'—'.padStart(4)}`);

for (const locale of OTHER_LOCALES) {
  const r = results[locale];
  const totalKeys = collectKeys(files[locale]).length;
  log(`${locale.padEnd(10)} | ${totalKeys.toString().padStart(7)} | ${r.missingKeys.length.toString().padStart(4)} | ${r.extraKeys.length.toString().padStart(4)} | ${r.duplicates.length.toString().padStart(4)} | ${r.interpolationIssues.length.toString().padStart(8)} | ${r.emptyValues.length.toString().padStart(4)}`);
}

log(`\n=== 分析完成 ===`);

// Write output to file with UTF-8 encoding
fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf-8');
console.log('Output written to ' + OUTPUT_FILE);
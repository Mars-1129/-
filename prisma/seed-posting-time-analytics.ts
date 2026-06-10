/**
 * TikStream AI — 投放时段分析 Seed 数据 (大规模版)
 *
 * 为每个产品 × 平台 × 内容类型 × 天 × 时段，生成差异化的历史投放效果数据。
 * 不同产品/平台/时段的表现有真实方差，使 PostingTime 页面呈现丰富差异。
 *
 * 运行: npx tsx prisma/seed-posting-time-analytics.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ===========================================================================
// 时段覆盖 — 每2小时一个slot
// ===========================================================================
const HOUR_SLOTS = [
  '06-08', '08-10', '10-12', '12-14', '14-16', '16-18',
  '18-20', '20-22', '22-24',
];

const DAYS_OF_WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const PLATFORMS = [
  { platform: 'douyin', display: '抖音' },
  { platform: 'kuaishou', display: '快手' },
  { platform: 'tiktok_us', display: 'TikTok US' },
  { platform: 'xiaohongshu', display: '小红书' },
  { platform: 'wechat_channels', display: '视频号' },
];

const CONTENT_TYPES = [
  'product_review', 'tutorial', 'vlog', 'live_commerce', 'unboxing',
];

// ===========================================================================
// 品类×内容类型 → 基准指标 (模拟真实差异)
// ===========================================================================
type CategoryBaseline = Record<string, { eng: number; ctr: number; comp: number; conv: number; watch: number }>;

const CONTENT_TYPE_BASELINE: Record<string, CategoryBaseline> = {
  product_review: {
    beauty:     { eng: 0.068, ctr: 0.044, comp: 0.72, conv: 0.018, watch: 11.5 },
    electronics:{ eng: 0.055, ctr: 0.038, comp: 0.68, conv: 0.014, watch: 10.8 },
    fashion:    { eng: 0.072, ctr: 0.048, comp: 0.75, conv: 0.020, watch: 12.0 },
    food:       { eng: 0.080, ctr: 0.055, comp: 0.78, conv: 0.025, watch: 12.5 },
    home:       { eng: 0.050, ctr: 0.032, comp: 0.65, conv: 0.012, watch: 10.0 },
    health:     { eng: 0.062, ctr: 0.040, comp: 0.70, conv: 0.016, watch: 11.0 },
  },
  tutorial: {
    beauty:     { eng: 0.058, ctr: 0.032, comp: 0.68, conv: 0.012, watch: 10.5 },
    electronics:{ eng: 0.065, ctr: 0.042, comp: 0.72, conv: 0.016, watch: 11.5 },
    fashion:    { eng: 0.062, ctr: 0.035, comp: 0.70, conv: 0.014, watch: 11.0 },
    food:       { eng: 0.075, ctr: 0.048, comp: 0.76, conv: 0.020, watch: 12.0 },
    home:       { eng: 0.055, ctr: 0.030, comp: 0.66, conv: 0.010, watch: 10.0 },
    health:     { eng: 0.052, ctr: 0.028, comp: 0.64, conv: 0.010, watch: 9.5 },
  },
  vlog: {
    beauty:     { eng: 0.082, ctr: 0.052, comp: 0.78, conv: 0.022, watch: 12.8 },
    electronics:{ eng: 0.060, ctr: 0.035, comp: 0.66, conv: 0.012, watch: 10.2 },
    fashion:    { eng: 0.078, ctr: 0.050, comp: 0.76, conv: 0.020, watch: 12.5 },
    food:       { eng: 0.090, ctr: 0.058, comp: 0.82, conv: 0.028, watch: 13.2 },
    home:       { eng: 0.058, ctr: 0.035, comp: 0.68, conv: 0.014, watch: 10.8 },
    health:     { eng: 0.065, ctr: 0.040, comp: 0.72, conv: 0.016, watch: 11.5 },
  },
  live_commerce: {
    beauty:     { eng: 0.095, ctr: 0.068, comp: 0.82, conv: 0.035, watch: 13.5 },
    electronics:{ eng: 0.078, ctr: 0.058, comp: 0.75, conv: 0.028, watch: 12.5 },
    fashion:    { eng: 0.092, ctr: 0.065, comp: 0.80, conv: 0.032, watch: 13.2 },
    food:       { eng: 0.105, ctr: 0.078, comp: 0.85, conv: 0.042, watch: 14.0 },
    home:       { eng: 0.068, ctr: 0.045, comp: 0.68, conv: 0.018, watch: 11.0 },
    health:     { eng: 0.078, ctr: 0.055, comp: 0.74, conv: 0.025, watch: 12.0 },
  },
  unboxing: {
    beauty:     { eng: 0.075, ctr: 0.050, comp: 0.74, conv: 0.020, watch: 11.8 },
    electronics:{ eng: 0.082, ctr: 0.062, comp: 0.78, conv: 0.028, watch: 12.8 },
    fashion:    { eng: 0.068, ctr: 0.045, comp: 0.72, conv: 0.018, watch: 11.5 },
    food:       { eng: 0.072, ctr: 0.052, comp: 0.74, conv: 0.022, watch: 12.0 },
    home:       { eng: 0.060, ctr: 0.040, comp: 0.68, conv: 0.015, watch: 10.8 },
    health:     { eng: 0.058, ctr: 0.038, comp: 0.66, conv: 0.014, watch: 10.5 },
  },
};

// ===========================================================================
// 平台黄金时段效果乘数 (不同时段有不同表现)
// ===========================================================================
function platformTimeMultiplier(platform: string, hourSlot: string, dayOfWeek: string): number {
  const isWeekend = dayOfWeek === '周六' || dayOfWeek === '周日';
  const hour = parseInt(hourSlot.split('-')[0], 10);

  // 各平台黄金时段
  switch (platform) {
    case 'douyin':
      if ([18, 20, 22].includes(hour)) return isWeekend ? 1.25 : 1.15;
      if (hour === 12) return 1.08;
      if (hour === 6 || hour === 8) return isWeekend ? 1.05 : 1.02;
      return 0.75 + Math.random() * 0.2;
    case 'kuaishou':
      if ([10, 16, 18].includes(hour)) return isWeekend ? 1.20 : 1.12;
      if (hour === 6) return 1.10;
      return 0.70 + Math.random() * 0.2;
    case 'tiktok_us':
      if ([18, 20, 22].includes(hour)) return isWeekend ? 1.30 : 1.20;
      if (hour === 12 || hour === 14) return 1.08;
      if (hour === 6 || hour === 8) return isWeekend ? 0.85 : 1.02;
      return 0.72 + Math.random() * 0.2;
    case 'xiaohongshu':
      if ([12, 18, 20].includes(hour)) return isWeekend ? 1.22 : 1.18;
      if (hour === 8 || hour === 10) return isWeekend ? 1.10 : 1.05;
      return 0.78 + Math.random() * 0.15;
    case 'wechat_channels':
      if ([12, 18, 20].includes(hour)) return isWeekend ? 1.18 : 1.12;
      if (hour === 6 || hour === 8) return 1.05;
      return 0.72 + Math.random() * 0.2;
    default:
      return 0.80 + Math.random() * 0.25;
  }
}

// ===========================================================================
// 内容类型 × 时段 交互
// ===========================================================================
function contentTypeTimeBoost(contentType: string, hourSlot: string): number {
  const hour = parseInt(hourSlot.split('-')[0], 10);
  switch (contentType) {
    case 'product_review':
      return hour >= 18 ? 1.12 : hour >= 12 ? 1.05 : 0.95;
    case 'tutorial':
      return hour >= 8 && hour <= 14 ? 1.10 : hour >= 18 ? 1.02 : 0.90;
    case 'vlog':
      return hour >= 18 ? 1.18 : hour <= 10 ? 1.05 : 0.92;
    case 'live_commerce':
      return hour >= 18 ? 1.25 : hour >= 14 ? 1.10 : 0.85;
    case 'unboxing':
      return hour >= 16 ? 1.10 : hour >= 10 ? 1.05 : 0.95;
    default:
      return 1.0;
  }
}

// ===========================================================================
// 主函数
// ===========================================================================
async function main(): Promise<void> {
  console.log('📊 Seeding Posting Time Analytics (大规模版)...\n');

  // 获取所有产品
  const products = await prisma.product.findMany({ select: { id: true, category: true, title: true } });
  console.log(`  Products loaded: ${products.length}\n`);

  let created = 0;
  let skipped = 0;

  for (const product of products) {
    const category = (product.category || 'others').toLowerCase();
    let matchedCategory = 'health'; // fallback
    for (const key of Object.keys(CONTENT_TYPE_BASELINE.product_review || {})) {
      if (category.includes(key) || key.includes(category)) {
        matchedCategory = key;
        break;
      }
    }

    for (const pf of PLATFORMS) {
      for (const ct of CONTENT_TYPES) {
        const baseline = (CONTENT_TYPE_BASELINE[ct] as Record<string, { eng: number; ctr: number; comp: number; conv: number; watch: number }>)?.[matchedCategory]
          ?? { eng: 0.05, ctr: 0.03, comp: 0.65, conv: 0.012, watch: 10.0 };

        for (const day of DAYS_OF_WEEK) {
          for (const slot of HOUR_SLOTS) {
            const timeMult = platformTimeMultiplier(pf.platform, slot, day);
            const ctBoost = contentTypeTimeBoost(ct, slot);
            const noise = 0.85 + Math.random() * 0.30; // ±15% 随机噪声
            const combined = timeMult * ctBoost * noise;

            const eng = Math.round(baseline.eng * combined * 10000) / 10000;
            const ctr = Math.round(baseline.ctr * combined * 10000) / 10000;
            const comp = Math.min(0.95, Math.round(baseline.comp * combined * 10000) / 10000);
            const conv = Math.round(baseline.conv * combined * 10000) / 10000;
            const watch = Math.round(baseline.watch * combined * 10) / 10;
            const impressions = 500 + Math.floor(Math.random() * 4500);
            const videoCount = 3 + Math.floor(Math.random() * 12);

            await prisma.postingTimeAnalytics.create({
              data: {
                productId: product.id,
                platform: pf.platform,
                contentType: ct,
                dayOfWeek: day,
                hourSlot: slot,
                engagementRate: eng,
                ctr,
                completionRate: comp,
                conversionRate: conv,
                avgWatchTime: watch,
                impressions,
                videoCount,
              },
            });

            created++;
          }
        }
      }
    }

    if ((products.indexOf(product) + 1) % 3 === 0) {
      console.log(`  📦 ${product.title?.slice(0, 30)}... → ${created} records so far`);
    }
  }

  console.log(`\n📊 Done!`);
  console.log(`   Products: ${products.length}`);
  console.log(`   Platforms: ${PLATFORMS.length} × ContentTypes: ${CONTENT_TYPES.length}`);
  console.log(`   Days: ${DAYS_OF_WEEK.length} × Slots: ${HOUR_SLOTS.length}`);
  console.log(`   Total records: ${created}`);
  console.log(`   Skipped (existing): ${skipped}`);
  console.log('   Run: npx tsx prisma/seed-posting-time-analytics.ts');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });

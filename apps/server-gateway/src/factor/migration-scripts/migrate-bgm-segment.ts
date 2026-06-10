// =============================================================================
// TikStream AI — BGM Segment 数据迁移脚本
// =============================================================================
// 将现有 localFactorPatch.bgm_segment 数据迁移到新的 bgmSegment 独立列
// 同时也将 rawJson.shots[*].bgm_segment 迁移到新列
//
// 运行方式:
//   npx ts-node --project tsconfig.json src/factor/migration-scripts/migrate-bgm-segment.ts
// =============================================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface BgmSegment {
  style: string;
  energy_level: 'low' | 'mid' | 'high';
  beat_pattern: string;
}

async function migrateBgmSegments(): Promise<void> {
  console.log('[Migration] Starting BGM segment migration...');

  await prisma.$transaction(async (tx) => {
    // 1. 查找所有有 localFactorPatch.bgm_segment 但 bgmSegment 为空的分镜
    const shotsWithLocalBgm = await tx.$queryRaw<Array<{
      id: string;
      shot_index: number;
      script_id: string;
      local_factor_patch: string;
    }>>`
      SELECT id, shot_index, script_id, local_factor_patch::text
      FROM script_shots
      WHERE deleted_at IS NULL
        AND bgm_segment IS NULL
        AND local_factor_patch::jsonb ? 'bgm_segment'
    `;

    console.log(`[Migration] Found ${shotsWithLocalBgm.length} shots with BGM in localFactorPatch`);

    let updatedFromLocal = 0;
    for (const shot of shotsWithLocalBgm) {
      try {
        const patch = JSON.parse(shot.local_factor_patch);
        if (patch.bgm_segment && typeof patch.bgm_segment === 'object') {
          await tx.$executeRaw`
            UPDATE script_shots SET bgm_segment = ${JSON.stringify(patch.bgm_segment)}::jsonb WHERE id = ${shot.id}::uuid
          `;
          updatedFromLocal++;
        }
      } catch (err) {
        console.error(`[Migration] Failed to migrate shot ${shot.id}:`, err);
        throw err;
      }
    }
    console.log(`[Migration] Migrated ${updatedFromLocal} from localFactorPatch`);

    // 2. 查找 rawJson.shots 中有 bgm_segment 但 db 中 bgmSegment 仍为空的分镜
    const shotsWithRawBgm = await tx.$queryRaw<Array<{
      shot_id: string;
      shot_index: number;
      script_id: string;
      raw_json: string;
      bgm_segment_json: string;
    }>>`
      SELECT
        ss.id AS shot_id,
        ss.shot_index,
        ss.script_id,
        s.raw_json::text,
        COALESCE(ss.bgm_segment::text, 'null') AS bgm_segment_json
      FROM script_shots ss
      JOIN scripts s ON s.id = ss.script_id
      WHERE ss.deleted_at IS NULL
        AND ss.bgm_segment IS NULL
    `;

    let updatedFromRaw = 0;
    for (const shot of shotsWithRawBgm) {
      try {
        const raw = JSON.parse(shot.raw_json);
        const shotsArray = raw.shots as Array<Record<string, unknown>> | undefined;
        if (shotsArray && shotsArray[shot.shot_index - 1]) {
          const rawShot = shotsArray[shot.shot_index - 1];
          if (rawShot.bgm_segment && typeof rawShot.bgm_segment === 'object') {
            await tx.$executeRaw`
              UPDATE script_shots SET bgm_segment = ${JSON.stringify(rawShot.bgm_segment)}::jsonb WHERE id = ${shot.shot_id}::uuid
            `;
            updatedFromRaw++;
          }
        }
      } catch (err) {
        console.error(`[Migration] Failed to migrate shot from rawJson ${shot.shot_id}:`, err);
        throw err;
      }
    }
    console.log(`[Migration] Migrated ${updatedFromRaw} from rawJson.shots`);

    // 3. 统计迁移结果
    const totalWithBgm = await tx.$queryRaw<Array<{ count: string }>>`
      SELECT COUNT(*)::text FROM script_shots WHERE deleted_at IS NULL AND bgm_segment IS NOT NULL
    `;
    const totalShots = await tx.$queryRaw<Array<{ count: string }>>`
      SELECT COUNT(*)::text FROM script_shots WHERE deleted_at IS NULL
    `;

    console.log('[Migration] Summary:');
    console.log(`  - Total shots: ${totalShots[0]?.count || '0'}`);
    console.log(`  - Shots with bgmSegment: ${totalWithBgm[0]?.count || '0'}`);
    console.log(`  - Migrated from localFactorPatch: ${updatedFromLocal}`);
    console.log(`  - Migrated from rawJson: ${updatedFromRaw}`);
  });

  console.log('[Migration] Complete!');
}

migrateBgmSegments()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('[Migration] Fatal error:', err);
    prisma.$disconnect();
    process.exit(1);
  });

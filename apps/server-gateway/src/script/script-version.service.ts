// =============================================================================
// TikStream AI — Script Version Service
// 剧本历史版本管理：自动快照、列表、详情、回滚
// =============================================================================

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@nestjs/prisma';

const MAX_VERSIONS = 50;

interface ScriptShotSnapshot {
  shot_index: number;
  duration: number;
  scene_description_query: string;
  visual_description: string;
  camera_movement: string;
  transition_type: string;
  voiceover_text: string;
  subtitle_text: string;
  safe_zone_bounding_box: [number, number, number, number];
  selected_slice_id?: string;
  render_prompt?: string;
  local_factor_patch?: Record<string, unknown>;
  compliance_status?: string;
}

interface ScriptSnapshot {
  script: {
    title?: string;
    style_vibe: string;
    video_duration: number;
    language?: string;
    target_audience?: string;
    aspect_ratio?: string;
    constraint_list?: string[];
  };
  shots: ScriptShotSnapshot[];
}

@Injectable()
export class ScriptVersionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 保存当前剧本快照为版本
   * 在 ScriptService.save() 和 patch 成功后调用
   */
  async saveVersion(
    scriptId: string,
    triggerAction: 'MANUAL_SAVE' | 'PATCH_EDIT' | 'AI_REGENERATE' | 'ROLLBACK',
  ): Promise<void> {
    const script = await this.prisma.script.findUnique({
      where: { id: scriptId },
      include: { shots: { orderBy: { shotIndex: 'asc' } } },
    });
    if (!script) throw new NotFoundException('剧本不存在');

    // 获取下一个版本号
    const lastVersion = await this.prisma.scriptVersion.findFirst({
      where: { scriptId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;

    // 最多保留 MAX_VERSIONS 个版本，超出删除最旧的
    const totalVersions = await this.prisma.scriptVersion.count({
      where: { scriptId },
    });
    if (totalVersions >= MAX_VERSIONS) {
      const oldestVersions = await this.prisma.scriptVersion.findMany({
        where: { scriptId },
        orderBy: { createdAt: 'asc' },
        take: totalVersions - MAX_VERSIONS + 1,
        select: { id: true },
      });
      await this.prisma.scriptVersion.deleteMany({
        where: { id: { in: oldestVersions.map((v) => v.id) } },
      });
    }

    // 创建快照
    const snapshot = {
      script: {
        title: script.title,
        video_duration: Number(script.videoDuration),
        style_vibe: script.styleVibe,
        aspect_ratio: script.aspectRatio,
        language: script.language,
        target_audience: script.targetAudience,
        constraint_list: script.constraintList,
      },
      shots: script.shots.map((s) => ({
        shot_index: s.shotIndex,
        duration: Number(s.duration),
        scene_description_query: s.sceneDescriptionQuery,
        visual_description: s.visualDescription,
        camera_movement: s.cameraMovement,
        transition_type: s.transitionType,
        voiceover_text: s.voiceoverText,
        subtitle_text: s.subtitleText,
        safe_zone_bounding_box: s.safeZoneBoundingBox,
        selected_slice_id: s.selectedSliceId,
        render_prompt: s.renderPrompt,
        local_factor_patch: s.localFactorPatch ?? {},
        compliance_status: s.complianceStatus,
      })),
    };

    await this.prisma.scriptVersion.create({
      data: {
        scriptId,
        versionNumber: nextVersion,
        triggerAction,
        snapshot,
      },
    });
  }

  /**
   * 列出某剧本的所有版本（不含完整 snapshot）
   */
  async listVersions(scriptId: string, page: number = 1, pageSize: number = 20) {
    const script = await this.prisma.script.findUnique({ where: { id: scriptId } });
    if (!script) throw new NotFoundException('剧本不存在');

    const [items, total] = await Promise.all([
      this.prisma.scriptVersion.findMany({
        where: { scriptId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          versionNumber: true,
          triggerAction: true,
          createdAt: true,
        },
      }),
      this.prisma.scriptVersion.count({ where: { scriptId } }),
    ]);

    return {
      items: items.map((v) => ({
        version_id: v.id,
        version_number: v.versionNumber,
        trigger_action: v.triggerAction,
        created_at: v.createdAt.toISOString(),
      })),
      page,
      page_size: pageSize,
      total,
    };
  }

  /**
   * 获取某版本详情（含完整 snapshot）
   */
  async getVersion(scriptId: string, versionId: string) {
    const script = await this.prisma.script.findUnique({ where: { id: scriptId } });
    if (!script) throw new NotFoundException('剧本不存在');

    const version = await this.prisma.scriptVersion.findFirst({
      where: { id: versionId, scriptId },
    });
    if (!version) throw new NotFoundException('版本不存在');

    return {
      version_id: version.id,
      version_number: version.versionNumber,
      trigger_action: version.triggerAction,
      snapshot: version.snapshot,
      created_at: version.createdAt.toISOString(),
    };
  }

  /**
   * 回滚到指定版本
   */
  async rollback(scriptId: string, versionId: string) {
    const version = await this.getVersion(scriptId, versionId);
    const snapshot = version.snapshot as unknown as ScriptSnapshot;

    // 检查是否存在活跃的创作任务，避免回滚导致关联数据不一致
    const activeCreations = await this.prisma.creation.count({
      where: {
        scriptId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });
    if (activeCreations > 0) {
      throw new ConflictException(
        `存在 ${activeCreations} 个进行中的创作任务，无法回滚剧本。请先取消或等待任务完成。`,
      );
    }

    // 在事务外先保存当前版本的快照，确保即使事务失败也能追溯回滚前的状态
    await this.saveVersion(scriptId, 'ROLLBACK');

    await this.prisma.$transaction(async (tx) => {
      // 更新剧本字段
      await tx.script.update({
        where: { id: scriptId },
        data: {
          title: snapshot.script.title ?? null,
          videoDuration: snapshot.script.video_duration,
          styleVibe: snapshot.script.style_vibe,
          aspectRatio: snapshot.script.aspect_ratio as any,
          language: snapshot.script.language ?? 'zh-CN',
          targetAudience: snapshot.script.target_audience ?? null,
          constraintList: snapshot.script.constraint_list ?? [],
        },
      });

      // 软删除当前全部分镜，而非硬删除，避免破坏已有的 ShotRender/创作关联
      const now = new Date();
      await tx.scriptShot.updateMany({
        where: { scriptId, deletedAt: null },
        data: { deletedAt: now },
      });

      // 批量创建回滚目标版本的分镜
      if (snapshot.shots && snapshot.shots.length > 0) {
        await tx.scriptShot.createMany({
          data: snapshot.shots.map((s) => ({
            scriptId,
            shotIndex: s.shot_index,
            duration: s.duration,
            sceneDescriptionQuery: s.scene_description_query,
            visualDescription: s.visual_description,
            cameraMovement: s.camera_movement as any,
            transitionType: s.transition_type,
            voiceoverText: s.voiceover_text,
            subtitleText: s.subtitle_text,
            safeZoneBoundingBox: s.safe_zone_bounding_box,
            selectedSliceId: s.selected_slice_id ?? null,
            renderPrompt: s.render_prompt ?? null,
            localFactorPatch: s.local_factor_patch ?? {},
          })) as any,
        });
      }

      // 回滚后重置合规状态，确保下次访问触发重新检查
      await tx.script.update({
        where: { id: scriptId },
        data: {
          complianceStatus: 'NEEDS_REVIEW',
          lastComplianceCheck: null,
        } as any,
      });
    });
  }
}

// =============================================================================
// TikStream AI — Auto A/B Session Service
// 自动 A/B 多版本对比：批量生成变体剧本 → 创建创作任务 → 对比分析
// =============================================================================

import { Injectable, NotFoundException, Logger, HttpStatus } from '@nestjs/common';
import { PrismaService } from '@nestjs/prisma';
import { Prisma } from '@prisma/client';

interface CreateAutoAbDto {
  script_id: string;
  style_variants: Array<{ label: string; style_vibe: string }>;
}

@Injectable()
export class AutoAbService {
  private readonly logger = new Logger(AutoAbService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建自动 A/B 会话
   */
  async createSession(dto: CreateAutoAbDto) {
    const script = await this.prisma.script.findUnique({
      where: { id: dto.script_id },
    });
    if (!script) throw new NotFoundException('剧本不存在');

    const session = await this.prisma.autoAbSession.create({
      data: {
        baseScriptId: dto.script_id,
        status: 'PENDING',
        variantConfigs: dto.style_variants,
        progress: 0,
      },
    });

    this.logger.log(`A/B 会话已创建: ${session.id}, ${dto.style_variants.length} 个变体`);

    return {
      session_id: session.id,
      status: session.status,
      variant_count: dto.style_variants.length,
      created_at: session.createdAt.toISOString(),
    };
  }

  /**
   * 查询会话状态
   */
  async getSession(sessionId: string) {
    const session = await this.prisma.autoAbSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('A/B 会话不存在');

    return {
      session_id: session.id,
      base_script_id: session.baseScriptId,
      status: session.status,
      variant_configs: session.variantConfigs,
      variant_script_ids: session.variantScriptIds,
      variant_creation_ids: session.variantCreationIds,
      result_json: session.resultJson,
      progress: session.progress,
      created_at: session.createdAt.toISOString(),
      completed_at: session.completedAt?.toISOString() ?? null,
    };
  }

  /**
   * 列出用户的所有会话
   */
  async listSessions(scriptId?: string, page: number = 1, pageSize: number = 20) {
    // 注: Prisma client 中 AutoAbSession 模型尚未生成 WhereInput 类型,
    // 此处使用对象字面量类型提供基础的 baseScriptId 字段验证,
    // 待 prisma generate 后可直接替换为 Prisma.AutoAbSessionWhereInput
    const where: Record<string, unknown> = scriptId ? { baseScriptId: scriptId } : {};
    const [items, total] = await Promise.all([
      this.prisma.autoAbSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          baseScriptId: true,
          status: true,
          progress: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      this.prisma.autoAbSession.count({ where }),
    ]);

    return {
      items: items.map((s) => ({
        session_id: s.id,
        base_script_id: s.baseScriptId,
        status: s.status,
        progress: s.progress,
        created_at: s.createdAt.toISOString(),
        completed_at: s.completedAt?.toISOString() ?? null,
      })),
      page,
      page_size: pageSize,
      total,
    };
  }

  /**
   * 更新会话进度
   */
  async updateProgress(sessionId: string, progress: number, status: string) {
    await this.prisma.autoAbSession.update({
      where: { id: sessionId },
      data: { progress, status },
    });
  }

  /**
   * 完成会话并存储结果
   */
  async completeSession(sessionId: string, resultJson: Prisma.InputJsonValue) {
    await this.prisma.autoAbSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        resultJson,
        completedAt: new Date(),
      },
    });
  }

  /**
   * 标记会话失败
   */
  async failSession(sessionId: string, errorMessage: string) {
    await this.prisma.autoAbSession.update({
      where: { id: sessionId },
      data: {
        status: 'FAILED',
        resultJson: { error: errorMessage },
      },
    });
  }
}

// =============================================================================
// TikStream AI — Factor Repository
// =============================================================================

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { serviceException } from '../common/service-exception';
import { PrismaClient, Prisma, Factor, FactorCategory } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';
import { CreateFactorDto } from './dto/create-factor.dto';
import { UpdateFactorDto } from './dto/update-factor.dto';
import { FACTOR_CONSTANTS } from './factor.constants';

@Injectable()
export class FactorRepository {
  private readonly logger = new Logger(FactorRepository.name);

  constructor(@InjectPrisma() private prisma: PrismaClient) {}

  // ===========================================================================
  // Factor CRUD
  // ===========================================================================

  async findAll(category?: string, keyword?: string): Promise<Factor[]> {
    try {
      const where: Prisma.FactorWhereInput = {};

      if (category) {
        where.category = category as FactorCategory;
      }

      if (keyword) {
        where.OR = [
          { key: { contains: keyword, mode: 'insensitive' } },
          { name: { contains: keyword, mode: 'insensitive' } },
        ];
      }

      return await this.prisma.factor.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      this.logger.error(`Failed to find all factors: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findById(id: string): Promise<Factor | null> {
    try {
      return await this.prisma.factor.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Failed to find factor by id: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findByIds(ids: string[]): Promise<Factor[]> {
    try {
      return await this.prisma.factor.findMany({
        where: { id: { in: ids } },
      });
    } catch (error) {
      this.logger.error(`Failed to find factors by ids: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findByKey(key: string): Promise<Factor | null> {
    try {
      return await this.prisma.factor.findUnique({
        where: { key },
      });
    } catch (error) {
      this.logger.error(`Failed to find factor by key: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async create(data: CreateFactorDto): Promise<Factor> {
    try {
      return await this.prisma.factor.create({
        data: {
          key: data.key,
          name: data.name,
          category: data.category as FactorCategory,
          description: data.description ?? null,
          defaultValue: (data.default_value as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          valueSchema: (data.value_schema as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          sortOrder: data.sort_order ?? 0,
          isBuiltin: false,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create factor: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async update(id: string, data: UpdateFactorDto): Promise<Factor> {
    try {
      const updateData: Prisma.FactorUpdateInput = {};

      if (data.name !== undefined) {
        updateData.name = data.name;
      }
      if (data.category !== undefined) {
        updateData.category = data.category as FactorCategory;
      }
      if (data.description !== undefined) {
        updateData.description = data.description;
      }
      if (data.default_value !== undefined) {
        updateData.defaultValue = data.default_value as Prisma.InputJsonValue;
      }
      if (data.value_schema !== undefined) {
        updateData.valueSchema = data.value_schema as Prisma.InputJsonValue;
      }
      if (data.sort_order !== undefined) {
        updateData.sortOrder = data.sort_order;
      }

      return await this.prisma.factor.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(`Failed to update factor: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async delete(id: string): Promise<Factor> {
    try {
      return await this.prisma.factor.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Failed to delete factor: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  // ===========================================================================
  // Template-Factor Assignment
  // ===========================================================================

  async assignToTemplate(
    templateId: string,
    assignments: Array<{ factor_id: string; value: Record<string, unknown> }>,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // 事务内验证所有因子存在，消除竞态窗口
        const factorIds = assignments.map((a) => a.factor_id);
        const existingFactors = await tx.factor.findMany({
          where: { id: { in: factorIds } },
          select: { id: true },
        });
        const existingIds = new Set(existingFactors.map((f) => f.id));
        const missingIds = factorIds.filter((id) => !existingIds.has(id));
        if (missingIds.length > 0) {
          throw Object.assign(
            new Error(`以下因子不存在: ${missingIds.join(', ')}`),
            { code: 'FACTOR_NOT_FOUND' },
          );
        }

        // 删除该模板已有的所有因子分配
        await tx.templateFactor.deleteMany({
          where: { templateId },
        });

        // 批量创建新的因子分配
        if (assignments.length > 0) {
          await tx.templateFactor.createMany({
            data: assignments.map((item) => ({
              templateId,
              factorId: item.factor_id,
              value: item.value as Prisma.InputJsonValue,
            })),
          });
        }
      });
    } catch (error) {
      this.logger.error(`Failed to assign factors to template: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async getTemplateFactors(
    templateId: string,
  ): Promise<Array<{ templateId: string; factorId: string; value: unknown; factor: Factor }>> {
    try {
      return await this.prisma.templateFactor.findMany({
        where: { templateId },
        include: { factor: true },
        orderBy: { factor: { sortOrder: 'asc' } },
      });
    } catch (error) {
      this.logger.error(`Failed to get template factors: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  // ===========================================================================
  // Seed Built-in Factors
  // ===========================================================================

  async seedBuiltinFactors(): Promise<void> {
    try {
      const existingCount = await this.prisma.factor.count({
        where: { isBuiltin: true },
      });

      if (existingCount > 0) {
        this.logger.log(`Builtin factors already seeded (${existingCount} found), skipping.`);
        return;
      }

      this.logger.log('Seeding builtin factors...');

      const narrativeFactors: Array<{
        key: string;
        name: string;
        category: FactorCategory;
        description: string;
        defaultValue: Prisma.InputJsonValue;
        sortOrder: number;
      }> = FACTOR_CONSTANTS.BUILTIN_NARRATIVE_FACTOR_KEYS.map((key, index) => ({
        key,
        name: this.getNarrativeFactorName(key),
        category: 'NARRATIVE' as FactorCategory,
        description: this.getNarrativeFactorDescription(key),
        defaultValue: this.getNarrativeFactorDefault(key),
        sortOrder: index + 1,
      }));

      const parameterFactors: Array<{
        key: string;
        name: string;
        category: FactorCategory;
        description: string;
        defaultValue: Prisma.InputJsonValue;
        sortOrder: number;
      }> = FACTOR_CONSTANTS.BUILTIN_PARAMETER_FACTOR_KEYS.map((key, index) => ({
        key,
        name: this.getParameterFactorName(key),
        category: 'PARAMETER' as FactorCategory,
        description: this.getParameterFactorDescription(key),
        defaultValue: this.getParameterFactorDefault(key),
        sortOrder: 100 + index + 1,
      }));

      const instructionFactors: Array<{
        key: string;
        name: string;
        category: FactorCategory;
        description: string;
        defaultValue: Prisma.InputJsonValue;
        sortOrder: number;
      }> = FACTOR_CONSTANTS.BUILTIN_INSTRUCTION_FACTOR_KEYS.map((key, index) => ({
        key,
        name: this.getInstructionFactorName(key),
        category: 'INSTRUCTION' as FactorCategory,
        description: this.getInstructionFactorDescription(key),
        defaultValue: this.getInstructionFactorDefault(key),
        sortOrder: 200 + index + 1,
      }));

      const allFactors = [...narrativeFactors, ...parameterFactors, ...instructionFactors];

      await this.prisma.$transaction(async (tx) => {
        for (const f of allFactors) {
          await tx.factor.upsert({
            where: { key: f.key },
            create: { ...f, isBuiltin: true, valueSchema: Prisma.JsonNull },
            update: { name: f.name, category: f.category, description: f.description, defaultValue: f.defaultValue, sortOrder: f.sortOrder },
          });
        }
      });

      this.logger.log(`Seeded ${allFactors.length} builtin factors successfully.`);
    } catch (error) {
      this.logger.error(`Failed to seed builtin factors: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private getNarrativeFactorName(key: string): string {
    const names: Record<string, string> = {
      opening: '开场阶段',
      hook_body: '钩子主体阶段',
      product_showcase: '产品展示阶段',
      social_proof: '社交证明阶段',
      cta_closing: 'CTA 收尾阶段',
    };
    return names[key] ?? key;
  }

  private getNarrativeFactorDescription(key: string): string {
    const descriptions: Record<string, string> = {
      opening: '开场阶段的叙事风格与视觉呈现策略',
      hook_body: '钩子主体阶段的内容编排与节奏控制',
      product_showcase: '产品展示阶段的核心卖点呈现方式',
      social_proof: '社交证明阶段的信任建立与口碑传递',
      cta_closing: 'CTA 收尾阶段的转化引导与行动激励',
    };
    return descriptions[key] ?? '';
  }

  private getNarrativeFactorDefault(key: string): Prisma.InputJsonValue {
    const defaults: Record<string, Record<string, unknown>> = {
      opening: {
        music_style: 'soft',
        visual_style: 'minimal',
        pacing: 'moderate',
        text_overlay: 'product_name',
      },
      hook_body: {
        hook_mechanism: 'curiosity',
        emotional_tone: 'exciting',
        pacing: 'fast',
        transition: 'cut',
      },
      product_showcase: {
        visual_style: 'product_focused',
        pacing: 'slow',
        text_overlay: 'feature_highlight',
        transition: 'dissolve',
      },
      social_proof: {
        voiceover_tone: 'trustworthy',
        visual_style: 'testimonial',
        pacing: 'moderate',
        text_overlay: 'review_quote',
      },
      cta_closing: {
        hook_mechanism: 'urgency',
        emotional_tone: 'motivating',
        pacing: 'fast',
        text_overlay: 'cta_button',
      },
    };
    return (defaults[key] ?? {}) as Prisma.InputJsonValue;
  }

  private getParameterFactorName(key: string): string {
    const names: Record<string, string> = {
      optimal_shot_count: '最优镜头数',
      optimal_total_duration: '最优总时长',
      camera_patterns: '运镜模式',
      transition_preference: '转场偏好',
      bgm_style: '背景音乐风格',
      cta_placement: 'CTA 位置',
      hook_style: '钩子风格',
      narrative_tone: '叙事语调',
      caption_density: '字幕密度',
    };
    return names[key] ?? key;
  }

  private getParameterFactorDescription(key: string): string {
    const descriptions: Record<string, string> = {
      optimal_shot_count: '视频中推荐的镜头/片段数量',
      optimal_total_duration: '视频推荐的总体时长（秒）',
      camera_patterns: '推荐的运镜方式组合',
      transition_preference: '推荐的镜头间转场效果',
      bgm_style: '推荐的背景音乐风格分类',
      cta_placement: '行动号召在视频中的位置策略',
      hook_style: '开头钩子的风格类型',
      narrative_tone: '整体叙事的情感语调',
      caption_density: '字幕覆盖密度等级',
    };
    return descriptions[key] ?? '';
  }

  private getParameterFactorDefault(key: string): Prisma.InputJsonValue {
    const defaults: Record<string, Record<string, unknown>> = {
      optimal_shot_count: { min: 4, max: 8, default: 6 },
      optimal_total_duration: { min: 15, max: 60, default: 30 },
      camera_patterns: { preferred: ['static', 'dolly_in_fast', 'pan_left'], avoid: ['tilt_up'] },
      transition_preference: { preferred: 'dissolve', fallback: 'fade_in' },
      bgm_style: { genre: 'upbeat', tempo: 'medium', mood: 'energetic' },
      cta_placement: { position: 'end', delay_seconds: 2 },
      hook_style: { type: 'question', max_duration_seconds: 3 },
      narrative_tone: { primary: 'enthusiastic', secondary: 'informative' },
      caption_density: { level: 'medium', max_chars_per_second: 12 },
    };
    return (defaults[key] ?? {}) as Prisma.InputJsonValue;
  }

  private getInstructionFactorName(key: string): string {
    const names: Record<string, string> = {
      opening_instruction: '开场指令',
      closing_instruction: '退场指令',
      visual_focus_instruction: '画面重点',
      voiceover_tone_instruction: '旁白风格',
      bgm_atmosphere_instruction: 'BGM氛围',
      product_display_instruction: '产品展示角度',
      pacing_rhythm_instruction: '节奏控制',
      subtitle_style_instruction: '字幕风格',
      transition_style_instruction: '转场风格',
    };
    return names[key] ?? key;
  }

  private getInstructionFactorDescription(key: string): string {
    const descriptions: Record<string, string> = {
      opening_instruction: '开场阶段的指令描述，引导 AI 生成合适的开场效果',
      closing_instruction: '退场阶段的指令描述，引导 AI 生成合适的结束效果',
      visual_focus_instruction: '画面重点的指令描述，控制每个分镜的视觉聚焦方向',
      voiceover_tone_instruction: '旁白风格的指令描述，控制配音的语气和节奏',
      bgm_atmosphere_instruction: 'BGM 氛围的指令描述，控制背景音乐的整体氛围',
      product_display_instruction: '产品展示角度的指令描述，控制产品在画面中的展示方式',
      pacing_rhythm_instruction: '节奏控制的指令描述，控制分镜间的快慢节奏变化',
      subtitle_style_instruction: '字幕风格的指令描述，控制字幕的样式和动画效果',
      transition_style_instruction: '转场风格的指令描述，控制分镜间的转场效果',
    };
    return descriptions[key] ?? '';
  }

  private getInstructionFactorDefault(key: string): Prisma.InputJsonValue {
    const defaults: Record<string, Record<string, unknown>> = {
      opening_instruction: { instruction: '轻柔音乐引入，产品特写配合柔和光线，营造温和亲切的初印象' },
      closing_instruction: { instruction: '黑屏显示品牌名称，配合清脆音效，停留2秒后结束' },
      visual_focus_instruction: { instruction: '每个分镜聚焦单一产品卖点，避免画面信息过载，特写展示材质细节' },
      voiceover_tone_instruction: { instruction: '优雅知性的女声旁白，语速适中，重音落在产品卖点词上，保持自然对话感' },
      bgm_atmosphere_instruction: { instruction: '轻快电子音乐，开场渐入、高潮渐强、结尾渐弱，不压旁白人声' },
      product_display_instruction: { instruction: '多角度旋转展示：正面→侧面45°→背面→俯视特写，每个角度停留2秒' },
      pacing_rhythm_instruction: { instruction: '快慢交替节奏：开场快节奏2镜→展示慢节奏2镜→高潮快节奏1镜→收尾中速1镜' },
      subtitle_style_instruction: { instruction: '关键词高亮黄色字幕，卖点词加粗放大，每镜字幕不超过两行，位于安全区内' },
      transition_style_instruction: { instruction: '产品展示用溶解转场，卖点切换用闪白转场，场景切换用淡化转场' },
    };
    return (defaults[key] ?? {}) as Prisma.InputJsonValue;
  }

  // ===========================================================================
  // Error Mapping
  // ===========================================================================

  private mapPrismaError(error: unknown): never {
    if (error instanceof Error) {
      const prismaError = error as Error & { code?: string; meta?: Record<string, unknown> };

      switch (prismaError.code) {
        case 'P1001':
          throw serviceException(
            {
              message: '数据库连接失败',
              error: { code: 'INTERNAL_SERVER_ERROR', details: { prisma_code: prismaError.code }, retryable: true },
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        case 'P2002':
          throw serviceException(
            {
              message: FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_KEY_DUPLICATE,
              error: { code: 'FACTOR_KEY_DUPLICATE', details: { prisma_code: prismaError.code }, retryable: false },
            },
            HttpStatus.CONFLICT,
          );
        case 'P2003':
          throw serviceException(
            {
              message: '关联数据不存在',
              error: { code: 'FOREIGN_KEY_CONSTRAINT', details: { prisma_code: prismaError.code }, retryable: false },
            },
            HttpStatus.NOT_FOUND,
          );
        case 'P2025':
          throw serviceException(
            {
              message: FACTOR_CONSTANTS.ERROR_MESSAGES.FACTOR_NOT_FOUND,
              error: { code: 'FACTOR_NOT_FOUND', details: { prisma_code: prismaError.code }, retryable: false },
            },
            HttpStatus.NOT_FOUND,
          );
        case 'P1008':
          throw serviceException(
            {
              message: '数据库查询超时',
              error: { code: 'INTERNAL_SERVER_ERROR', details: { prisma_code: prismaError.code }, retryable: true },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        case 'P2024':
          throw serviceException(
            {
              message: '数据库连接池耗尽',
              error: { code: 'INTERNAL_SERVER_ERROR', details: { prisma_code: prismaError.code }, retryable: true },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        default:
          throw serviceException(
            {
              message: `数据库操作失败: ${prismaError.message}`,
              error: { code: 'INTERNAL_SERVER_ERROR', details: { prisma_code: prismaError.code, prisma_message: prismaError.message }, retryable: true },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
      }
    }
    throw serviceException(
      {
        message: '未知数据库错误',
        error: { code: 'INTERNAL_SERVER_ERROR', details: { original_error: String(error) }, retryable: true },
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

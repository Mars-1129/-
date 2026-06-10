// =============================================================================
// TikStream AI — Script Repository
// =============================================================================

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, Script as ScriptType } from '@tikstream/shared-types';
import { serviceException } from '../common/service-exception';
import { SCRIPT_CONSTANTS } from './script.constants';
import {
  AspectRatio,
  CameraMovement,
  ComplianceStatus,
  Prisma,
  PrismaClient,
  Script,
  ScriptGenerationMode,
  ScriptShot,
  Template,
  TransitionType,
  ViralVideoAnalysis,
} from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';

export interface CreateScriptParams {
  productId: string;
  title?: string;
  language: string;
  targetAudience?: string;
  videoDuration: number;
  aspectRatio: string;
  styleVibe: string;
  generationMode: string;
  constraintList: string[];
  preferences?: Array<{ type: string; text: string }>;
  rawJson: Record<string, unknown>;
  viralVideoId?: string;
  templateId?: string;
}

export interface CreateScriptShotParams {
  scriptId: string;
  shotIndex: number;
  duration: number;
  sceneDescriptionQuery: string;
  visualDescription: string;
  cameraMovement: string;
  transitionType: string;
  voiceoverText: string;
  subtitleText: string;
  safeZoneBoundingBox: [number, number, number, number];
  complianceStatus: string;
  localFactorPatch?: Record<string, unknown>;
}

export interface ScriptWithShots {
  script: Script;
  shots: ScriptShot[];
}

@Injectable()
export class ScriptRepository {
  private readonly logger = new Logger(ScriptRepository.name);

  constructor(@InjectPrisma() private prisma: PrismaClient) {}

  async createScript(params: CreateScriptParams): Promise<Script> {
    try {
      return await this.prisma.script.create({
        data: {
          productId: params.productId,
          title: params.title || null,
          language: params.language,
          targetAudience: params.targetAudience || null,
          videoDuration: params.videoDuration,
          aspectRatio: this.mapAspectRatio(params.aspectRatio),
          styleVibe: params.styleVibe,
          generationMode: this.mapGenerationMode(params.generationMode),
          constraintList: params.constraintList as Prisma.InputJsonValue,
          preferences: params.preferences ?? undefined,
          rawJson: params.rawJson as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create script: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async createScriptShots(shots: CreateScriptShotParams[]): Promise<void> {
    try {
      await this.prisma.scriptShot.createMany({
        data: shots.map((shot) => ({
          scriptId: shot.scriptId,
          shotIndex: shot.shotIndex,
          duration: shot.duration,
          sceneDescriptionQuery: shot.sceneDescriptionQuery,
          visualDescription: shot.visualDescription,
          cameraMovement: this.mapCameraMovement(shot.cameraMovement),
          transitionType: this.mapTransitionType(shot.transitionType),
          voiceoverText: shot.voiceoverText,
          subtitleText: shot.subtitleText,
          safeZoneBoundingBox: shot.safeZoneBoundingBox as Prisma.InputJsonValue,
          complianceStatus: this.mapComplianceStatus(shot.complianceStatus),
          localFactorPatch: (shot.localFactorPatch ?? {}) as Prisma.InputJsonValue,
        })),
      });
    } catch (error) {
      this.logger.error(`Failed to create script shots: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async createScriptWithShots(
    scriptParams: CreateScriptParams,
    shotsParams: CreateScriptShotParams[],
  ): Promise<Script> {
    return this.prisma.$transaction(async (tx) => {
      const script = await tx.script.create({
        data: {
          productId: scriptParams.productId,
          title: scriptParams.title || null,
          language: scriptParams.language,
          targetAudience: scriptParams.targetAudience || null,
          videoDuration: scriptParams.videoDuration,
          aspectRatio: this.mapAspectRatio(scriptParams.aspectRatio),
          styleVibe: scriptParams.styleVibe,
          generationMode: this.mapGenerationMode(scriptParams.generationMode),
          constraintList: scriptParams.constraintList as Prisma.InputJsonValue,
          preferences: scriptParams.preferences ?? undefined,
          rawJson: scriptParams.rawJson as Prisma.InputJsonValue,
          viralVideoId: scriptParams.viralVideoId || null,
          templateId: scriptParams.templateId || null,
        },
      });

      await tx.scriptShot.createMany({
        data: shotsParams.map((shot) => ({
          scriptId: script.id,
          shotIndex: shot.shotIndex,
          duration: shot.duration,
          sceneDescriptionQuery: shot.sceneDescriptionQuery,
          visualDescription: shot.visualDescription,
          cameraMovement: this.mapCameraMovement(shot.cameraMovement),
          transitionType: this.mapTransitionType(shot.transitionType),
          voiceoverText: shot.voiceoverText,
          subtitleText: shot.subtitleText,
          safeZoneBoundingBox: shot.safeZoneBoundingBox as Prisma.InputJsonValue,
          complianceStatus: this.mapComplianceStatus(shot.complianceStatus),
          localFactorPatch: (shot.localFactorPatch ?? {}) as Prisma.InputJsonValue,
        })),
      });

      return script;
    });
  }

  async findScriptById(scriptId: string): Promise<Script | null> {
    try {
      return await this.prisma.script.findUnique({
        where: { id: scriptId },
      });
    } catch (error) {
      this.logger.error(`Failed to find script by id: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findScriptWithShots(scriptId: string): Promise<ScriptWithShots | null> {
    try {
      const script = await this.prisma.script.findUnique({
        where: { id: scriptId },
        include: {
          shots: {
            orderBy: { shotIndex: 'asc' },
          },
        },
      });

      if (!script) {
        return null;
      }

      return {
        script,
        shots: script.shots,
      };
    } catch (error) {
      this.logger.error(`Failed to find script with shots: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findScriptsByProductId(productId: string, page: number, pageSize: number): Promise<ScriptWithShots[]> {
    try {
      const scripts = await this.prisma.script.findMany({
        where: { productId, deletedAt: null }, // 排除已删除的剧本
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          shots: {
            where: { deletedAt: null }, // 排除已删除的分镜
            orderBy: { shotIndex: 'asc' },
          },
        },
      });

      return scripts.map((script) => ({
        script,
        shots: script.shots,
      }));
    } catch (error) {
      this.logger.error(`Failed to find scripts by product id: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async countScriptsByProductId(productId: string): Promise<number> {
    try {
      return await this.prisma.script.count({
        where: { productId, deletedAt: null },
      });
    } catch (error) {
      this.logger.error(`Failed to count scripts: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async updateScriptWithShots(
    scriptId: string,
    scriptData: Partial<Script>,
    shotsData: Partial<ScriptShot>[],
  ): Promise<Script> {
    return this.prisma.$transaction(async (tx) => {
      if (shotsData.length > 0) {
        for (const shot of shotsData) {
          if (shot.id) {
            const { id: _id, ...data } = shot;
            await tx.scriptShot.update({
              where: { id: shot.id },
              data: data as Prisma.ScriptShotUncheckedUpdateInput,
            });
          }
        }
      }

      // 仅在有实际数据更新时才执行 update，避免空 data 无谓调用
      if (Object.keys(scriptData).length > 0) {
        return tx.script.update({
          where: { id: scriptId },
          data: scriptData as Prisma.ScriptUncheckedUpdateInput,
        });
      }
      return tx.script.findUniqueOrThrow({ where: { id: scriptId } });
    });
  }

  async syncScriptWithShots(
    scriptId: string,
    scriptData: Partial<Script>,
    shotsData: Partial<ScriptShot>[],
  ): Promise<Script> {
    return this.prisma.$transaction(async (tx) => {
      await tx.scriptShot.deleteMany({
        where: { scriptId },
      });

      if (shotsData.length > 0) {
        await tx.scriptShot.createMany({
          data: shotsData.map((shot) => {
            const data: Prisma.ScriptShotCreateManyInput = {
              scriptId,
              shotIndex: shot.shotIndex!,
              duration: shot.duration as Prisma.Decimal | number,
              sceneDescriptionQuery: shot.sceneDescriptionQuery!,
              visualDescription: shot.visualDescription!,
              cameraMovement: this.mapCameraMovement(String(shot.cameraMovement)),
              transitionType: this.mapTransitionType(String(shot.transitionType)),
              voiceoverText: shot.voiceoverText!,
              subtitleText: shot.subtitleText!,
              safeZoneBoundingBox: shot.safeZoneBoundingBox as Prisma.InputJsonValue,
              selectedSliceId: shot.selectedSliceId ?? null,
              renderPrompt: shot.renderPrompt ?? null,
              localFactorPatch: (shot.localFactorPatch ?? {}) as Prisma.InputJsonValue,
              complianceStatus: this.mapComplianceStatus(String(shot.complianceStatus ?? 'PASSED')),
            };

            if (shot.id) {
              data.id = shot.id;
            }

            if (shot.shotId) {
              data.shotId = shot.shotId;
            }

            return data;
          }),
        });
      }

      return tx.script.update({
        where: { id: scriptId },
        data: scriptData as Prisma.ScriptUncheckedUpdateInput,
      });
    });
  }

  async deleteScript(scriptId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.scriptShot.deleteMany({
          where: { scriptId },
        });
        await tx.script.delete({
          where: { id: scriptId },
        });
      });
    } catch (error) {
      this.logger.error(`Failed to delete script: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async existsByProductId(productId: string): Promise<boolean> {
    try {
      const count = await this.prisma.script.count({
        where: { productId },
      });
      return count > 0;
    } catch (error) {
      this.logger.error(`Failed to check script existence: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findViralVideoAnalysis(viralVideoId: string): Promise<ViralVideoAnalysis | null> {
    try {
      return await this.prisma.viralVideoAnalysis.findUnique({
        where: { id: viralVideoId },
      });
    } catch (error) {
      this.logger.error(`Failed to find viral video analysis: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findAllViralVideoAnalyses(): Promise<ViralVideoAnalysis[]> {
    try {
      return await this.prisma.viralVideoAnalysis.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(`Failed to find viral video analyses: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  async findTemplateById(templateId: string): Promise<Template | null> {
    try {
      return await this.prisma.template.findUnique({
        where: { id: templateId },
      });
    } catch (error) {
      this.logger.error(`Failed to find template by id: ${error}`);
      throw this.mapPrismaError(error);
    }
  }

  private mapAspectRatio(aspectRatio: string): AspectRatio {
    if (aspectRatio === '16:9' || aspectRatio === 'SIXTEEN_NINE') {
      return AspectRatio.SIXTEEN_NINE;
    }
    return AspectRatio.NINE_SIXTEEN;
  }

  private mapGenerationMode(generationMode: string): ScriptGenerationMode {
    const modeMap: Record<string, ScriptGenerationMode> = {
      'BATCH': ScriptGenerationMode.BATCH,
      'COMPOSED': ScriptGenerationMode.COMPOSED,
      'HYBRID': ScriptGenerationMode.HYBRID,
      'PROMPT_DRIVEN': ScriptGenerationMode.PROMPT_DRIVEN,
      'VIRAL_REWRITE': ScriptGenerationMode.VIRAL_REWRITE,
      'TEMPLATE_DRIVEN': ScriptGenerationMode.TEMPLATE_DRIVEN,
    };
    return modeMap[generationMode] ?? ScriptGenerationMode.PROMPT_DRIVEN;
  }

  private mapCameraMovement(cameraMovement: string): CameraMovement {
    if (Object.values(CameraMovement).includes(cameraMovement as CameraMovement)) {
      return cameraMovement as CameraMovement;
    }
    return CameraMovement.Static;
  }

  private mapTransitionType(transitionType: string): TransitionType {
    if (Object.values(TransitionType).includes(transitionType as TransitionType)) {
      return transitionType as TransitionType;
    }
    return TransitionType.None;
  }

  private mapComplianceStatus(complianceStatus: string): ComplianceStatus {
    if (Object.values(ComplianceStatus).includes(complianceStatus as ComplianceStatus)) {
      return complianceStatus as ComplianceStatus;
    }
    return ComplianceStatus.PENDING;
  }

  private mapPrismaError(error: unknown): never {
    if (error instanceof Error) {
      const prismaError = error as Error & { code?: string };

      switch (prismaError.code) {
        case 'P1001':
        case 'P1017':
          throw serviceException(
            {
              message: '数据库连接不可用，请稍后重试',
              error: {
                code: 'DATABASE_UNAVAILABLE',
                details: { prisma_code: prismaError.code },
                retryable: true,
              },
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        case 'P2003':
          throw serviceException(
            {
              message: SCRIPT_CONSTANTS.ERROR_MESSAGES.PRODUCT_NOT_FOUND,
              error: {
                code: ErrorCode.PRODUCT_NOT_FOUND,
                details: { prisma_code: prismaError.code },
                retryable: false,
              },
            },
            HttpStatus.NOT_FOUND,
          );
        case 'P2025':
          throw serviceException(
            {
              message: SCRIPT_CONSTANTS.ERROR_MESSAGES.SCRIPT_NOT_FOUND,
              error: {
                code: ErrorCode.SCRIPT_NOT_FOUND,
                details: { prisma_code: prismaError.code },
                retryable: false,
              },
            },
            HttpStatus.NOT_FOUND,
          );
        case 'P2002':
          throw serviceException(
            {
              message: '数据唯一约束冲突',
              error: {
                code: 'CONFLICT',
                details: { prisma_code: prismaError.code },
                retryable: false,
              },
            },
            HttpStatus.CONFLICT,
          );
        default:
          throw serviceException(
            {
              message: SCRIPT_CONSTANTS.ERROR_MESSAGES.INTERNAL_ERROR,
              error: {
                code: ErrorCode.INTERNAL_SERVER_ERROR,
                details: { prisma_code: prismaError.code, prisma_message: prismaError.message },
                retryable: true,
              },
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
      }
    }

    throw serviceException(
      {
        message: SCRIPT_CONSTANTS.ERROR_MESSAGES.INTERNAL_ERROR,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          details: { original_error: String(error) },
          retryable: true,
        },
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  // ========== 回收站功能 ==========

  async softDeleteScript(scriptId: string): Promise<void> {
    const existing = await this.prisma.script.findFirst({
      where: { id: scriptId, deletedAt: null },
    });
    if (!existing) {
      throw serviceException(
        {
          message: SCRIPT_CONSTANTS.ERROR_MESSAGES.SCRIPT_NOT_FOUND,
          error: {
            code: ErrorCode.SCRIPT_NOT_FOUND,
            retryable: false,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.scriptShot.updateMany({
        where: { scriptId },
        data: { deletedAt: now },
      });
      await tx.script.update({
        where: { id: scriptId },
        data: { deletedAt: now },
      });
    });
  }

  async findTrashScriptsByProduct(
    productId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items: ScriptType[];
    total: number;
    has_more: boolean;
  }> {
    const skip = (page - 1) * pageSize;
    const take = pageSize + 1;

    const [scripts, total] = await Promise.all([
      this.prisma.script.findMany({
        where: { productId, deletedAt: { not: null } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          shots: {
            where: { deletedAt: { not: null } },
            orderBy: { shotIndex: 'asc' },
          },
        },
      }),
      this.prisma.script.count({
        where: { productId, deletedAt: { not: null } },
      }),
    ]);

    const items = scripts.map((script) => ({
      script_id: script.id,
      product_id: script.productId,
      title: script.title ?? undefined,
      language: script.language ?? 'zh-CN',
      target_audience: script.targetAudience ?? undefined,
      video_duration: Number(script.videoDuration),
      aspect_ratio: script.aspectRatio as AspectRatio,
      style_vibe: script.styleVibe,
      generation_mode: script.generationMode as ScriptGenerationMode,
      template_id: script.templateId ?? undefined,
      viral_video_id: script.viralVideoId ?? undefined,
      constraint_list: (script.constraintList ?? []) as string[],
      raw_json: script.rawJson as Record<string, unknown>,
      created_at: script.createdAt.toISOString(),
      updated_at: script.updatedAt.toISOString(),
      shots: script.shots.map((shot) => ({
        id: shot.id,
        shot_id: shot.shotId ?? undefined,
        shot_index: shot.shotIndex,
        duration: Number(shot.duration),
        scene_description_query: shot.sceneDescriptionQuery,
        visual_description: shot.visualDescription,
        camera_movement: shot.cameraMovement as CameraMovement,
        transition_type: shot.transitionType as TransitionType,
        voiceover_text: shot.voiceoverText,
        subtitle_text: shot.subtitleText,
        safe_zone_bounding_box: (shot.safeZoneBoundingBox ?? [0, 0, 1080, 1920]) as [number, number, number, number],
        selected_slice_id: shot.selectedSliceId ?? undefined,
        render_prompt: shot.renderPrompt ?? undefined,
        local_factor_patch: (shot.localFactorPatch ?? {}) as Record<string, unknown>,
        compliance_status: shot.complianceStatus as ComplianceStatus,
        created_at: shot.createdAt.toISOString(),
        updated_at: shot.updatedAt.toISOString(),
      })),
    }));
    const hasMore = items.length > pageSize;
    if (hasMore) {
      items.pop();
    }

    return {
      // 映射后的 items 缺少 shared-types Script 中的 narrative_framework/visual_style/applied_constraints 等 API 层可选字段，
      // 因为 Prisma 模型中不包含这些列，映射结果与 ScriptType 结构兼容但 TS 无法推断
      items: items as unknown as ScriptType[],
      total,
      has_more: hasMore,
    };
  }

  async restoreScript(scriptId: string): Promise<boolean> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.scriptShot.updateMany({
        where: { scriptId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      return tx.script.update({
        where: { id: scriptId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
    });
    return result !== null;
  }

  async permanentDeleteScript(scriptId: string): Promise<boolean> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.shotRender.deleteMany({
        where: { scriptShot: { scriptId } },
      });
      await tx.scriptShot.deleteMany({
        where: { scriptId },
      });
      return tx.script.delete({
        where: { id: scriptId },
      });
    });
    return result !== null;
  }

  private mapScriptToApiType(script: {
    id: string;
    productId: string;
    title: string | null;
    language: string | null;
    targetAudience: string | null;
    videoDuration: unknown;
    aspectRatio: string;
    styleVibe: string;
    generationMode: string;
    templateId: string | null;
    viralVideoId: string | null;
    constraintList: unknown;
    rawJson: unknown;
    createdAt: Date;
    updatedAt: Date;
    shots: Array<{
      id: string;
      shotId: string | null;
      shotIndex: number;
      duration: unknown;
      sceneDescriptionQuery: string;
      visualDescription: string;
      cameraMovement: string;
      transitionType: string;
      voiceoverText: string;
      subtitleText: string;
      safeZoneBoundingBox: unknown;
      selectedSliceId: string | null;
      renderPrompt: string | null;
      localFactorPatch: unknown;
      complianceStatus: string;
    }>;
  }): Record<string, unknown> {
    return {
      script_id: script.id,
      product_id: script.productId,
      title: script.title,
      language: script.language,
      target_audience: script.targetAudience,
      video_duration: Number(script.videoDuration),
      aspect_ratio: script.aspectRatio,
      style_vibe: script.styleVibe,
      generation_mode: script.generationMode,
      constraint_list: script.constraintList,
      raw_json: script.rawJson,
      created_at: script.createdAt.toISOString(),
      updated_at: script.updatedAt.toISOString(),
      shots: script.shots.map((shot) => ({
        id: shot.id,
        shot_id: shot.shotId,
        shot_index: shot.shotIndex,
        duration: Number(shot.duration),
        scene_description_query: shot.sceneDescriptionQuery,
        visual_description: shot.visualDescription,
        camera_movement: shot.cameraMovement,
        transition_type: shot.transitionType,
        voiceover_text: shot.voiceoverText,
        subtitle_text: shot.subtitleText,
        safe_zone_bounding_box: shot.safeZoneBoundingBox,
        selected_slice_id: shot.selectedSliceId,
        render_prompt: shot.renderPrompt,
        local_factor_patch: shot.localFactorPatch,
        compliance_status: shot.complianceStatus,
      })),
    };
  }
}

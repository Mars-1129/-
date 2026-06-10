// =============================================================================
// TikStream AI — Creation Template Service
// 创作模板一键复用：保存创建参数为模板、列表、删除、加载
// =============================================================================

import { Injectable, Logger, HttpStatus, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@nestjs/prisma';
import { serviceException } from '../common/service-exception';

interface CreationTemplatePreset {
  target_resolution: string;
  export_format: string;
  engine_mode: string;
  prefer_ai_video?: boolean;
}

@Injectable()
export class CreationTemplateService {
  private readonly logger = new Logger(CreationTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 保存创作参数为模板
   */
  async saveAsTemplate(creationId: string, name: string, productId?: string) {
    const creation = await this.prisma.creation.findUnique({
      where: { id: creationId },
    });
    if (!creation) {
      throw serviceException(
        {
          message: `创作任务 ${creationId} 不存在`,
          error: { code: 'CREATION_NOT_FOUND', retryable: false },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (productId && creation.productId !== productId) {
      throw serviceException(
        {
          message: '创作任务不属于指定商品',
          error: { code: 'FORBIDDEN_CROSS_PRODUCT', retryable: false },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const presetJson: CreationTemplatePreset = {
      target_resolution: creation.targetResolution ?? '1080x1920',
      export_format: creation.exportFormat ?? 'MP4',
      engine_mode: creation.engineMode ?? 'SCRIPT_DRIVEN',
      prefer_ai_video: creation.preferAiVideo ?? false,
    };

    const template = await this.prisma.creationTemplate.create({
      data: {
        name,
        productId: creation.productId,
        scriptId: creation.scriptId,
        presetJson: presetJson as never,
      },
    });

    return {
      template_id: template.id,
      name: template.name,
      product_id: template.productId,
      script_id: template.scriptId,
      preset_json: template.presetJson,
      created_at: template.createdAt.toISOString(),
    };
  }

  /**
   * 模板列表（按商品的）
   */
  async listTemplates(productId?: string, page: number = 1, pageSize: number = 20) {
    const where = productId ? { productId } : {};
    const [items, total] = await Promise.all([
      this.prisma.creationTemplate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.creationTemplate.count({ where }),
    ]);

    return {
      items: items.map((t) => ({
        template_id: t.id,
        name: t.name,
        product_id: t.productId,
        script_id: t.scriptId,
        preset_json: t.presetJson,
        created_at: t.createdAt.toISOString(),
      })),
      page,
      page_size: pageSize,
      total,
    };
  }

  /**
   * 删除模板
   */
  async deleteTemplate(templateId: string) {
    const template = await this.prisma.creationTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) throw new NotFoundException('模板不存在');

    await this.prisma.creationTemplate.delete({ where: { id: templateId } });
    return { template_id: templateId, deleted: true };
  }

  /**
   * 获取模板详情
   */
  async getTemplate(templateId: string) {
    const template = await this.prisma.creationTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) throw new NotFoundException('模板不存在');

    return {
      template_id: template.id,
      name: template.name,
      product_id: template.productId,
      script_id: template.scriptId,
      preset_json: template.presetJson,
      created_at: template.createdAt.toISOString(),
    };
  }
}

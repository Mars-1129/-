// =============================================================================
// TikStream AI — Prompt Template Management Service
// 管理 LLM Prompt 模板的版本化存储
// =============================================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@nestjs/prisma';

@Injectable()
export class PromptTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async listTemplates(page: number = 1, pageSize: number = 20) {
    const [items, total] = await Promise.all([
      this.prisma.promptTemplate.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      }),
      this.prisma.promptTemplate.count(),
    ]);
    return {
      items: items.map((t) => ({
        template_id: t.id,
        name: t.name,
        description: t.description,
        is_active: t.isActive,
        latest_version: t.versions[0]?.versionNumber ?? null,
        created_at: t.createdAt.toISOString(),
        updated_at: t.updatedAt.toISOString(),
      })),
      page,
      page_size: pageSize,
      total,
    };
  }

  async createTemplate(name: string, description?: string, systemPrompt?: string, userPrompt?: string) {
    const template = await this.prisma.promptTemplate.create({
      data: {
        name,
        description: description ?? null,
        versions: {
          create: {
            versionNumber: 1,
            systemPrompt: systemPrompt ?? '',
            userPrompt: userPrompt ?? '',
          },
        },
      },
      include: { versions: true },
    });
    return {
      template_id: template.id,
      name: template.name,
      version_number: 1,
      created_at: template.createdAt.toISOString(),
    };
  }

  async getTemplate(templateId: string) {
    const template = await this.prisma.promptTemplate.findUnique({
      where: { id: templateId },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    if (!template) throw new NotFoundException('Prompt 模板不存在');
    return {
      template_id: template.id,
      name: template.name,
      description: template.description,
      is_active: template.isActive,
      versions: template.versions.map((v) => ({
        version_id: v.id,
        version_number: v.versionNumber,
        system_prompt: v.systemPrompt,
        user_prompt: v.userPrompt,
        created_at: v.createdAt.toISOString(),
      })),
      created_at: template.createdAt.toISOString(),
      updated_at: template.updatedAt.toISOString(),
    };
  }

  async addVersion(templateId: string, systemPrompt: string, userPrompt: string) {
    const template = await this.prisma.promptTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException('Prompt 模板不存在');

    const lastVer = await this.prisma.promptTemplateVersion.findFirst({
      where: { templateId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const nextVer = (lastVer?.versionNumber ?? 0) + 1;

    const version = await this.prisma.promptTemplateVersion.create({
      data: {
        templateId,
        versionNumber: nextVer,
        systemPrompt,
        userPrompt,
      },
    });

    await this.prisma.promptTemplate.update({
      where: { id: templateId },
      data: { updatedAt: new Date() },
    });

    return {
      version_id: version.id,
      version_number: version.versionNumber,
      created_at: version.createdAt.toISOString(),
    };
  }

  async getActiveSystemPrompt(templateName: string): Promise<string> {
    const template = await this.prisma.promptTemplate.findFirst({
      where: { name: templateName, isActive: true },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!template || template.versions.length === 0) return '';
    return template.versions[0].systemPrompt;
  }

  async getActiveUserPrompt(templateName: string): Promise<string> {
    const template = await this.prisma.promptTemplate.findFirst({
      where: { name: templateName, isActive: true },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!template || template.versions.length === 0) return '';
    return template.versions[0].userPrompt;
  }

  async toggleActive(templateId: string, isActive: boolean) {
    await this.prisma.promptTemplate.update({
      where: { id: templateId },
      data: { isActive },
    });
    return { template_id: templateId, is_active: isActive };
  }
}

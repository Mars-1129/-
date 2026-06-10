// =============================================================================
// TikStream AI — Viral DNA Repository
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { InjectPrisma } from '@nestjs/prisma';
import type { PrismaClient, DnaPattern, Prisma } from '@prisma/client';
import type { ViralDNA } from '@tikstream/shared-types';

@Injectable()
export class ViralDnaRepository {
  private readonly logger = new Logger(ViralDnaRepository.name);

  constructor(@InjectPrisma() private readonly prisma: PrismaClient) {}

  /**
   * 持久化一条 DNA 模式记录
   */
  async create(params: {
    productCategory: string;
    market: string;
    dnaJson: Record<string, unknown>;
    sampleCount: number;
    confidence: number;
  }): Promise<DnaPattern> {
    return this.prisma.dnaPattern.create({ data: { ...params, dnaJson: params.dnaJson as Prisma.InputJsonValue } });
  }

  /**
   * 按商品类目 + 市场查询 DNA 模式（按置信度降序）
   */
  async findByCategory(category: string, market = 'GLOBAL'): Promise<DnaPattern[]> {
    return this.prisma.dnaPattern.findMany({
      where: { productCategory: category, market },
      orderBy: { confidence: 'desc' },
    });
  }

  /**
   * 按 ID 查询单条 DNA
   */
  async findById(id: string): Promise<DnaPattern | null> {
    return this.prisma.dnaPattern.findUnique({ where: { id } });
  }

  /**
   * 查询全部 DNA 模式（按创建时间倒序）
   */
  async findAll(): Promise<DnaPattern[]> {
    return this.prisma.dnaPattern.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 返回 DB 中持久化的记录数
   */
  async count(): Promise<number> {
    return this.prisma.dnaPattern.count();
  }

  /**
   * 删除指定类目 + 市场的全部 DNA 模式（extract 前清除旧数据）
   */
  async deleteByCategory(category: string, market = 'GLOBAL'): Promise<number> {
    const r = await this.prisma.dnaPattern.deleteMany({
      where: { productCategory: category, market },
    });
    if (r.count > 0) {
      this.logger.log(`已清除 ${r.count} 条旧 DNA: category=${category}, market=${market}`);
    }
    return r.count;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { InjectPrisma } from '@nestjs/prisma';

// =============================================================================
// Minimal type-safe Prisma proxy for tables not yet in generated client
// Fixes CQ-1: replaces (this.prisma as any) with well-typed minimal interface
// =============================================================================

interface CommentRow {
  id: string;
  productId: string;
  platform: string;
  externalId: string;
  content: string;
  likeCount: number;
  replyCount: number;
  createdAt: Date;
}

interface AnalysisRow {
  id: string;
  commentId: string;
  sentiment: string;
  keyTopics: string[];
  painPoints: string[];
  featureRequests: string[];
  purchasingIntent: number;
  confidence: number;
  rawAnalysis?: Record<string, unknown>;
  modelUsed?: string;
  analyzedAt: Date;
}

interface OptimizationRow {
  id: string;
  productId: string;
  trigger: string;
  status: string;
  suggestion: string;
  autoApply: boolean;
  createdAt: Date;
}

/** Minimal Prisma proxy: the subset our repository needs */
interface CommentPrismaProxy {
  comment: {
    findUnique(args: { where: Record<string, unknown> }): Promise<CommentRow | null>;
    findFirst(args: { select: Record<string, unknown> }): Promise<{ id: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<CommentRow>;
    findMany(args: {
      where: Record<string, unknown>;
      include?: Record<string, unknown>;
      orderBy?: Record<string, string>;
      cursor?: { id: string };
      take?: number;
      skip?: number;
    }): Promise<Array<CommentRow & { analysis?: AnalysisRow }>>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
  commentAnalysis: {
    create(args: { data: Record<string, unknown> }): Promise<AnalysisRow>;
    update(args: { where: { commentId: string }; data: Record<string, unknown> }): Promise<AnalysisRow>;
  };
  contentOptimization: {
    create(args: { data: Record<string, unknown> }): Promise<OptimizationRow>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, string>;
      take?: number;
    }): Promise<OptimizationRow[]>;
    findUnique(args: { where: { id: string } }): Promise<OptimizationRow | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<OptimizationRow>;
  };
}

// =============================================================================
// Input types for repository methods
// =============================================================================

interface CreateCommentInput {
  productId: string;
  platform: string;
  externalId: string;
  videoUrl?: string;
  authorName?: string;
  content: string;
  likeCount: number;
  replyCount: number;
  commentedAt?: Date;
}

interface CreateAnalysisInput {
  commentId: string;
  sentiment: string;
  keyTopics: string[];
  painPoints: string[];
  featureRequests: string[];
  purchasingIntent: number;
  rawAnalysis?: Record<string, unknown>;
  confidence: number;
  modelUsed?: string;
}

interface CreateOptimizationInput {
  productId: string;
  trigger: string;
  sourceAnalysisId?: string;
  currentScriptId?: string;
  optimizedScriptId?: string;
  triggerDetail: Record<string, unknown>;
  suggestion: string;
  autoApply: boolean;
}

@Injectable()
export class CommentRepository {
  private readonly logger = new Logger(CommentRepository.name);
  /** 运行时标记 Comment 表是否存在（未 prisma generate 时为 false） */
  private tablesChecked = false;
  private commentTableAvailable = true;

  /** Well-typed proxy for tables awaiting Prisma generation */
  private readonly proxy: CommentPrismaProxy;

  constructor(@InjectPrisma() prisma: PrismaClient) {
    this.proxy = prisma as unknown as CommentPrismaProxy;
    // 异步探测表是否存在（不阻塞构造）
    void this.ensureTableAvailable();
  }

  /** 运行时检查 Comment / CommentAnalysis 表是否存在 */
  private async ensureTableAvailable(): Promise<boolean> {
    if (this.tablesChecked) return this.commentTableAvailable;
    try {
      await this.proxy.comment.findFirst({ select: { id: true } } as any);
      this.commentTableAvailable = true;
    } catch (err) {
      this.commentTableAvailable = false;
      this.logger.warn(
        `[CommentRepository] Comment 表不可用（未执行 prisma generate 或 migration）: ${(err as Error)?.message || String(err)}`,
      );
    }
    this.tablesChecked = true;
    return this.commentTableAvailable;
  }

  // ========== Comment CRUD ==========

  async findCommentByExternalId(platform: string, externalId: string): Promise<CommentRow | null> {
    return this.proxy.comment.findUnique({
      where: { platform_externalId: { platform, externalId } },
    });
  }

  async createComment(input: CreateCommentInput): Promise<CommentRow> {
    return this.proxy.comment.create({ data: input as unknown as Record<string, unknown> });
  }

  async findCommentsWithoutAnalysis(productId: string, limit = 50): Promise<CommentRow[]> {
    return this.proxy.comment.findMany({
      where: { productId, analysis: null },
      orderBy: { likeCount: 'desc' },
      take: limit,
    });
  }

  async findCommentById(id: string): Promise<CommentRow | null> {
    return this.proxy.comment.findUnique({ where: { id } });
  }

  async findComments(params: {
    productId: string;
    sentiment?: string;
    cursor?: string;
    limit?: number;
  }): Promise<Array<CommentRow & { analysis: AnalysisRow }>> {
    const where: Record<string, unknown> = { productId: params.productId };
    if (params.sentiment) {
      where.analysis = { sentiment: params.sentiment };
    }

    return this.proxy.comment.findMany({
      where,
      include: { analysis: true },
      orderBy: { createdAt: 'desc' },
      cursor: params.cursor ? { id: params.cursor } : undefined,
      take: (params.limit || 20) + 1,
    }) as Promise<Array<CommentRow & { analysis: AnalysisRow }>>;
  }

  async countComments(productId: string, sentiment?: string): Promise<number> {
    const where: Record<string, unknown> = { productId };
    if (sentiment) {
      where.analysis = { sentiment };
    }
    return this.proxy.comment.count({ where });
  }

  // ========== CommentAnalysis CRUD ==========

  async createAnalysis(input: CreateAnalysisInput): Promise<AnalysisRow> {
    return this.proxy.commentAnalysis.create({ data: input as unknown as Record<string, unknown> });
  }

  async updateAnalysis(commentId: string, input: Partial<CreateAnalysisInput>): Promise<AnalysisRow> {
    return this.proxy.commentAnalysis.update({
      where: { commentId },
      data: input as unknown as Record<string, unknown>,
    });
  }

  async getSentimentSummary(productId: string): Promise<{
    total: number;
    positive_count: number;
    neutral_count: number;
    negative_count: number;
  }> {
    const [total, positive, neutral, negative] = await Promise.all([
      this.proxy.comment.count({ where: { productId, analysis: { isNot: null } } }),
      this.proxy.comment.count({ where: { productId, analysis: { sentiment: 'positive' } } }),
      this.proxy.comment.count({ where: { productId, analysis: { sentiment: 'neutral' } } }),
      this.proxy.comment.count({ where: { productId, analysis: { sentiment: 'negative' } } }),
    ]);

    return {
      total: total || 0,
      positive_count: positive || 0,
      neutral_count: neutral || 0,
      negative_count: negative || 0,
    };
  }

  async getAnalyzedComments(productId: string): Promise<Array<CommentRow & { analysis: AnalysisRow }>> {
    return this.proxy.comment.findMany({
      where: { productId, analysis: { isNot: null } },
      include: { analysis: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }) as Promise<Array<CommentRow & { analysis: AnalysisRow }>>;
  }

  // ========== ContentOptimization CRUD ==========

  async createOptimization(input: CreateOptimizationInput): Promise<OptimizationRow> {
    return this.proxy.contentOptimization.create({ data: input as unknown as Record<string, unknown> });
  }

  async findOptimizations(productId: string): Promise<OptimizationRow[]> {
    return this.proxy.contentOptimization.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async findOptimizationById(id: string): Promise<OptimizationRow | null> {
    return this.proxy.contentOptimization.findUnique({ where: { id } });
  }

  async updateOptimizationStatus(id: string, data: {
    status: string;
    optimizedScriptId?: string;
    appliedAt?: Date;
    appliedBy?: string;
    effectMetrics?: Record<string, unknown>;
  }): Promise<OptimizationRow> {
    return this.proxy.contentOptimization.update({
      where: { id },
      data: data as unknown as Record<string, unknown>,
    });
  }
}

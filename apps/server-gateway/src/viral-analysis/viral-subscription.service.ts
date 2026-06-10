// =============================================================================
// TikStream AI — Viral Subscription Service
// 爆款分析账号订阅与定时扫描
// =============================================================================

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@nestjs/prisma';

@Injectable()
export class ViralSubscriptionService {
  private readonly logger = new Logger(ViralSubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建爆款账号订阅
   */
  async createSubscription(dto: {
    platform: string;
    account_url: string;
    account_name?: string;
  }) {
    const subscription = await this.prisma.viralSubscription.create({
      data: {
        platform: dto.platform,
        accountUrl: dto.account_url,
        accountName: dto.account_name ?? null,
        isActive: true,
      },
    });
    return {
      subscription_id: subscription.id,
      platform: subscription.platform,
      account_url: subscription.accountUrl,
      account_name: subscription.accountName,
      is_active: subscription.isActive,
      created_at: subscription.createdAt.toISOString(),
    };
  }

  /**
   * 获取订阅列表
   */
  async listSubscriptions(page: number = 1, pageSize: number = 20) {
    const [items, total] = await Promise.all([
      this.prisma.viralSubscription.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.viralSubscription.count(),
    ]);
    return {
      items: items.map((s) => ({
        subscription_id: s.id,
        platform: s.platform,
        account_url: s.accountUrl,
        account_name: s.accountName,
        is_active: s.isActive,
        last_checked_at: s.lastCheckedAt?.toISOString() ?? null,
        created_at: s.createdAt.toISOString(),
      })),
      page,
      page_size: pageSize,
      total,
    };
  }

  /**
   * 获取单个订阅
   */
  async getSubscription(subscriptionId: string) {
    const s = await this.prisma.viralSubscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!s) throw new NotFoundException('订阅记录不存在');
    return {
      subscription_id: s.id,
      platform: s.platform,
      account_url: s.accountUrl,
      account_name: s.accountName,
      is_active: s.isActive,
      last_checked_at: s.lastCheckedAt?.toISOString() ?? null,
      created_at: s.createdAt.toISOString(),
      updated_at: s.updatedAt.toISOString(),
    };
  }

  /**
   * 取消订阅（软删除：标记 is_active = false）
   */
  async cancelSubscription(subscriptionId: string) {
    const s = await this.prisma.viralSubscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!s) throw new NotFoundException('订阅记录不存在');
    await this.prisma.viralSubscription.update({
      where: { id: subscriptionId },
      data: { isActive: false },
    });
    return {
      subscription_id: s.id,
      platform: s.platform,
      account_url: s.accountUrl,
      account_name: s.accountName,
      is_active: false,
      last_checked_at: s.lastCheckedAt?.toISOString() ?? null,
      created_at: s.createdAt.toISOString(),
    };
  }

  /**
   * 重新激活订阅
   */
  async reactivateSubscription(subscriptionId: string) {
    const s = await this.prisma.viralSubscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!s) throw new NotFoundException('订阅记录不存在');
    await this.prisma.viralSubscription.update({
      where: { id: subscriptionId },
      data: { isActive: true },
    });
    return {
      subscription_id: s.id,
      platform: s.platform,
      account_url: s.accountUrl,
      account_name: s.accountName,
      is_active: true,
      last_checked_at: s.lastCheckedAt?.toISOString() ?? null,
      created_at: s.createdAt.toISOString(),
    };
  }

  /**
   * 立即扫描指定订阅的账号最新视频
   *
   * 当前版本为预留接口骨架：
   * 平台 API 直接抓取需要对应平台的 API Token（TikTok Research API / YouTube Data API v3），
   * 并且大部分平台对批量抓取有严格限制。
   * 本方法标记 last_checked_at 时间戳并记录日志，实际 API 对接留待后续版本。
   */
  async scanNow(subscriptionId: string) {
    const s = await this.prisma.viralSubscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!s) throw new NotFoundException('订阅记录不存在');

    // 更新检查时间
    await this.prisma.viralSubscription.update({
      where: { id: subscriptionId },
      data: { lastCheckedAt: new Date() },
    });

    this.logger.log(
      `[ViralSubscription] Scan triggered for ${s.platform}:${s.accountName || s.accountUrl} — ` +
      `Full API integration pending (requires platform API tokens)`,
    );

    return {
      subscription_id: subscriptionId,
      platform: s.platform,
      status: 'SCAN_SCHEDULED',
      message: `扫描已触发。当前版本为手动导入模式，完整 API 自动抓取需接入平台 API Token 后启用。`,
      last_checked_at: new Date().toISOString(),
      new_videos_found: 0,
    };
  }

  /**
   * 定时扫描所有活跃订阅（每日凌晨2点执行）
   * 使用 PostgreSQL advisory lock 防止多实例并发
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledScan(): Promise<void> {
    const LOCK_ID = 173849201; // 固定 magic number 作为顾问锁 key

    // 尝试获取分布式锁（非阻塞），失败说明其他实例正在执行
    const lockResult = await this.prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
      `SELECT pg_try_advisory_lock(${LOCK_ID}) AS "locked"`,
    );
    const acquired = lockResult?.[0]?.locked ?? false;

    if (!acquired) {
      this.logger.log('[ViralSubscription] Another instance is running the scheduled scan, skipping');
      return;
    }

    try {
      this.logger.log('[ViralSubscription] Starting daily scheduled scan...');

      const subscriptions = await this.prisma.viralSubscription.findMany({
        where: { isActive: true },
      });

      if (subscriptions.length === 0) {
        this.logger.log('[ViralSubscription] No active subscriptions found, skipping scan');
        return;
      }

      this.logger.log(`[ViralSubscription] Found ${subscriptions.length} active subscriptions`);

      // 批量更新 lastCheckedAt（消除串行更新瓶颈）
      const subscriptionIds = subscriptions.map((s) => s.id);
      await this.prisma.viralSubscription.updateMany({
        where: { id: { in: subscriptionIds } },
        data: { lastCheckedAt: new Date() },
      });

      for (const sub of subscriptions) {
        this.logger.log(
          `[ViralSubscription] Scanned ${sub.platform}:${sub.accountName || sub.accountUrl} — ` +
          `(API integration pending)`,
        );
      }

      this.logger.log('[ViralSubscription] Daily scheduled scan completed');
    } catch (err) {
      this.logger.error(
        `[ViralSubscription] Scheduled scan failed: ${(err as Error)?.message ?? String(err)}`,
      );
    } finally {
      // 释放顾问锁
      await this.prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${LOCK_ID})`);
    }
  }
}

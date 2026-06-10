import { Injectable, Logger } from '@nestjs/common';

export interface TikTokComment {
  externalId: string;
  content: string;
  authorName: string;
  likeCount: number;
  replyCount: number;
  commentedAt: string; // ISO 8601
}

export interface FetchResult {
  comments: TikTokComment[];
  hasMore: boolean;
  nextCursor?: string;
}

@Injectable()
export class TikTokCommentClient {
  private readonly logger = new Logger(TikTokCommentClient.name);

  /**
   * 从视频 URL 获取评论
   * MVP 阶段：Mock 模式返回模拟数据
   * 生产就绪后接入 TikTok Research API
   */
  async fetchComments(
    videoUrl: string,
    maxCount: number = 50,
    mode: 'mock' | 'csv_import' | 'tiktok_api' = 'mock',
  ): Promise<FetchResult> {
    switch (mode) {
      case 'mock':
        return this.fetchMockComments(videoUrl, maxCount);
      case 'csv_import':
        this.logger.warn('CSV import mode not yet implemented, falling back to mock');
        return this.fetchMockComments(videoUrl, maxCount);
      case 'tiktok_api':
        this.logger.warn('TikTok Research API not yet integrated, falling back to mock');
        return this.fetchMockComments(videoUrl, maxCount);
      default:
        return this.fetchMockComments(videoUrl, maxCount);
    }
  }

  /**
   * Mock 评论生成（模拟 TikTok 电商评论区）
   * 后续生产环境替换为 TikTok Research API: GET /v2/research/video/comments
   */
  private async fetchMockComments(
    videoUrl: string,
    maxCount: number,
  ): Promise<FetchResult> {
    this.logger.log(`[MOCK] Fetching comments for video: ${videoUrl}, max: ${maxCount}`);

    // 模拟网络延迟
    await this.delay(300 + Math.random() * 700);

    const baseComments: Array<Omit<TikTokComment, 'commentedAt'>> = [
      // ===== 正面评论（12条） =====
      { externalId: 'cmt_mock_001', content: '这个产品看起来不错！性价比很高，准备入手', authorName: 'shopaholic_amy', likeCount: 42, replyCount: 3 },
      { externalId: 'cmt_mock_002', content: '已经下单了，期待收货！看视频展示效果很好', authorName: 'newbuyer_tom', likeCount: 28, replyCount: 1 },
      { externalId: 'cmt_mock_007', content: '比我在实体店买的便宜一半，太划算了', authorName: 'dealhunter_li', likeCount: 51, replyCount: 3 },
      { externalId: 'cmt_mock_011', content: '太好用了！已经推荐给朋友了，她也下单了', authorName: 'happy_customer', likeCount: 35, replyCount: 0 },
      { externalId: 'cmt_mock_012', content: '视频拍得真好，产品展示很清楚，看完就心动了', authorName: 'video_fan', likeCount: 22, replyCount: 0 },
      { externalId: 'cmt_mock_015', content: '用了一个月了，效果很好！会回购', authorName: 'loyal_user', likeCount: 48, replyCount: 4 },
      { externalId: 'cmt_mock_016', content: '包装非常精美，送人很有面子', authorName: 'gift_giver', likeCount: 31, replyCount: 2 },
      { externalId: 'cmt_mock_017', content: '客服态度超好，有问题秒回，必须好评', authorName: 'service_lover', likeCount: 56, replyCount: 7 },
      { externalId: 'cmt_mock_018', content: '第二次购买了，品质一如既往地好', authorName: 'repeat_buyer', likeCount: 39, replyCount: 1 },
      { externalId: 'cmt_mock_019', content: '材质手感很好，比想象中还要高级', authorName: 'quality_seeker', likeCount: 27, replyCount: 3 },
      { externalId: 'cmt_mock_020', content: '物流超快！昨天下单今天就到了，惊喜', authorName: 'fast_delivery', likeCount: 44, replyCount: 5 },
      { externalId: 'cmt_mock_021', content: '这个价格能买到这个质量，真的很值', authorName: 'value_buyer', likeCount: 33, replyCount: 2 },

      // ===== 中性/疑问评论（10条） =====
      { externalId: 'cmt_mock_003', content: '颜色选择太少了，希望有更多颜色可选', authorName: 'color_lover', likeCount: 15, replyCount: 2 },
      { externalId: 'cmt_mock_004', content: '质量怎么样？用过的朋友说说真实感受', authorName: 'cautious_buyer', likeCount: 33, replyCount: 5 },
      { externalId: 'cmt_mock_005', content: '运费多少？包邮吗？能送到农村吗', authorName: 'rural_shopper', likeCount: 8, replyCount: 1 },
      { externalId: 'cmt_mock_008', content: '有尺码表吗？不确定买什么号，求建议', authorName: 'sizing_confused', likeCount: 11, replyCount: 2 },
      { externalId: 'cmt_mock_013', content: '支持货到付款吗？不太敢在线支付', authorName: 'cod_fan', likeCount: 6, replyCount: 1 },
      { externalId: 'cmt_mock_014', content: '有没有适合送礼的精美包装版本？', authorName: 'gift_planner', likeCount: 13, replyCount: 2 },
      { externalId: 'cmt_mock_022', content: '和XX品牌比哪个更好？有没有对比测评', authorName: 'compare_shopper', likeCount: 24, replyCount: 6 },
      { externalId: 'cmt_mock_023', content: '适合敏感肌用吗？成分安全吗', authorName: 'skincare_fan', likeCount: 18, replyCount: 3 },
      { externalId: 'cmt_mock_024', content: '电池续航怎么样？能用多久', authorName: 'tech_user', likeCount: 12, replyCount: 2 },
      { externalId: 'cmt_mock_025', content: '操作复杂吗？老年人能用吗', authorName: 'elder_care', likeCount: 21, replyCount: 4 },

      // ===== 负面/投诉评论（13条） =====
      { externalId: 'cmt_mock_006', content: '垃圾产品，用了两天就坏了，太失望了', authorName: 'angry_buyer', likeCount: 67, replyCount: 12 },
      { externalId: 'cmt_mock_009', content: '发货速度太慢了，等了一周还没到，催了好几次', authorName: 'impatient_customer', likeCount: 44, replyCount: 8 },
      { externalId: 'cmt_mock_010', content: '能加个收纳盒配件吗？散落得到处都是', authorName: 'organizer', likeCount: 19, replyCount: 1 },
      { externalId: 'cmt_mock_026', content: '收到货发现包装破损，里面的东西都变形了', authorName: 'damaged_goods', likeCount: 53, replyCount: 9 },
      { externalId: 'cmt_mock_027', content: '实物和视频里展示的完全不一样，色差太大了', authorName: 'misled_buyer', likeCount: 71, replyCount: 15 },
      { externalId: 'cmt_mock_028', content: '用了之后过敏了，成分表不透明，不敢再用了', authorName: 'allergy_sufferer', likeCount: 38, replyCount: 6 },
      { externalId: 'cmt_mock_029', content: '价格波动太大，刚买就降价了，心态崩了', authorName: 'price_victim', likeCount: 29, replyCount: 4 },
      { externalId: 'cmt_mock_030', content: '退货流程太麻烦了，客服一直踢皮球', authorName: 'return_hell', likeCount: 46, replyCount: 11 },
      { externalId: 'cmt_mock_031', content: '噪音太大了，晚上根本没法用，设计缺陷', authorName: 'noise_hater', likeCount: 35, replyCount: 7 },
      { externalId: 'cmt_mock_032', content: '用了一个月就开始掉漆，质量堪忧', authorName: 'peeling_issue', likeCount: 41, replyCount: 5 },
      { externalId: 'cmt_mock_033', content: '说明书全是英文的，根本看不懂怎么用', authorName: 'confused_user', likeCount: 17, replyCount: 3 },
      { externalId: 'cmt_mock_034', content: '买了三个，其中一个明显是用过的二手货', authorName: 'used_item', likeCount: 62, replyCount: 13 },
      { externalId: 'cmt_mock_035', content: '功能太少了，这个价位应该有更多功能', authorName: 'feature_hungry', likeCount: 25, replyCount: 2 },
    ];

    // 随机打乱并添加时间戳、随机化点赞数
    const shuffled = [...baseComments].sort(() => Math.random() - 0.5);
    const comments: TikTokComment[] = shuffled.slice(0, Math.min(maxCount, shuffled.length)).map((c, i) => ({
      ...c,
      likeCount: Math.max(1, c.likeCount + Math.floor(Math.random() * 20 - 10)),
      commentedAt: new Date(Date.now() - (i + 1) * 1800000 * (0.5 + Math.random())).toISOString(),
    }));

    return { comments, hasMore: maxCount > baseComments.length ? false : comments.length < baseComments.length };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

"use strict";
// =============================================================================
// TikStream AI — Posting Time Service (PATCHED WITH DEBUG LOGGING)
// =============================================================================
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {      
    return function (target, key) { decorator(target, key, paramIndex); }       
};
var PostingTimeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostingTimeService = void 0;
const common_1 = require("@nestjs/common");
const prisma_1 = require("@nestjs/prisma");
const posting_time_constants_1 = require("./posting-time.constants");

let PostingTimeService = PostingTimeService_1 = class PostingTimeService {      
    prisma;
    logger = new common_1.Logger(PostingTimeService_1.name);
    cache = new Map();
    constructor(prisma) {
        this.prisma = prisma;
        console.error('[POSTING-TIME-DEBUG] Constructor called, prisma type:', typeof prisma, 'isValid:', !!prisma, 'keys:', prisma ? Object.keys(prisma).join(',') : 'NULL');
    }

    async optimize(dto) {
        console.error('[POSTING-TIME-DEBUG] optimize called, this.prisma type:', typeof this.prisma, 'isValid:', !!this.prisma);
        if (!this.prisma) {
            throw new Error('Prisma client is not initialized! this.prisma = ' + this.prisma);
        }
        console.error('[POSTING-TIME-DEBUG] this.prisma.product type:', typeof this.prisma.product);
        const platform = dto.platform || posting_time_constants_1.DEFAULT_PLATFORM;
        const cacheKey = `${dto.product_id}:${platform}:${dto.content_type ?? 'any'}`;

        if (!dto.force_refresh) {
            const cached = this.cache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                this.logger.log(`[PostingTime] Cache hit: ${cacheKey}`);        
                return cached.result;
            }
        }

        const platformData = posting_time_constants_1.PLATFORM_GOLDEN_HOURS.find((p) => p.platform === platform);
        if (!platformData) {
            throw new common_1.HttpException(`不支持的平台: ${platform}，可用平台: ${posting_time_constants_1.PLATFORM_GOLDEN_HOURS.map((p) => p.platform).join(', ')}`, common_1.HttpStatus.BAD_REQUEST);
        }

        console.error('[POSTING-TIME-DEBUG] About to query product with id:', dto.product_id);
        console.error('[POSTING-TIME-DEBUG] this.prisma keys:', Object.keys(this.prisma).join(','));
        const product = await this.prisma.product.findUnique({
            where: { id: dto.product_id },
            select: { id: true, category: true, targetAudience: true, title: true },
        });
        console.error('[POSTING-TIME-DEBUG] Query result:', product ? 'FOUND' : 'NOT FOUND');

        if (!product) {
            throw new common_1.HttpException(`商品不存在: ${dto.product_id}`, common_1.HttpStatus.NOT_FOUND);
        }

        const slots = platformData.weekdays;
        const weekendSlots = platformData.weekends;
        const adjustments = this.matchCategoryAdjustments(product.category ?? '');
        const recommendations = this.buildRecommendations(platformData, slots, adjustments, product.category ?? '');
        const weekendRecommendations = this.buildRecommendations(platformData, weekendSlots, adjustments, product.category ?? '').map((s) => ({ ...s, day_of_week: this.isWeekendDay(s.day_of_week) ? s.day_of_week : `${s.day_of_week}（周末）` }));
        const allRecommendations = [...recommendations, ...weekendRecommendations]
            .sort((a, b) => b.score - a.score)
            .slice(0, 6);
        const avoidSlots = this.buildAvoidSlots(platform);
        const bestScore = allRecommendations.length > 0 ? allRecommendations[0].score : 50;
        const result = {
            product_id: dto.product_id,
            platform,
            content_type: dto.content_type,
            recommendations: allRecommendations,
            avoid_slots: avoidSlots,
            baseline_ctr: 0.05,
            expected_ctr_lift: Math.round((bestScore - 50) / 100 * 100) / 100,  
            data_source: 'INDUSTRY_HEURISTIC',
            generated_at: new Date().toISOString(),
        };
        this.cache.set(cacheKey, {
            result,
            expiresAt: Date.now() + posting_time_constants_1.POSTING_TIME_CACHE_TTL_MS,
        });
        this.logger.log(`[PostingTime] product=${dto.product_id} platform=${platform} category=${product.category} → ${allRecommendations.length} slots`);      
        return result;
    }
    getSupportedPlatforms() {
        return posting_time_constants_1.PLATFORM_GOLDEN_HOURS.map((p) => ({     
            platform: p.platform,
            display_name: p.display_name,
            timezone: p.timezone,
        }));
    }
    buildRecommendations(platform, slots, adjustments, category) {
        const days = ['周一', '周二', '周三', '周四', '周五'];
        const results = [];
        for (const slot of slots) {
            const baseScore = slot.base_score;
            let adjustedScore = baseScore;
            let adjustmentNote = '';
            if (adjustments) {
                const hour = parseInt(slot.start.split(':')[0], 10);
                if (hour >= 6 && hour < 11) {
                    adjustedScore += adjustments.morning * 100;
                    adjustmentNote = '（品类晨间加成）';
                }
                else if (hour >= 11 && hour < 15) {
                    adjustedScore += adjustments.noon * 100;
                    adjustmentNote = '（品类午间加成）';
                }
                else if (hour >= 15 && hour < 24) {
                    adjustedScore += adjustments.evening * 100;
                    adjustmentNote = '（品类晚间加成）';
                }
            }
            const finalScore = Math.round(Math.min(100, Math.max(0, adjustedScore)));
            const ctrBoost = Math.round(((finalScore - 50) / 100) * 100) / 100; 
            for (const day of days) {
                results.push({
                    day_of_week: day,
                    time_range: { start: slot.start, end: slot.end },
                    score: finalScore,
                    expected_ctr_boost: Math.max(0, ctrBoost),
                    competition_level: slot.competition,
                    audience_activity: slot.audience_activity,
                    reasoning: `${platform.display_name}${slot.label}时段：${slot.audience_note}。${adjustmentNote ? `品类匹配度：${category}${adjustmentNote}` : ''}`,
                });
            }
        }
        return results;
    }
    buildAvoidSlots(platform) {
        const avoids = [];
        for (const rule of posting_time_constants_1.COMPETITION_RULES) {        
            if (!rule.affected_platforms.includes(platform))
                continue;
            if (rule.competition_factor >= 0.75) {
                avoids.push({
                    reason: rule.description,
                    time_range: { ...rule.time_slots },
                    severity: 'must_avoid',
                });
            }
            else if (rule.competition_factor >= 0.55) {
                avoids.push({
                    reason: rule.description,
                    time_range: { ...rule.time_slots },
                    severity: 'suggest_avoid',
                });
            }
        }
        return avoids;
    }
    matchCategoryAdjustments(category) {
        if (!category)
            return null;
        const lowerCategory = category.toLowerCase();
        for (const adj of posting_time_constants_1.CATEGORY_TIMING_ADJUSTMENTS) {
            for (const keyword of adj.category_keywords) {
                if (lowerCategory.includes(keyword.toLowerCase())) {
                    this.logger.debug(`[PostingTime] Category "${category}" matched: "${keyword}"`);
                    return {
                        morning: adj.morning_boost,
                        noon: adj.noon_boost,
                        evening: adj.evening_boost,
                        weekend: adj.weekend_boost,
                    };
                }
            }
        }
        return null;
    }
    isWeekendDay(day) {
        return day.includes('周末') || day.includes('周六') || day.includes('周日');
    }
};
exports.PostingTimeService = PostingTimeService;
exports.PostingTimeService = PostingTimeService = PostingTimeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, prisma_1.InjectPrisma)()),
    __metadata("design:paramtypes", [Function])
], PostingTimeService);

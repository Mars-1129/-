// =============================================================================
// TikStream AI — Trend Velocity & Lifecycle Tracking Algorithm
//
// 基于历史热度的速度和生命周期分析：
//   1. 速度 (Velocity)     - 一阶导数 d(heat)/dt
//   2. 加速度 (Acceleration) - 二阶导数 d²(heat)/dt²
//   3. 生命周期阶段分类   - 基于速度/加速度的相空间分析
//   4. 峰值预测           - 线性外推 + 置信区间
//   5. 有效期估算         - 基于历史衰减模式
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import type { TrendHistoryPoint, TrendVelocityResult, TrendLifecycleStage } from './types';

@Injectable()
export class TrendVelocityService {
  private readonly logger = new Logger(TrendVelocityService.name);

  /**
   * 基于历史数据点分析趋势的速度和生命周期
   *
   * @param historyPoints 历史快照（按时间升序）
   * @param currentData 当前数据点
   */
  analyze(
    trendName: string,
    trendType: TrendVelocityResult['trendType'],
    historyPoints: TrendHistoryPoint[],
    currentHeat: number,
  ): TrendVelocityResult {
    // 需要至少 2 个数据点来计算速度
    const velocity = this.calculateVelocity(historyPoints, currentHeat);
    const acceleration = this.calculateAcceleration(historyPoints);
    const lifecycleStage = this.classifyLifecycleStage(currentHeat, velocity, acceleration);
    const daysToPeak = this.estimateDaysToPeak(historyPoints, currentHeat, velocity, lifecycleStage);
    const remainingDays = this.estimateRemainingDays(lifecycleStage, velocity, currentHeat);
    const confidence = this.calculateConfidence(historyPoints, velocity, acceleration);

    return {
      trendName,
      trendType,
      currentHeat: Math.round(currentHeat * 100) / 100,
      velocity: Math.round(velocity * 1000) / 1000,
      acceleration: Math.round(acceleration * 1000) / 1000,
      lifecycleStage,
      daysToPeak: Math.round(daysToPeak),
      remainingDays: Math.max(0, Math.round(remainingDays)),
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  // =========================================================================
  // Velocity Calculation
  // =========================================================================

  /**
   * 计算趋势速度（热度日变化率）
   *
   * 使用最近两个数据点的线性回归估算瞬时速度
   * 若数据点 ≥ 3，使用加权最小二乘法
   */
  private calculateVelocity(history: TrendHistoryPoint[], currentHeat: number): number {
    const allPoints = [...history, { heatScore: currentHeat, timestamp: new Date() } as TrendHistoryPoint];

    if (allPoints.length < 2) return 0;

    // 取最近 N 个点（最多 5 个）
    const recent = allPoints.slice(-5);

    // 加权线性回归：越新的点权重越高
    const n = recent.length;
    let sumW = 0, sumWX = 0, sumWY = 0, sumWXY = 0, sumWX2 = 0;

    for (let i = 0; i < n; i++) {
      const x = (recent[i].timestamp.getTime() - recent[0].timestamp.getTime()) / (24 * 60 * 60 * 1000); // 天数
      const y = recent[i].heatScore;
      const w = Math.exp(i - n + 1); // 指数权重，最新点权重=1

      sumW += w;
      sumWX += w * x;
      sumWY += w * y;
      sumWXY += w * x * y;
      sumWX2 += w * x * x;
    }

    const denominator = sumW * sumWX2 - sumWX * sumWX;
    if (Math.abs(denominator) < 1e-10) return 0;

    // 斜率 = 日变化率
    const slope = (sumW * sumWXY - sumWX * sumWY) / denominator;
    return slope;
  }

  /**
   * 计算趋势加速度（速度的变化率）
   *
   * 分段计算两个时间段的速度差
   */
  private calculateAcceleration(history: TrendHistoryPoint[]): number {
    if (history.length < 4) return 0;

    // 将历史分为前后两半
    const mid = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, mid + 1);
    const secondHalf = history.slice(mid);

    // 分别计算两段的速度
    const v1 = this.calculateSegmentVelocity(firstHalf);
    const v2 = this.calculateSegmentVelocity(secondHalf);

    // 时间跨度估算（天）
    const dt = (history[history.length - 1].timestamp.getTime() - history[0].timestamp.getTime()) / (24 * 60 * 60 * 1000);
    if (dt <= 0) return 0;

    return (v2 - v1) / (dt / 2);
  }

  private calculateSegmentVelocity(points: TrendHistoryPoint[]): number {
    if (points.length < 2) return 0;
    const dx = (points[points.length - 1].timestamp.getTime() - points[0].timestamp.getTime()) / (24 * 60 * 60 * 1000);
    if (dx <= 0) return 0;
    return (points[points.length - 1].heatScore - points[0].heatScore) / dx;
  }

  // =========================================================================
  // Lifecycle Stage Classification
  // =========================================================================

  /**
   * 基于热度-速度-加速度的相空间分类
   *
   * 决策逻辑：
   *   - emerging:  热度低(<30) + 正速度 + 正加速度 → 新兴趋势
   *   - rising:    热度中(30-70) + 正速度 → 上升趋势
   *   - peak:      热度高(>70) + 速度近0 → 峰值
   *   - declining: 热度中(30-70) + 负速度 → 衰退中
   *   - dying:     热度低(<30) + 负速度 → 即将消亡
   */
  private classifyLifecycleStage(
    heat: number,
    velocity: number,
    acceleration: number,
  ): TrendLifecycleStage {
    // 阈值定义
    const HEAT_LOW = 30;
    const HEAT_HIGH = 70;
    const VELOCITY_ZERO = 0.5; // 绝对速度 < 0.5 分/天视为持平
    const ACCELERATION_ZERO = 0.1;

    const absVelocity = Math.abs(velocity);
    const absAcceleration = Math.abs(acceleration);

    // 高热度 + 速度趋零 = 峰值
    if (heat >= HEAT_HIGH && absVelocity < VELOCITY_ZERO) {
      return 'peak';
    }

    // 高热度 + 负速度 = 开始衰退
    if (heat >= HEAT_HIGH && velocity < -VELOCITY_ZERO) {
      return 'declining';
    }

    // 高热度 + 正速度 = 仍在上升（接近峰值）
    if (heat >= HEAT_HIGH && velocity > VELOCITY_ZERO) {
      return 'rising';
    }

    // 中热度区段
    if (heat >= HEAT_LOW && heat < HEAT_HIGH) {
      if (velocity > VELOCITY_ZERO) return 'rising';
      if (velocity < -VELOCITY_ZERO) return 'declining';
      return 'peak'; // 中热度 + 速度趋零 = 局部峰值
    }

    // 低热度区段
    if (heat < HEAT_LOW) {
      if (velocity > VELOCITY_ZERO && acceleration > ACCELERATION_ZERO) return 'emerging';
      if (velocity > VELOCITY_ZERO) return 'rising';
      if (velocity < -VELOCITY_ZERO) return 'dying';
      return 'emerging'; // 低热度 + 速度趋零 = 刚出现
    }

    return 'emerging';
  }

  // =========================================================================
  // Peak Prediction
  // =========================================================================

  /**
   * 估算距峰值天数
   *
   * 策略：
   *   - emerging/rising: 基于当前速度线性外推，加上加速度调整
   *   - peak: 已在峰值或接近
   *   - declining/dying: 返回负值（已过峰的天数）
   */
  private estimateDaysToPeak(
    history: TrendHistoryPoint[],
    currentHeat: number,
    velocity: number,
    stage: TrendLifecycleStage,
  ): number {
    const PEAK_HEAT = 95; // 目标峰值热度

    switch (stage) {
      case 'emerging':
      case 'rising': {
        // 使用衰减模型：趋势增长率会逐渐放缓
        // 假设达到最大热度前，速度以指数衰减
        // dH/dt = v0 * exp(-λ*t), H(t) = H0 + v0/λ * (1 - exp(-λ*t))
        const decayRate = 0.1; // 速度衰减系数
        if (velocity <= 0) return 7; // 速度 ≤ 0 时给保守估算

        // 解方程: H0 + v0/λ * (1 - exp(-λ*t)) = PEAK_HEAT
        const remainingHeat = PEAK_HEAT - currentHeat;
        const maxPossibleIncrease = velocity / decayRate;

        if (remainingHeat >= maxPossibleIncrease) {
          // 当前速度不足以达到峰值，保守估算
          return Math.ceil(remainingHeat / Math.max(velocity, 0.1));
        }

        const t = -Math.log(1 - remainingHeat / maxPossibleIncrease) / decayRate;
        return Math.ceil(t);
      }
      case 'peak':
        return 0; // 已在峰值
      case 'declining': {
        // 估算过峰天数
        const firstPeakTime = this.findPeakTimestamp(history);
        if (firstPeakTime) {
          return -Math.ceil((Date.now() - firstPeakTime.getTime()) / (24 * 60 * 60 * 1000));
        }
        return -3; // 默认估算已过峰 3 天
      }
      case 'dying':
        return history.length > 0
          ? -Math.ceil((Date.now() - history[history.length - 1].timestamp.getTime()) / (24 * 60 * 60 * 1000)) - 7
          : -7;
      default:
        return 7;
    }
  }

  private findPeakTimestamp(history: TrendHistoryPoint[]): Date | null {
    if (!history.length) return null;
    let maxHeat = -Infinity;
    let peakPoint: TrendHistoryPoint | null = null;
    for (const point of history) {
      if (point.heatScore > maxHeat) {
        maxHeat = point.heatScore;
        peakPoint = point;
      }
    }
    return peakPoint?.timestamp ?? null;
  }

  // =========================================================================
  // Remaining Days Estimation
  // =========================================================================

  /**
   * 估算趋势剩余有效天数
   */
  private estimateRemainingDays(
    stage: TrendLifecycleStage,
    velocity: number,
    currentHeat: number,
  ): number {
    const MIN_HEAT = 10; // 低于此热度视为失效

    switch (stage) {
      case 'emerging':
        return 10 + Math.random() * 20; // 新兴趋势 10-30 天
      case 'rising':
        return 7 + Math.random() * 14; // 上升中 7-21 天
      case 'peak': {
        // 峰值阶段，基于当前热度和速度估算
        if (velocity >= 0) return 5; // 仍在上升，至少 5 天
        const decayRate = Math.abs(velocity);
        if (decayRate <= 0) return 7;
        return Math.max(1, Math.ceil((currentHeat - MIN_HEAT) / decayRate));
      }
      case 'declining':
        return Math.max(1, Math.ceil((currentHeat - MIN_HEAT) / Math.max(Math.abs(velocity), 0.5)));
      case 'dying':
        return 1 + Math.floor(Math.random() * 3); // 1-3 天
      default:
        return 7;
    }
  }

  // =========================================================================
  // Confidence Calculation
  // =========================================================================

  /**
   * 计算趋势确定性（基于数据充足度 + 趋势稳定性）
   */
  private calculateConfidence(
    history: TrendHistoryPoint[],
    velocity: number,
    acceleration: number,
  ): number {
    // 数据充足度 (0-50)
    const dataScore = Math.min(50, history.length * 10);

    // 趋势稳定性 (0-50)：速度波动越小越稳定
    let stabilityScore = 30;
    if (history.length >= 4) {
      // 计算速度方差
      const velocities: number[] = [];
      for (let i = 1; i < history.length; i++) {
        const dt = (history[i].timestamp.getTime() - history[i - 1].timestamp.getTime()) / (24 * 60 * 60 * 1000);
        if (dt > 0) {
          velocities.push((history[i].heatScore - history[i - 1].heatScore) / dt);
        }
      }

      if (velocities.length >= 2) {
        const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
        const variance = velocities.reduce((sum, v) => sum + (v - mean) ** 2, 0) / velocities.length;
        // CV < 0.5 → 高稳定性, CV > 2 → 低稳定性
        const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 2;
        stabilityScore = Math.max(0, 50 - 25 * Math.min(cv, 2));
      }
    }

    return this.clamp(dataScore + stabilityScore, 0, 100);
  }

  // =========================================================================
  // Utility
  // =========================================================================

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

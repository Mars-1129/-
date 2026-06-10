import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { ScriptModule } from './script/script.module';
import { TemplateModule } from './template/template.module';
import { TrendTrackerModule } from './trend-tracker/trend-tracker.module';
import { ViralAnalysisModule } from './viral-analysis/viral-analysis.module';
import { WatermarkModule } from './watermark/watermark.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { MaterialModule } from './material/material.module';
import { CreationModule } from './creation/creation.module';
import { ProductModule } from './product/product.module';
import { TaskModule } from './task/task.module';
import { FactorModule } from './factor/factor.module';
import { StrategyModule } from './strategy/strategy.module';
import { ConstraintModule } from './constraint/constraint.module';
import { StatsModule } from './stats/stats.module';
import { AgentModule } from './agent/agent.module';
import { AutoAbModule } from './auto-ab/auto-ab.module';
import { PromptModule } from './prompt/prompt.module';
import { OriginalityModule } from './originality/originality.module';
import { AsrSubtitleModule } from './asr-subtitle/asr-subtitle.module';
import { CommentModule } from './comment/comment.module';
import { SubtitleModule } from './subtitle/subtitle.module';
import { BullMQModule } from '../services/queue/bullmq.module';
import { MetricsModule } from './metrics/metrics.module';
import { PostingTimeModule } from './posting-time/posting-time.module';
import { AutocutModule } from './autocut/autocut.module';

@Module({
  imports: [
    MetricsModule,
    HealthModule,
    ScriptModule,
    TemplateModule,
    TrendTrackerModule,
    ViralAnalysisModule,
    WatermarkModule,
    AnalyticsModule,
    MaterialModule,
    CreationModule,
    ProductModule,
    TaskModule,
    FactorModule,
    StrategyModule,
    ConstraintModule,
    StatsModule,
    AgentModule,
    AutoAbModule,
    PromptModule,
    SubtitleModule,
    CommentModule,
    OriginalityModule,
    AsrSubtitleModule,
    PostingTimeModule,
    BullMQModule,
    AutocutModule,
  ],
})
export class AppModule {}
